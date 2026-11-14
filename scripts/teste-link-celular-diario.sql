-- scripts/teste-link-celular-diario.sql
-- Prova do link do celular — Diário de Obras
-- (docs/planos/2026-11-11-link-celular-tarefas-diario.md, Parte 2).
--
--   Seção A — núcleo do Diário com ator explícito (_diary_upsert_core /
--             _diary_delete_core, fn_pode_aprovar_diario_de) e regressão do app
--             logado: diary_upsert_entry / diary_delete_entry mantêm o que o
--             membro grava, a recusa ao não membro, o diário de organization_id
--             NULL, a trava de aprovação e o gatilho de settings.diaryEntries;
--             os dois núcleos chamados direto (5b/5c) decidem pelo p_ator, não
--             pelas claims da sessão.
--   Seção B — RPCs do Diário pelo link (celular_*), chamadas como anon só com o
--             token: lista e abertura presas à org do link, gravação pelo
--             núcleo com o dono do link como ator, efetivo, planejamento (D4,
--             evolução só em manualRealPct) e mídia (D7).
--   Seção C — limite de uso por link (aplicar_20271112990000): subir 120/hora,
--             assinar 600/hora, estouro 54000, um link não afeta o outro; e o
--             IS NOT TRUE das checagens de planejamento.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-diario.sql
--
-- Para ensaiar as migrations ANTES de aplicá-las, gere um arquivo com o conteúdo
-- delas, nesta ordem, no lugar da linha MIGRATION abaixo:
--   aplicar_20271112950000_diario_nucleo_com_ator.sql
--   aplicar_20271112960000_link_celular_rpcs_diario.sql
-- Sem a primeira, a regressão (1–5) passa igual — é o comportamento de hoje — e a
-- prova falha em "function public.fn_pode_aprovar_diario_de(uuid, uuid) does not
-- exist". Só com a primeira, a seção A passa e a B falha em
-- "function public.celular_diarios_listar(unknown) does not exist".
--
-- Com as duas acima JÁ APLICADAS (2026-11-12), o ensaio do limite de uso põe
-- no lugar da linha MIGRATION só:
--   aplicar_20271112990000_link_celular_limite_de_uso.sql
-- Sem ela, as seções A e B passam e a C falha em
-- relation "public.user_mobile_link_uso" does not exist (42P01).

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Claims de um usuário real (sub + e-mail de auth.users), como o PostgREST monta.
CREATE FUNCTION pg_temp.claims(p_user UUID, p_papel TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
                ELSE json_build_object('sub', p_user,
                                       'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                                       'role', p_papel)::text END
$$;

-- Roda p_sql como p_papel (anon/authenticated) com as claims de p_user e devolve
-- 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'. A troca de papel acontece AQUI
-- dentro (chamada como postgres) e o RESET ROLE volta sempre — inclusive no erro,
-- porque o SET LOCAL do subbloco abortado é desfeito junto.
CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', pg_temp.claims(p_user, p_papel), true);
    BEGIN
        EXECUTE format('SET LOCAL ROLE %I', p_papel);
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

-- Roda p_sql como postgres (sem trocar de papel) com as claims de p_user — ou
-- SEM claims, se p_user é NULL — e devolve 'ok:<resultado>' ou
-- '<SQLSTATE>:<mensagem>'. Serve para chamar o núcleo direto com um p_ator
-- diferente de auth.uid(): prova que ele decide pelo ator, não pela sessão.
CREATE FUNCTION pg_temp.como_postgres(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims',
                       CASE WHEN p_user IS NULL THEN '' ELSE pg_temp.claims(p_user, 'authenticated') END, true);
    BEGIN
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

-- Estado entre seções: a seção B usa a org e as contas m, g e x da seção A.
CREATE TEMP TABLE dc_ctx (org UUID, m UUID, g UUID, x UUID);

-- ═════════════════════════════════════════════════════════════════════════════
-- Seção A — núcleo com ator explícito e regressão do app logado
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    org CONSTANT UUID := '926cf626-ba49-4ee4-9f35-472822fb90e6';
    nao_encontrado CONSTANT TEXT := '42501:diário não encontrado ou sem permissão';
    sem_gravar     CONSTANT TEXT := '42501:sem permissão para gravar neste diário';
    msg_aprovar    CONSTANT TEXT := '42501:Aprovar ou recusar registro do diário exige a permissão de aprovação '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    msg_alterar    CONSTANT TEXT := '42501:Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    msg_excluir    CONSTANT TEXT := '42501:Registro aprovado: só quem aprova o Diário de Obra pode excluí-lo '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    salvar  CONSTANT TEXT := 'SELECT public.diary_upsert_entry(%L::uuid, %L::jsonb)::text';
    excluir CONSTANT TEXT := 'SELECT public.diary_delete_entry(%L::uuid, %L::text)::text';
    nucleo  CONSTANT TEXT := 'SELECT public._diary_upsert_core(%L::uuid, %L::uuid, %L::jsonb)::text';
    nucleo_excluir CONSTANT TEXT := 'SELECT public._diary_delete_core(%L::uuid, %L::uuid, %L::text)::text';
    e3 JSONB := '{"id": "tv-r3", "date": "2026-11-10", "status": "Rascunho"}';
    e4_aprovado JSONB := '{"id": "tv-r4", "date": "2026-11-09", "status": "Aprovado"}';
    m UUID; g UUID; x UUID; d1 UUID; d2 UUID;
    e1 JSONB := '{"id": "tv-r1", "date": "2026-11-12", "status": "Rascunho", "notes": "primeiro"}';
    e1b JSONB := '{"id": "tv-r1", "date": "2026-11-12", "status": "Rascunho", "notes": "segundo"}';
    e2 JSONB := '{"id": "tv-r2", "date": "2026-11-11", "status": "Rascunho"}';
    aprovado JSONB := '{"id": "tv-r1", "date": "2026-11-12", "status": "Aprovado", "notes": "segundo"}';
    v TEXT; r JSONB; a BOOLEAN; n INT := 0; n_sim INT := 0; l RECORD;
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- m: membro comum (papel member, não superadmin) SEM canApproveDiary.
    SELECT au.id INTO m
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id = org AND om.role = 'member' AND nullif(btrim(au.email), '') IS NOT NULL
       AND NOT coalesce((om.permissions ->> 'canApproveDiary')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: membro comum m sem canApproveDiary');
    -- g: conta que não é superadmin, posta como admin da org (só nesta transação).
    SELECT au.id INTO g FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
       AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = org AND om.user_id = au.id)
       AND nullif(btrim(au.email), '') IS NOT NULL
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(g IS NOT NULL, 'fixture: conta g para admin');
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (org, g, (SELECT email FROM auth.users WHERE id = g), 'admin');
    -- x: conta com e-mail, não superadmin, que NÃO é membro da org (nem corretor).
    SELECT au.id INTO x FROM auth.users au
     WHERE au.id NOT IN (m, g) AND nullif(btrim(au.email), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
       AND NOT public.is_org_member_de(au.id, org)
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'fixture: não membro x');
    INSERT INTO dc_ctx VALUES (org, m, g, x);

    -- Diários (criados como postgres; dono = g, para m entrar só por ser membro).
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TV diário', g, org, jsonb_build_object('classification', 'DIARIO', 'organizationId', org))
    RETURNING id INTO d1;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TV diário sem organization_id', g, NULL, jsonb_build_object('classification', 'DIARIO', 'organizationId', org))
    RETURNING id INTO d2;
    PERFORM pg_temp.confere((SELECT organization_id IS NULL FROM public.projects WHERE id = d2),
        'fixture: d2 com organization_id NULL');

    -- ── 1. membro grava ──────────────────────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'membro salva registro Rascunho (veio ' || v || ')');
    r := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(r -> 'entries' = jsonb_build_array(e1) AND r -> 'anterior' = 'null'::jsonb,
        'primeira gravação: entries = [registro], anterior NULL (veio ' || r::text || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(e1),
        'registro gravado em settings.diaryEntries');

    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1b));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'membro salva de novo (veio ' || v || ')');
    r := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(r -> 'entries' = jsonb_build_array(e1b) AND r -> 'anterior' = e1,
        'segunda gravação: substitui pelo id, anterior = o primeiro (veio ' || r::text || ')');

    -- Validações de entrada (22023), iguais às de hoje.
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, '{"date": "2026-11-12"}'));
    PERFORM pg_temp.confere(v = '22023:registro do diário sem id', 'registro sem id → 22023 (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, '{"id": "tv-r9"}'));
    PERFORM pg_temp.confere(v = '22023:registro do diário sem data', 'registro sem data → 22023 (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(excluir, d1, ''));
    PERFORM pg_temp.confere(v = '22023:registro do diário sem id', 'excluir sem id → 22023 (veio ' || v || ')');

    -- ── 2. diário de organization_id NULL (org em settings.organizationId) ───
    v := pg_temp.como(m, 'authenticated', format(salvar, d2, e2));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'membro grava no diário de organization_id NULL (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d2) = jsonb_build_array(e2),
        'registro gravado no diário de organization_id NULL');
    v := pg_temp.como(m, 'authenticated', format(excluir, d2, 'tv-r2'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'entries' = '[]'::jsonb
                            AND (substr(v, 4)::jsonb) -> 'anterior' = e2,
        'membro exclui o próprio Rascunho: entries vazio, anterior = o registro (veio ' || v || ')');

    -- ── 3. não membro ────────────────────────────────────────────────────────
    v := pg_temp.como(x, 'authenticated', format(salvar, d1, e2));
    PERFORM pg_temp.confere(v = nao_encontrado, 'não membro salvando → 42501 (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format(excluir, d1, 'tv-r1'));
    PERFORM pg_temp.confere(v = nao_encontrado, 'não membro excluindo → 42501 (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format(salvar, d2, e2));
    PERFORM pg_temp.confere(v = nao_encontrado, 'não membro no diário de organization_id NULL → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(e1b),
        'recusas não mexeram no diário');

    -- ── 4. aprovação ─────────────────────────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, aprovado));
    PERFORM pg_temp.confere(v = msg_aprovar, 'membro sem a chave aprovando → 42501 (veio ' || v || ')');
    v := pg_temp.como(g, 'authenticated', format(salvar, d1, aprovado));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'admin aprova (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, aprovado || '{"notes": "mexido"}'));
    PERFORM pg_temp.confere(v = msg_alterar, 'membro editando o aprovado → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(salvar, d1, e1b));
    PERFORM pg_temp.confere(v = msg_alterar, 'membro desaprovando → 42501 (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(excluir, d1, 'tv-r1'));
    PERFORM pg_temp.confere(v = msg_excluir, 'membro excluindo o aprovado → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(aprovado),
        'o aprovado ficou como o admin gravou');

    -- ── 5. gatilho segue valendo (UPDATE sem a marca não mexe em diaryEntries) ─
    PERFORM pg_temp.confere(current_setting('orcacloud.diario_escrita', true) IS DISTINCT FROM 'on',
        'a marca orcacloud.diario_escrita não ficou ligada depois das RPCs');
    UPDATE public.projects SET settings = settings - 'diaryEntries' WHERE id = d1;
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(aprovado),
        'UPDATE como postgres sem a marca → diaryEntries intacto');

    v := pg_temp.como(g, 'authenticated', format(excluir, d1, 'tv-r1'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'entries' = '[]'::jsonb,
        'admin exclui o aprovado (veio ' || v || ')');

    -- ── 5b. o núcleo decide pelo p_ator, não pela sessão (auth.uid()) ────────
    -- Chamado direto como postgres: sem claims, o ator membro grava e o não
    -- membro é recusado (pega núcleo que usasse is_org_member(v_org)).
    v := pg_temp.como_postgres(NULL, format(nucleo, m, d1, e3));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'entries' = jsonb_build_array(e3),
        'núcleo sem claims, p_ator = membro → grava (veio ' || v || ')');
    v := pg_temp.como_postgres(NULL, format(nucleo, x, d1, e3));
    PERFORM pg_temp.confere(v = nao_encontrado, 'núcleo sem claims, p_ator = não membro → 42501 (veio ' || v || ')');
    -- Sessão e ator trocados na aprovação (pega núcleo que usasse
    -- fn_pode_aprovar_diario(v_org)): vale quem é o ator.
    v := pg_temp.como_postgres(g, format(nucleo, m, d1, e4_aprovado));
    PERFORM pg_temp.confere(v = msg_aprovar, 'claims do admin g, p_ator = m aprovando → 42501 (veio ' || v || ')');
    v := pg_temp.como_postgres(m, format(nucleo, g, d1, e4_aprovado));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'claims de m, p_ator = admin g aprovando → ok (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(e3, e4_aprovado),
        'diário ficou com o Rascunho do membro e o aprovado pelo ator admin');

    -- ── 5c. o núcleo de EXCLUSÃO também decide pelo p_ator ───────────────────
    -- Membro: sem claims, p_ator = não membro é recusado; com as claims de um
    -- membro (m), p_ator = não membro segue recusado (pega núcleo que usasse
    -- is_org_member(v_org), que leria a sessão de m e deixaria passar).
    v := pg_temp.como_postgres(NULL, format(nucleo_excluir, x, d1, 'tv-r3'));
    PERFORM pg_temp.confere(v = nao_encontrado, 'excluir pelo núcleo sem claims, p_ator = não membro → 42501 (veio ' || v || ')');
    v := pg_temp.como_postgres(m, format(nucleo_excluir, x, d1, 'tv-r3'));
    PERFORM pg_temp.confere(v = nao_encontrado, 'excluir pelo núcleo com claims de m, p_ator = não membro → 42501 (veio ' || v || ')');
    -- Aprovação: claims do admin g, p_ator = m (sem a chave) excluindo o Aprovado
    -- → a frase da aprovação (pega núcleo que usasse fn_pode_aprovar_diario(v_org)).
    v := pg_temp.como_postgres(g, format(nucleo_excluir, m, d1, 'tv-r4'));
    PERFORM pg_temp.confere(v = msg_excluir, 'excluir pelo núcleo com claims do admin g, p_ator = m, registro Aprovado → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = d1) = jsonb_build_array(e3, e4_aprovado),
        'recusas do núcleo de exclusão não mexeram no diário');
    -- Lados que passam: sem claims, o ator membro exclui o Rascunho; com as
    -- claims de m, o ator admin g exclui o Aprovado.
    v := pg_temp.como_postgres(NULL, format(nucleo_excluir, m, d1, 'tv-r3'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'entries' = jsonb_build_array(e4_aprovado),
        'excluir pelo núcleo sem claims, p_ator = membro, Rascunho → ok (veio ' || v || ')');
    v := pg_temp.como_postgres(m, format(nucleo_excluir, g, d1, 'tv-r4'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'entries' = '[]'::jsonb,
        'excluir pelo núcleo com claims de m, p_ator = admin g, Aprovado → ok (veio ' || v || ')');

    -- ── 6. equivalência fn_pode_aprovar_diario_de × fn_pode_aprovar_diario ───
    -- O lado "aprova = true" inclui a fixture g (admin inserido nesta transação).
    FOR l IN SELECT om.user_id, om.organization_id
               FROM public.organization_members om
              WHERE om.user_id IS NOT NULL AND om.organization_id IS NOT NULL
              ORDER BY om.organization_id, om.user_id
              LIMIT 500
    LOOP
        a := public.fn_pode_aprovar_diario_de(l.user_id, l.organization_id);
        v := pg_temp.como(l.user_id, 'authenticated',
                          format('SELECT public.fn_pode_aprovar_diario(%L::uuid)::text', l.organization_id));
        PERFORM pg_temp.confere(v = 'ok:' || a::text,
            format('equivalência em (%s, %s): _de = %s, original = %s', l.user_id, l.organization_id, a, v));
        n := n + 1;
        IF a THEN n_sim := n_sim + 1; END IF;
    END LOOP;
    PERFORM pg_temp.confere(n > 0 AND n_sim > 0 AND n_sim < n,
        format('equivalência comparou casos dos dois lados (%s membros, %s aprovam)', n, n_sim));
    PERFORM pg_temp.confere(public.fn_pode_aprovar_diario_de(g, org) AND NOT public.fn_pode_aprovar_diario_de(m, org)
                            AND NOT public.fn_pode_aprovar_diario_de(x, org)
                            AND NOT public.fn_pode_aprovar_diario_de(NULL, org)
                            AND NOT public.fn_pode_aprovar_diario_de(g, NULL),
        'fn_pode_aprovar_diario_de: admin sim; membro sem a chave, não membro e nulos não');

    -- ── 7. sem usuário no token ──────────────────────────────────────────────
    v := pg_temp.como(NULL, 'authenticated', format(salvar, d1, e2));
    PERFORM pg_temp.confere(v = sem_gravar, 'authenticated sem sub salvando → 42501 (veio ' || v || ')');
    v := pg_temp.como(NULL, 'authenticated', format(excluir, d1, 'tv-r1'));
    PERFORM pg_temp.confere(v = sem_gravar, 'authenticated sem sub excluindo → 42501 (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format(salvar, d1, e2));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for function%', 'anon não executa diary_upsert_entry (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated',
                      format('SELECT public._diary_upsert_core(%L::uuid, %L::uuid, %L::jsonb)::text', m, d1, e2));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for function%', 'authenticated não chama o núcleo direto (veio ' || v || ')');

    -- ── forma ────────────────────────────────────────────────────────────────
    -- Núcleos e gêmeo: DEFINER, search_path fixo, ninguém da API executa.
    PERFORM pg_temp.confere(
        (SELECT bool_and(p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
                         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
           FROM pg_proc p
          WHERE p.oid IN ('public.fn_pode_aprovar_diario_de(uuid, uuid)'::regprocedure,
                          'public._diary_upsert_core(uuid, uuid, jsonb)'::regprocedure,
                          'public._diary_delete_core(uuid, uuid, text)'::regprocedure))
        AND (SELECT p.provolatile = 's' FROM pg_proc p WHERE p.oid = 'public.fn_pode_aprovar_diario_de(uuid, uuid)'::regprocedure)
        AND (SELECT bool_and(p.provolatile = 'v') FROM pg_proc p
              WHERE p.oid IN ('public._diary_upsert_core(uuid, uuid, jsonb)'::regprocedure,
                              'public._diary_delete_core(uuid, uuid, text)'::regprocedure)),
        'fn_pode_aprovar_diario_de (STABLE) e núcleos (VOLATILE): DEFINER, search_path, sem EXECUTE para anon/authenticated');
    -- RPCs do app logado e fn_pode_aprovar_diario: EXECUTE só authenticated.
    PERFORM pg_temp.confere(
        (SELECT bool_and(p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
           FROM pg_proc p
          WHERE p.oid IN ('public.diary_upsert_entry(uuid, jsonb)'::regprocedure,
                          'public.diary_delete_entry(uuid, text)'::regprocedure,
                          'public.fn_pode_aprovar_diario(uuid)'::regprocedure)),
        'diary_*_entry e fn_pode_aprovar_diario: DEFINER, search_path, EXECUTE de authenticated e não de anon');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM pg_proc p, aclexplode(p.proacl) ac
         WHERE p.oid IN ('public.fn_pode_aprovar_diario_de(uuid, uuid)'::regprocedure,
                         'public._diary_upsert_core(uuid, uuid, jsonb)'::regprocedure,
                         'public._diary_delete_core(uuid, uuid, text)'::regprocedure,
                         'public.diary_upsert_entry(uuid, jsonb)'::regprocedure,
                         'public.diary_delete_entry(uuid, text)'::regprocedure,
                         'public.fn_pode_aprovar_diario(uuid)'::regprocedure)
           AND ac.grantee = 0 AND ac.privilege_type = 'EXECUTE')
        AND (SELECT bool_and(p.proacl IS NOT NULL) FROM pg_proc p
              WHERE p.oid IN ('public.fn_pode_aprovar_diario_de(uuid, uuid)'::regprocedure,
                              'public._diary_upsert_core(uuid, uuid, jsonb)'::regprocedure,
                              'public._diary_delete_core(uuid, uuid, text)'::regprocedure,
                              'public.diary_upsert_entry(uuid, jsonb)'::regprocedure,
                              'public.diary_delete_entry(uuid, text)'::regprocedure,
                              'public.fn_pode_aprovar_diario(uuid)'::regprocedure)),
        'nenhuma das seis com EXECUTE para PUBLIC');
    -- Os chamadores delegam ao núcleo/gêmeo com auth.uid().
    PERFORM pg_temp.confere(
        (SELECT p.prosrc LIKE '%public._diary_upsert_core(auth.uid(),%' FROM pg_proc p
          WHERE p.oid = 'public.diary_upsert_entry(uuid, jsonb)'::regprocedure)
        AND (SELECT p.prosrc LIKE '%public._diary_delete_core(auth.uid(),%' FROM pg_proc p
              WHERE p.oid = 'public.diary_delete_entry(uuid, text)'::regprocedure)
        AND (SELECT p.prosrc LIKE '%public.fn_pode_aprovar_diario_de(auth.uid(),%' FROM pg_proc p
              WHERE p.oid = 'public.fn_pode_aprovar_diario(uuid)'::regprocedure),
        'diary_*_entry e fn_pode_aprovar_diario chamam núcleo/gêmeo com auth.uid()');
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Seção B — RPCs do Diário pelo link (celular_*), chamadas como anon só com o token
-- ═════════════════════════════════════════════════════════════════════════════
-- Chama uma celular_* como anon (sem sessão, como o celular) e devolve
-- 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
CREATE FUNCTION pg_temp.cel(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(NULL, 'anon', p_sql)
$$;

-- Chaves de um objeto JSON, em ordem, separadas por vírgula.
CREATE FUNCTION pg_temp.chaves(p JSONB) RETURNS TEXT LANGUAGE sql AS $$
    SELECT coalesce(string_agg(k, ',' ORDER BY k), '') FROM jsonb_object_keys(p) k
$$;

-- Conjunto de ids (ordenado por uuid) de um array JSON de objetos com 'id'.
CREATE FUNCTION pg_temp.ids(p_arr JSONB) RETURNS TEXT LANGUAGE sql AS $$
    SELECT coalesce(string_agg(e ->> 'id', ',' ORDER BY (e ->> 'id')::uuid), '')
      FROM jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e
$$;

-- settings sem os manualRealPct de schedule.itemSchedules e sem os itens de
-- p_fora — o que NÃO pode mudar quando o link grava evolução.
CREATE FUNCTION pg_temp.sem_pct(p JSONB, p_fora TEXT[]) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_set(p, '{schedule,itemSchedules}',
           (SELECT coalesce(jsonb_agg(e - 'manualRealPct' ORDER BY o), '[]'::jsonb)
              FROM jsonb_array_elements(p -> 'schedule' -> 'itemSchedules') WITH ORDINALITY AS t(e, o)
             WHERE NOT (e ->> 'id' = ANY (p_fora))))
$$;

DO $$
DECLARE
    ctx RECORD;
    org UUID; m UUID; g UUID; o2 UUID; m_em_o2 BOOLEAN;
    tk TEXT; tk_g TEXT;
    ob UUID; da UUID; dn UUID; pl UUID; orc UUID; do2 UUID; plo2 UUID; sc UUID; st_d UUID; st_pl UUID;
    e_ok UUID; e_desl UUID; e_comp UUID; e_fora UUID;
    v TEXT; ref TEXT; j JSONB; antes JSONB; depois JSONB; diario_antes JSONB; budget_antes JSONB; o2_antes JSONB;
    nao_encontrado CONSTANT TEXT := '42501:diário não encontrado ou sem permissão';
    plan_recusa    CONSTANT TEXT := '42501:planejamento não encontrado ou sem permissão';
    recusa         CONSTANT TEXT := '42501:link inválido ou vencido';
    msg_aprovar    CONSTANT TEXT := '42501:Aprovar ou recusar registro do diário exige a permissão de aprovação '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    msg_alterar    CONSTANT TEXT := '42501:Registro aprovado: só quem aprova o Diário de Obra pode alterá-lo '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    msg_excluir    CONSTANT TEXT := '42501:Registro aprovado: só quem aprova o Diário de Obra pode excluí-lo '
                                 || '(Usuários › Permissões Detalhadas › Operação de Obra).';
    listar   CONSTANT TEXT := 'SELECT public.celular_diarios_listar(%L)::text';
    abrir    CONSTANT TEXT := 'SELECT public.celular_diario_abrir(%L, %L::uuid)::text';
    salvar   CONSTANT TEXT := 'SELECT public.celular_diario_salvar(%L, %L::uuid, %L::jsonb)::text';
    excluir  CONSTANT TEXT := 'SELECT public.celular_diario_excluir(%L, %L::uuid, %L::text)::text';
    ler      CONSTANT TEXT := 'SELECT public.celular_planejamento_ler(%L, %L::uuid, %L::uuid)::text';
    evoluir  CONSTANT TEXT := 'SELECT public.celular_planejamento_gravar_evolucao(%L, %L::uuid, %L::uuid, %L::jsonb)::text';
    autoriza CONSTANT TEXT := 'SELECT public.celular_diario_autoriza(%L, %L::uuid)::text';
    permite  CONSTANT TEXT := 'SELECT public.celular_diario_midia_permitida(%L, %L::text[])::text';
    orfa     CONSTANT TEXT := 'SELECT public.celular_diario_midia_orfa(%L, %L::uuid, %L::text[])::text';
    e0 CONSTANT JSONB := '{"id": "tvb-0", "date": "2026-11-01", "status": "Rascunho", "impediments": "chuva", "notes": "n", "images": []}';
    e_rasc  CONSTANT JSONB := '{"id": "tvb-r", "date": "2026-11-03", "status": "Rascunho", "notes": "pelo link"}';
    e_aprov CONSTANT JSONB := '{"id": "tvb-a", "date": "2026-11-04", "status": "Aprovado"}';
    e_midia JSONB;
    budget_ob CONSTANT JSONB := '[{"id": "i1", "quantity": 5, "phase": "F", "group": "G", "sinapiItem": {"code": "87", "description": "Alvenaria", "price": 10}},'
                             || ' {"id": "i2", "quantity": 3, "phase": "F", "group": "G", "sinapiItem": {"code": "88", "description": "Reboco", "price": 7}}]';
    budget_ob_enxuto CONSTANT JSONB := '[{"id": "i1", "quantity": 5, "sinapiItem": {"description": "Alvenaria"}},'
                                    || ' {"id": "i2", "quantity": 3, "sinapiItem": {"description": "Reboco"}}]';
    schedule_pl CONSTANT JSONB := '{"startDate": "2026-11-01", "itemSchedules": ['
                               || '{"id": "i1", "manualRealPct": 10, "duration": 5},'
                               || '{"id": "i2", "manualRealPct": 20, "duration": 3},'
                               || '{"id": "i9", "duration": 1}]}';
    p_y TEXT; p_v TEXT; p_d TEXT; p_x TEXT; p_w TEXT; p_nc TEXT; p_trav TEXT; p_orfa TEXT; p_outro TEXT; p_ponto TEXT;
BEGIN
    SELECT * INTO ctx FROM dc_ctx;
    org := ctx.org; m := ctx.m; g := ctx.g;
    PERFORM pg_temp.confere(m IS NOT NULL AND g IS NOT NULL, 'fixture B: m e g da seção A');

    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- o2: outra org — de preferência uma em que m TAMBÉM é membro (aí o núcleo
    -- sozinho aceitaria; quem recusa é a trava da org do link).
    SELECT o.id INTO o2 FROM public.organizations o WHERE o.id <> org
     ORDER BY public.is_org_member_de(m, o.id) DESC, o.id LIMIT 1;
    PERFORM pg_temp.confere(o2 IS NOT NULL, 'fixture B: outra org');
    m_em_o2 := public.is_org_member_de(m, o2);

    -- Links de m (membro sem aprovação) e de g (admin), gerados por eles mesmos.
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture B: link de m (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.como(g, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', g, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture B: link de g (veio ' || v || ')');
    tk_g := substr(v, 4);

    -- Projetos (como postgres): obra ob com orçamento; diário da com vínculo à
    -- obra; planejamento pl da obra, sem orçamento próprio; orçamento solto orc;
    -- diário dn com organization_id NULL; diário e planejamento de o2.
    INSERT INTO public.projects (name, user_id, organization_id, settings, budget)
    VALUES ('TVB obra', g, org, jsonb_build_object('classification', 'OBRA', 'organizationId', org), budget_ob)
    RETURNING id INTO ob;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB diário', g, org, jsonb_build_object('classification', 'DIARIO', 'organizationId', org,
                'linkedProjectId', ob, 'linkedProjectName', 'TVB obra', 'diaryEntries', jsonb_build_array(e0)))
    RETURNING id INTO da;
    INSERT INTO public.projects (name, user_id, organization_id, settings, budget)
    VALUES ('TVB planejamento', g, org, jsonb_build_object('classification', 'PLANEJAMENTO', 'organizationId', org,
                'linkedProjectId', ob, 'schedule', schedule_pl, 'outra', 'chave'), '[]'::jsonb)
    RETURNING id INTO pl;
    INSERT INTO public.projects (name, user_id, organization_id, settings, budget)
    VALUES ('TVB orçamento solto', g, org, jsonb_build_object('classification', 'ORCAMENTO', 'organizationId', org,
                'schedule', schedule_pl), budget_ob)
    RETURNING id INTO orc;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB diário sem organization_id', g, NULL, jsonb_build_object('classification', 'DIARIO', 'organizationId', org))
    RETURNING id INTO dn;
    p_w := org || '/' || da || '/w.jpg';   -- path da org citado SÓ por registro de outra org
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB diário de outra org', g, o2, jsonb_build_object('classification', 'DIARIO', 'organizationId', o2,
                'diaryEntries', jsonb_build_array(jsonb_build_object('id', 'tvb-o2', 'date', '2026-11-02', 'images', jsonb_build_array(p_w)))))
    RETURNING id INTO do2;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB planejamento de outra org', g, o2, jsonb_build_object('classification', 'PLANEJAMENTO', 'organizationId', o2,
                'schedule', schedule_pl))
    RETURNING id INTO plo2;
    -- sc: projeto da org SEM classificação (o front não o trata como obra) com registro.
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB sem classificação', g, org, jsonb_build_object('organizationId', org, 'diaryEntries', jsonb_build_array(e0)))
    RETURNING id INTO sc;
    -- st_d / st_pl: organization_id = o2 com settings.organizationId velho = org.
    -- A coluna manda (coalesce): NÃO são da org do link.
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB diário com settings velho', g, o2, jsonb_build_object('classification', 'DIARIO', 'organizationId', org,
                'diaryEntries', jsonb_build_array(e0)))
    RETURNING id INTO st_d;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVB planejamento com settings velho', g, o2, jsonb_build_object('classification', 'PLANEJAMENTO', 'organizationId', org,
                'schedule', schedule_pl))
    RETURNING id INTO st_pl;

    -- ── celular_diarios_listar (D1) ──────────────────────────────────────────
    v := pg_temp.cel(format(listar, tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'listar (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(pg_temp.ids(j) = (SELECT string_agg(p.id::text, ',' ORDER BY p.id) FROM public.projects p
                                               WHERE coalesce(p.organization_id, nullif(p.settings ->> 'organizationId', '')::uuid) = org),
        'listar = todos os projetos da org do link (organization_id ou settings.organizationId)');
    PERFORM pg_temp.confere(strpos(pg_temp.ids(j), da::text) > 0 AND strpos(pg_temp.ids(j), dn::text) > 0
                        AND strpos(pg_temp.ids(j), pl::text) > 0 AND strpos(pg_temp.ids(j), ob::text) > 0
                        AND strpos(pg_temp.ids(j), do2::text) = 0 AND strpos(pg_temp.ids(j), plo2::text) = 0,
        'listar: diários (inclusive o de organization_id NULL), obra e planejamento da org sim; de outra org não');
    PERFORM pg_temp.confere(strpos(pg_temp.ids(j), st_d::text) = 0 AND strpos(pg_temp.ids(j), st_pl::text) = 0,
        'listar: organization_id de outra org com settings.organizationId = org do link fica de fora (a coluna manda)');
    PERFORM pg_temp.confere(
        (SELECT e -> 'settings' FROM jsonb_array_elements(j) e WHERE e ->> 'id' = sc::text) = jsonb_build_object('organizationId', org),
        'listar: projeto sem classificação vem sem diaryEntries (não é obra para o front)');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e
                                         WHERE pg_temp.chaves(e) <> 'created_at,id,name,settings,updated_at'),
        'listar: cada item só {id, name, updated_at, created_at, settings}');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e
                                         CROSS JOIN LATERAL jsonb_array_elements(coalesce(e -> 'settings' -> 'diaryEntries', '[]'::jsonb)) r
                                         WHERE pg_temp.chaves(r) <> 'date,id,impediments')
                        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e, jsonb_object_keys(e -> 'settings') k
                                         WHERE k NOT IN ('classification', 'linkedProjectId', 'linkedProjectName', 'organizationId', 'diaryEntries')),
        'listar: settings só com os 5 campos; registros só com {id, date, impediments}');
    PERFORM pg_temp.confere(
        (SELECT e -> 'settings' FROM jsonb_array_elements(j) e WHERE e ->> 'id' = da::text)
          = jsonb_build_object('classification', 'DIARIO', 'linkedProjectId', ob, 'linkedProjectName', 'TVB obra',
                               'organizationId', org,
                               'diaryEntries', '[{"id": "tvb-0", "date": "2026-11-01", "impediments": "chuva"}]'::jsonb),
        'listar: o diário vem com vínculo e registros reduzidos');
    PERFORM pg_temp.confere(
        (SELECT e -> 'settings' FROM jsonb_array_elements(j) e WHERE e ->> 'id' = pl::text)
          = jsonb_build_object('classification', 'PLANEJAMENTO', 'linkedProjectId', ob, 'organizationId', org),
        'listar: planejamento sem diaryEntries e sem schedule');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j) WITH ORDINALITY AS a(e, o), jsonb_array_elements(j) WITH ORDINALITY AS b(e, o)
         WHERE a.o < b.o AND (a.e ->> 'updated_at')::timestamptz < (b.e ->> 'updated_at')::timestamptz),
        'listar: ordem updated_at DESC');

    -- ── celular_sessao (D6) ──────────────────────────────────────────────────
    v := pg_temp.cel(format('SELECT public.celular_sessao(%L)::text', tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'sessao de m (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere((j ->> 'user_id')::uuid = m AND (j ->> 'org_id')::uuid = org
                        AND j -> 'pode_aprovar_diario' = 'false'::jsonb
                        AND pg_temp.chaves(j) = 'nome,org_id,org_nome,pode_aprovar_diario,user_id',
        'sessao de m: {user_id, nome, org_id, org_nome, pode_aprovar_diario: false} (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_sessao(%L)::text', tk_g));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'pode_aprovar_diario' = 'true'::jsonb
                        AND (substr(v, 4)::jsonb ->> 'user_id')::uuid = g,
        'sessao do link do admin g: pode_aprovar_diario true (veio ' || v || ')');

    -- ── celular_diario_abrir (D2) ────────────────────────────────────────────
    v := pg_temp.cel(format(abrir, tk, da));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'abrir o diário da org (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(pg_temp.chaves(j) = 'id,name,organization_id,settings'
                        AND (j ->> 'id')::uuid = da AND j ->> 'name' = 'TVB diário' AND (j ->> 'organization_id')::uuid = org
                        AND pg_temp.chaves(j -> 'settings') = 'classification,diaryEntries,linkedProjectId,linkedProjectName,organizationId'
                        AND j -> 'settings' -> 'diaryEntries' = (SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da)
                        AND j -> 'settings' ->> 'linkedProjectId' = ob::text,
        'abrir: {id, name, organization_id, settings} com os registros completos (veio ' || v || ')');
    v := pg_temp.cel(format(abrir, tk, dn));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'organization_id' = 'null'::jsonb
                        AND (substr(v, 4)::jsonb) -> 'settings' -> 'diaryEntries' = '[]'::jsonb,
        'abrir o diário de organization_id NULL da org (veio ' || v || ')');
    v := pg_temp.cel(format(abrir, tk, do2));
    PERFORM pg_temp.confere(v = nao_encontrado, 'abrir diário de outra org → 42501 (m membro de o2: ' || m_em_o2 || '; veio ' || v || ')');
    v := pg_temp.cel(format(abrir, tk, st_d));
    PERFORM pg_temp.confere(v = nao_encontrado, 'abrir diário de organization_id = outra org e settings velho = org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(salvar, tk, st_d, e_rasc));
    PERFORM pg_temp.confere(v = nao_encontrado, 'salvar em diário de settings velho → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(abrir, tk, gen_random_uuid()));
    PERFORM pg_temp.confere(v = nao_encontrado, 'abrir projeto inexistente → a mesma recusa (veio ' || v || ')');

    -- ── celular_diario_salvar / excluir ──────────────────────────────────────
    o2_antes := (SELECT settings FROM public.projects WHERE id = do2);
    v := pg_temp.cel(format(salvar, tk, do2, e_rasc));
    PERFORM pg_temp.confere(v = nao_encontrado, 'salvar em diário de outra org → 42501 (m membro de o2: ' || m_em_o2 || '; veio ' || v || ')');
    v := pg_temp.cel(format(excluir, tk, do2, 'tvb-o2'));
    PERFORM pg_temp.confere(v = nao_encontrado, 'excluir em diário de outra org → 42501 (m membro de o2: ' || m_em_o2 || '; veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings FROM public.projects WHERE id = do2) = o2_antes,
        'recusas não mexeram no diário de outra org');

    v := pg_temp.cel(format(salvar, tk, da, e_rasc));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'anterior' = 'null'::jsonb
                        AND (substr(v, 4)::jsonb) -> 'entries' = jsonb_build_array(e_rasc, e0),
        'salvar pelo link: {entries, anterior} do núcleo (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da) = jsonb_build_array(e_rasc, e0),
        'salvar: o registro está em settings.diaryEntries (lido como postgres)');
    v := pg_temp.cel(format(salvar, tk, da, '{"date": "2026-11-12"}'));
    PERFORM pg_temp.confere(v = '22023:registro do diário sem id', 'salvar sem id → 22023 do núcleo (veio ' || v || ')');
    v := pg_temp.cel(format(excluir, tk, da, 'tvb-r'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'anterior' = e_rasc,
        'excluir pelo link (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da) = jsonb_build_array(e0),
        'excluir: o registro saiu de settings.diaryEntries');

    -- Aprovação: o ator é o dono do link (sem sessão nenhuma).
    v := pg_temp.cel(format(salvar, tk, da, e_aprov));
    PERFORM pg_temp.confere(v = msg_aprovar, 'aprovar pelo link de m → 42501 de aprovação (veio ' || v || ')');
    v := pg_temp.cel(format(salvar, tk_g, da, e_aprov));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'aprovar pelo link do admin g → ok (veio ' || v || ')');
    v := pg_temp.cel(format(salvar, tk, da, e_aprov || '{"notes": "mexido"}'));
    PERFORM pg_temp.confere(v = msg_alterar, 'editar o aprovado pelo link de m → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(excluir, tk, da, 'tvb-a'));
    PERFORM pg_temp.confere(v = msg_excluir, 'excluir o aprovado pelo link de m → 42501 "excluí-lo" (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da) = jsonb_build_array(e_aprov, e0),
        'o aprovado ficou como o link de g gravou');
    v := pg_temp.cel(format(excluir, tk_g, da, 'tvb-a'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da) = jsonb_build_array(e0),
        'o link de g exclui o aprovado (veio ' || v || ')');

    -- ── celular_efetivo_listar (D5) ──────────────────────────────────────────
    INSERT INTO public.employees (org_id, name, role, status) VALUES (org, 'TVB Ana', 'Pedreira', 'ATIVO') RETURNING id INTO e_ok;
    INSERT INTO public.employees (org_id, name, role, status) VALUES (org, 'TVB desligado', 'Servente', 'DESLIGADO') RETURNING id INTO e_desl;
    INSERT INTO public.employees (org_id, name, role, status) VALUES (o2, 'TVB compartilhado', 'Eletricista', 'ATIVO') RETURNING id INTO e_comp;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id) VALUES (e_comp, org);
    INSERT INTO public.employees (org_id, name, role, status) VALUES (o2, 'TVB de fora', 'Encanador', 'ATIVO') RETURNING id INTO e_fora;
    v := pg_temp.cel(format('SELECT public.celular_efetivo_listar(%L)::text', tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'efetivo (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    ref := (SELECT string_agg(e.id::text, ',' ORDER BY e.id) FROM public.employees e
             WHERE e.status = 'ATIVO'
               AND (e.org_id = org OR e.id IN (SELECT s.employee_id FROM public.employee_org_shares s WHERE s.target_org_id = org)));
    PERFORM pg_temp.confere(pg_temp.ids(j) = ref
                        AND strpos(ref, e_ok::text) > 0 AND strpos(ref, e_comp::text) > 0
                        AND strpos(ref, e_desl::text) = 0 AND strpos(ref, e_fora::text) = 0,
        'efetivo: ATIVO da org e compartilhado com ela; desligado e de fora não');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE pg_temp.chaves(e) <> 'id,name,role,status')
                        AND (SELECT e FROM jsonb_array_elements(j) e WHERE e ->> 'id' = e_ok::text)
                            = jsonb_build_object('id', e_ok, 'name', 'TVB Ana', 'role', 'Pedreira', 'status', 'ATIVO'),
        'efetivo no formato [{id, name, role, status}]');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j) WITH ORDINALITY AS a(e, o), jsonb_array_elements(j) WITH ORDINALITY AS b(e, o)
         WHERE a.o < b.o AND (a.e ->> 'name') > (b.e ->> 'name')),
        'efetivo: ordem por nome');

    -- ── celular_planejamento_ler (D4) ────────────────────────────────────────
    v := pg_temp.cel(format(ler, tk, da, pl));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'ler o planejamento PLANEJAMENTO da org (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(pg_temp.chaves(j) = 'budget,schedule' AND j -> 'schedule' = schedule_pl AND j -> 'budget' = budget_ob_enxuto,
        'ler: schedule do planejamento; budget vazio → o da obra para a qual ele aponta, enxuto (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, da, ob));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'budget' = budget_ob_enxuto
                        AND (substr(v, 4)::jsonb) -> 'schedule' = 'null'::jsonb,
        'ler: o próprio linkedProjectId do diário (OBRA) é aceito — orçamento próprio (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, da, orc));
    PERFORM pg_temp.confere(v = plan_recusa, 'ler: ORCAMENTO que não é o vínculo do diário → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, da, plo2));
    PERFORM pg_temp.confere(v = plan_recusa, 'ler: planejamento de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, do2, pl));
    PERFORM pg_temp.confere(v = nao_encontrado, 'ler: diário de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, da, st_pl));
    PERFORM pg_temp.confere(v = plan_recusa, 'ler: planejamento de organization_id = outra org e settings velho = org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(ler, tk, st_d, pl));
    PERFORM pg_temp.confere(v = nao_encontrado, 'ler: diário de settings velho → 42501 (veio ' || v || ')');

    -- ── celular_planejamento_gravar_evolucao (Review Focus 5) ────────────────
    antes        := (SELECT settings FROM public.projects WHERE id = pl);
    budget_antes := (SELECT budget FROM public.projects WHERE id = pl);
    diario_antes := (SELECT settings FROM public.projects WHERE id = da);
    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"i1": 150}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução 150 → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"i1": -1}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução negativa → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"i1": "abc"}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução "abc" → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"i1": "50"}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução número em texto → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, '[1]'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução que não é objeto → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl,
                            (SELECT jsonb_object_agg('k' || n, 1) FROM generate_series(1, 2001) n)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução com 2001 itens → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"": 10}'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução com id vazio → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, pl, jsonb_build_object(repeat('a', 101), 10)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'evolução com id de 101 caracteres → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, st_pl, '{"i1": 50}'));
    PERFORM pg_temp.confere(v = plan_recusa, 'evolução em planejamento de settings velho → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, plo2, '{"i1": 50}'));
    PERFORM pg_temp.confere(v = plan_recusa, 'evolução em planejamento de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, da, orc, '{"i1": 50}'));
    PERFORM pg_temp.confere(v = plan_recusa, 'evolução em ORCAMENTO que não é o vínculo → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(evoluir, tk, do2, pl, '{"i1": 50}'));
    PERFORM pg_temp.confere(v = nao_encontrado, 'evolução por diário de outra org → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT settings FROM public.projects WHERE id = pl) = antes
                        AND (SELECT settings FROM public.projects WHERE id = orc) -> 'schedule' = schedule_pl
                        AND (SELECT settings FROM public.projects WHERE id = plo2) -> 'schedule' = schedule_pl
                        AND (SELECT settings FROM public.projects WHERE id = st_pl) -> 'schedule' = schedule_pl,
        'recusas de evolução não mexeram em nenhum cronograma');

    v := pg_temp.cel(format(evoluir, tk, da, pl, '{"i1": 55, "i3": 70}'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'evolução válida (veio ' || v || ')');
    depois := (SELECT settings FROM public.projects WHERE id = pl);
    PERFORM pg_temp.confere(substr(v, 4)::jsonb = depois -> 'schedule', 'evolução devolve o schedule gravado');
    PERFORM pg_temp.confere(pg_temp.sem_pct(depois, ARRAY['i3']) = pg_temp.sem_pct(antes, ARRAY[]::text[]),
        'evolução: fora manualRealPct (e o item acrescentado), settings igual ao de antes');
    PERFORM pg_temp.confere(
        (SELECT jsonb_agg(e -> 'manualRealPct' ORDER BY o) FROM jsonb_array_elements(depois -> 'schedule' -> 'itemSchedules') WITH ORDINALITY AS t(e, o))
          = '[55, 20, null, 70]'::jsonb
        AND depois -> 'schedule' -> 'itemSchedules' -> 3 = '{"id": "i3", "manualRealPct": 70}'::jsonb,
        'evolução: i1 → 55, i2 e i9 intactos, i3 acrescentado {id, manualRealPct} no fim (veio ' || (depois -> 'schedule')::text || ')');
    PERFORM pg_temp.confere((SELECT settings FROM public.projects WHERE id = da) = diario_antes
                        AND (SELECT budget FROM public.projects WHERE id = pl) = budget_antes,
        'evolução: diaryEntries do diário e orçamento do planejamento intactos');
    v := pg_temp.cel(format(evoluir, tk, da, ob, '{"i1": 50}'));
    PERFORM pg_temp.confere(v = 'ok:<null>' AND NOT ((SELECT settings FROM public.projects WHERE id = ob) ? 'schedule'),
        'evolução no vínculo sem cronograma: nada grava, devolve NULL (veio ' || v || ')');

    -- ── celular_diario_autoriza ──────────────────────────────────────────────
    v := pg_temp.cel(format(autoriza, tk, da));
    PERFORM pg_temp.confere(v = 'ok:' || org, 'autoriza diário DIARIO da org → a org (veio ' || v || ')');
    v := pg_temp.cel(format(autoriza, tk, ob));
    PERFORM pg_temp.confere(v = 'ok:' || org, 'autoriza OBRA da org → a org (veio ' || v || ')');
    v := pg_temp.cel(format(autoriza, tk, pl));
    PERFORM pg_temp.confere(v = nao_encontrado, 'autoriza PLANEJAMENTO → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(autoriza, tk, do2));
    PERFORM pg_temp.confere(v = nao_encontrado, 'autoriza diário de outra org → 42501 (veio ' || v || ')');

    -- ── mídia: celular_diario_midia_permitida (D7, Review Focus 1) ───────────
    p_y    := org || '/' || da || '/y.jpg';
    p_v    := org || '/' || da || '/v.mp4';
    p_d    := org || '/' || da || '/d.pdf';
    p_x    := o2  || '/' || do2 || '/x.jpg';
    p_nc   := org || '/' || da || '/nao-citado.jpg';
    p_trav := org || '/../x.jpg';
    e_midia := jsonb_build_object('id', 'tvb-m', 'date', '2026-11-05', 'status', 'Rascunho',
                                  'images', jsonb_build_array(p_x, p_y, p_trav),
                                  'videos', jsonb_build_array(p_v),
                                  'documents', jsonb_build_array(jsonb_build_object('name', 'd', 'url', p_d)));
    v := pg_temp.cel(format(salvar, tk, da, e_midia));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'registro pelo link citando foto de outra org (veio ' || v || ')');
    v := pg_temp.cel(format(permite, tk, ARRAY[p_x, p_y, p_nc, p_v, p_w, p_d, p_trav, p_y]));
    PERFORM pg_temp.confere(v = 'ok:' || ARRAY[p_y, p_v, p_d]::text,
        'midia_permitida: só os da org citados (images, videos, documents[].url); outra org, não citado, '
        || 'citado só por outra org e ".." ficam de fora (veio ' || v || ')');
    v := pg_temp.cel(format(permite, tk, NULL));
    PERFORM pg_temp.confere(v = 'ok:{}', 'midia_permitida sem paths → vazio (veio ' || v || ')');
    v := pg_temp.cel(format(permite, tk, ARRAY(SELECT org || '/' || da || '/' || n || '.jpg' FROM generate_series(1, 101) n)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'midia_permitida com 101 paths → 22023 (veio ' || v || ')');

    -- ── mídia: celular_diario_midia_orfa ─────────────────────────────────────
    p_orfa  := org || '/' || da || '/orfa.jpg';
    p_outro := org || '/' || dn || '/outro.jpg';
    p_ponto := org || '/' || da || '/..';
    v := pg_temp.cel(format(orfa, tk, da, ARRAY[p_y, p_orfa, p_outro, p_x, p_ponto, p_d, p_orfa]));
    PERFORM pg_temp.confere(v = 'ok:' || ARRAY[p_orfa]::text,
        'midia_orfa: só o path do projeto que nenhum registro cita; citado, de outro projeto, de outra org e ".." não (veio ' || v || ')');
    v := pg_temp.cel(format(orfa, tk, do2, ARRAY[p_x]));
    PERFORM pg_temp.confere(v = nao_encontrado, 'midia_orfa em projeto de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format(excluir, tk, da, 'tvb-m'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'excluir o registro com mídia (veio ' || v || ')');
    v := pg_temp.cel(format(orfa, tk, da, ARRAY[p_y, p_v, p_d]));
    PERFORM pg_temp.confere(v = 'ok:' || ARRAY[p_y, p_v, p_d]::text,
        'midia_orfa: sem o registro, as mídias dele viram órfãs (veio ' || v || ')');
    v := pg_temp.cel(format(permite, tk, ARRAY[p_y]));
    PERFORM pg_temp.confere(v = 'ok:{}', 'midia_permitida: path que nenhum registro cita mais não sai (veio ' || v || ')');

    -- ── token inválido: a mesma recusa em todas ─────────────────────────────
    FOREACH v IN ARRAY ARRAY[
        format(listar, 'nao-existe'),
        'SELECT public.celular_sessao(''nao-existe'')::text',
        format(abrir, 'nao-existe', da),
        format(salvar, 'nao-existe', da, e_rasc),
        format(excluir, 'nao-existe', da, 'tvb-0'),
        'SELECT public.celular_efetivo_listar(''nao-existe'')::text',
        format(ler, 'nao-existe', da, pl),
        format(evoluir, 'nao-existe', da, pl, '{"i1": 1}'),
        format(autoriza, 'nao-existe', da),
        format(permite, 'nao-existe', ARRAY[p_y]),
        format(orfa, 'nao-existe', da, ARRAY[p_y]),
        format(listar, NULL)]
    LOOP
        ref := pg_temp.cel(v);
        PERFORM pg_temp.confere(ref = recusa, 'token inválido → ' || recusa || ' em: ' || v || ' (veio ' || ref || ')');
    END LOOP;
    PERFORM pg_temp.confere((SELECT settings -> 'diaryEntries' FROM public.projects WHERE id = da) = jsonb_build_array(e0)
                        AND (SELECT settings FROM public.projects WHERE id = pl) = depois,
        'recusas por token não gravaram nada');

    -- ── forma ────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('anon', p.oid, 'EXECUTE') AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND p.prosecdef AND p.provolatile = 'v'
                         AND 'search_path=public, pg_temp' = ANY (p.proconfig))
              AND count(*) = 11
           FROM pg_proc p
          WHERE p.oid IN ('public.celular_sessao(text)'::regprocedure,
                          'public.celular_diarios_listar(text)'::regprocedure,
                          'public.celular_diario_abrir(text, uuid)'::regprocedure,
                          'public.celular_diario_salvar(text, uuid, jsonb)'::regprocedure,
                          'public.celular_diario_excluir(text, uuid, text)'::regprocedure,
                          'public.celular_efetivo_listar(text)'::regprocedure,
                          'public.celular_planejamento_ler(text, uuid, uuid)'::regprocedure,
                          'public.celular_planejamento_gravar_evolucao(text, uuid, uuid, jsonb)'::regprocedure,
                          'public.celular_diario_autoriza(text, uuid)'::regprocedure,
                          'public.celular_diario_midia_permitida(text, text[])'::regprocedure,
                          'public.celular_diario_midia_orfa(text, uuid, text[])'::regprocedure)),
        'celular_* do Diário (11, com celular_sessao): anon e authenticated executam; DEFINER, VOLATILE, search_path fixo');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
         WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'celular\_%' OR p.proname LIKE '\_celular\_%')
           AND a.grantee = 0)
        AND NOT EXISTS (SELECT 1 FROM pg_proc p
                         WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'celular\_%' OR p.proname LIKE '\_celular\_%')
                           AND p.proacl IS NULL),
        'celular_* e _celular_*: ACL explícita e sem EXECUTE para PUBLIC');
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND 'search_path=public, pg_temp' = ANY (p.proconfig))
              AND count(*) = 8
           FROM pg_proc p
          WHERE p.oid IN ('public._celular_org_do_projeto(uuid, jsonb)'::regprocedure,
                          'public._celular_classificacao(jsonb)'::regprocedure,
                          'public._celular_settings_enxuto(jsonb)'::regprocedure,
                          'public._celular_registros(jsonb)'::regprocedure,
                          'public._celular_midias_citadas(jsonb)'::regprocedure,
                          'public._celular_midia_path_ok(text, uuid, uuid)'::regprocedure,
                          'public._celular_confere_paths(text[])'::regprocedure,
                          'public._celular_planejamento_aceito(uuid, uuid, jsonb, jsonb, uuid)'::regprocedure)),
        'internos _celular_* do Diário (8): search_path fixo, sem EXECUTE para anon nem authenticated');
    -- Gravação só pelo núcleo, com o dono do link como ator.
    PERFORM pg_temp.confere(
        (SELECT p.prosrc LIKE '%public._diary_upsert_core(v_user,%' FROM pg_proc p
          WHERE p.oid = 'public.celular_diario_salvar(text, uuid, jsonb)'::regprocedure)
        AND (SELECT p.prosrc LIKE '%public._diary_delete_core(v_user,%' FROM pg_proc p
              WHERE p.oid = 'public.celular_diario_excluir(text, uuid, text)'::regprocedure),
        'celular_diario_salvar/excluir chamam o núcleo com o dono do link');
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Seção C — limite de uso por link (aplicar_20271112990000)
-- ═════════════════════════════════════════════════════════════════════════════
-- subir (celular_diario_autoriza) 120/hora e assinar (celular_diario_midia_permitida)
-- 600/hora, contados por link em user_mobile_link_uso; estouro → 54000. Mais o
-- IS NOT TRUE das checagens de planejamento.
DO $$
DECLARE
    ctx RECORD;
    org UUID; m UUID; g UUID;
    tk TEXT; tk_g TEXT; link_m UUID; link_g UUID; dc UUID;
    v TEXT; i INT; p_a TEXT;
    hora     CONSTANT TIMESTAMPTZ := date_trunc('hour', now(), 'UTC');
    limite   CONSTANT TEXT := '54000:Limite de uso do link atingido — tente de novo na próxima hora.';
    recusa   CONSTANT TEXT := '42501:link inválido ou vencido';
    autoriza CONSTANT TEXT := 'SELECT public.celular_diario_autoriza(%L, %L::uuid)::text';
    permite  CONSTANT TEXT := 'SELECT public.celular_diario_midia_permitida(%L, %L::text[])::text';
    cota     CONSTANT TEXT := 'SELECT public._celular_cota(%L, %L, %s)::text';
BEGIN
    SELECT * INTO ctx FROM dc_ctx;
    org := ctx.org; m := ctx.m; g := ctx.g;
    SELECT l.id INTO link_m FROM public.user_mobile_links l WHERE l.org_id = org AND l.user_id = m;
    SELECT l.id INTO link_g FROM public.user_mobile_links l WHERE l.org_id = org AND l.user_id = g;
    PERFORM pg_temp.confere(link_m IS NOT NULL AND link_g IS NOT NULL, 'fixture C: links de m e g da seção B');

    -- ── o que a seção B já contou: só as chamadas que passaram ───────────────
    -- Link de m na seção B: autoriza ok em 2 (diário e obra) e recusada em 2
    -- (planejamento, outra org); midia_permitida ok em 3 e 22023 em 1. A recusa
    -- desfaz o incremento junto com a chamada.
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'subir' AND janela = hora) = 2
        AND (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'assinar' AND janela = hora) = 3
        AND NOT EXISTS (SELECT 1 FROM public.user_mobile_link_uso WHERE link_id = link_g),
        'seção B contou só as chamadas que passaram (veio '
        || coalesce((SELECT string_agg(acao || '=' || n, ',' ORDER BY acao) FROM public.user_mobile_link_uso
                      WHERE link_id = link_m), '<nada>') || ')');

    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- Tokens novos para m e g (gerar de novo = mesma linha de user_mobile_links:
    -- a conta continua). Zera a de m e planta uma hora anterior estourada e uma
    -- linha de 3 dias atrás (faxina).
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture C: link de m (veio ' || v || ')');
    tk := substr(v, 4);
    v := pg_temp.como(g, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', g, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'fixture C: link de g (veio ' || v || ')');
    tk_g := substr(v, 4);
    PERFORM pg_temp.confere((SELECT l.id FROM public.user_mobile_links l WHERE l.token_hash = public._mobile_link_hash(tk)) = link_m,
        'gerar de novo mantém a linha do link (a conta não zera)');
    DELETE FROM public.user_mobile_link_uso WHERE link_id = link_m;
    INSERT INTO public.user_mobile_link_uso (link_id, acao, janela, n) VALUES
        (link_m, 'subir', hora - interval '1 hour', 1000),
        (link_m, 'subir', hora - interval '3 days', 5);
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TVC diário', g, org, jsonb_build_object('classification', 'DIARIO', 'organizationId', org))
    RETURNING id INTO dc;

    -- ── subir: 120 por hora ──────────────────────────────────────────────────
    FOR i IN 1..120 LOOP
        v := pg_temp.cel(format(autoriza, tk, dc));
        PERFORM pg_temp.confere(v = 'ok:' || org, format('autoriza nº %s de 120 → a org (veio %s)', i, v));
    END LOOP;
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'subir' AND janela = hora) = 120,
        'autoriza: 120 usos contados na hora cheia corrente (a hora anterior estourada não conta)');
    v := pg_temp.cel(format(autoriza, tk, dc));
    PERFORM pg_temp.confere(v = limite, 'autoriza nº 121 → ' || limite || ' (veio ' || v || ')');
    v := pg_temp.cel(format(autoriza, tk, dc));
    PERFORM pg_temp.confere(v = limite, 'autoriza nº 122 → a mesma recusa (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'subir' AND janela = hora) = 120,
        'a recusa por limite desfaz o próprio incremento (n fica 120)');
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'subir' AND janela = hora - interval '1 hour') = 1000
        AND NOT EXISTS (SELECT 1 FROM public.user_mobile_link_uso WHERE link_id = link_m AND janela < hora - interval '2 days'),
        'hora anterior intacta; linha de mais de 2 dias apagada pela faxina');

    -- Outro link (outra pessoa) não é afetado; e assinar do mesmo link conta à parte.
    v := pg_temp.cel(format(autoriza, tk_g, dc));
    PERFORM pg_temp.confere(v = 'ok:' || org, 'link de g segue subindo com o de m no limite (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_g AND acao = 'subir' AND janela = hora) = 1,
        'link de g: 1 uso de subir, na conta dele');
    p_a := org || '/' || dc || '/a.jpg';
    v := pg_temp.cel(format(permite, tk, ARRAY[p_a]));
    PERFORM pg_temp.confere(v = 'ok:{}', 'link de m no limite de subir ainda assina (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'assinar' AND janela = hora) = 1,
        'midia_permitida conta 1 uso de assinar');

    -- ── assinar: 600 por hora (pela própria midia_permitida, com a conta adiantada) ─
    UPDATE public.user_mobile_link_uso SET n = 599 WHERE link_id = link_m AND acao = 'assinar' AND janela = hora;
    v := pg_temp.cel(format(permite, tk, ARRAY[p_a]));
    PERFORM pg_temp.confere(v = 'ok:{}', 'midia_permitida nº 600 → ok (veio ' || v || ')');
    v := pg_temp.cel(format(permite, tk, ARRAY[p_a]));
    PERFORM pg_temp.confere(v = limite, 'midia_permitida nº 601 → ' || limite || ' (veio ' || v || ')');
    PERFORM pg_temp.confere(
        (SELECT n FROM public.user_mobile_link_uso WHERE link_id = link_m AND acao = 'assinar' AND janela = hora) = 600,
        'assinar: n fica 600 depois da recusa');
    v := pg_temp.cel(format(permite, tk_g, ARRAY[p_a]));
    PERFORM pg_temp.confere(v = 'ok:{}', 'link de g segue assinando com o de m no limite (veio ' || v || ')');

    -- ── _celular_cota direto (como postgres), com limite baixo ───────────────
    DELETE FROM public.user_mobile_link_uso WHERE link_id = link_g AND acao = 'assinar';
    FOR i IN 1..3 LOOP
        v := pg_temp.como_postgres(NULL, format(cota, tk_g, 'assinar', 3));
        PERFORM pg_temp.confere(v LIKE 'ok:%', format('_celular_cota nº %s de 3 → ok (veio %s)', i, v));
    END LOOP;
    v := pg_temp.como_postgres(NULL, format(cota, tk_g, 'assinar', 3));
    PERFORM pg_temp.confere(v = limite, '_celular_cota nº 4 de 3 → ' || limite || ' (veio ' || v || ')');
    v := pg_temp.como_postgres(NULL, format(cota, 'nao-existe', 'subir', 10));
    PERFORM pg_temp.confere(v = recusa, '_celular_cota com token que não existe → ' || recusa || ' (veio ' || v || ')');
    v := pg_temp.como_postgres(NULL, format(cota, tk_g, 'outra', 10));
    PERFORM pg_temp.confere(v LIKE '23514:%', '_celular_cota com ação fora de subir/assinar → 23514 (veio ' || v || ')');

    -- Token inválido: a recusa do resolver vem antes da cota.
    v := pg_temp.cel(format(autoriza, 'nao-existe', dc));
    PERFORM pg_temp.confere(v = recusa, 'autoriza com token inválido → ' || recusa || ' (veio ' || v || ')');
    v := pg_temp.cel(format(permite, 'nao-existe', ARRAY[p_a]));
    PERFORM pg_temp.confere(v = recusa, 'midia_permitida com token inválido → ' || recusa || ' (veio ' || v || ')');

    -- ── a API não chega na tabela nem na cota ────────────────────────────────
    v := pg_temp.cel(format(cota, tk, 'subir', 1000000));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for function%', 'anon não chama _celular_cota (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(cota, tk, 'subir', 1000000));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for function%', 'authenticated não chama _celular_cota (veio ' || v || ')');
    v := pg_temp.cel('SELECT count(*)::text FROM public.user_mobile_link_uso');
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for table%', 'anon não lê user_mobile_link_uso (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format('DELETE FROM public.user_mobile_link_uso WHERE link_id = %L RETURNING 1', link_m));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied for table%', 'authenticated não apaga a própria conta (veio ' || v || ')');

    -- ── forma ────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.user_mobile_link_uso'::regclass)
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'user_mobile_link_uso')
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) papel,
                                      unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
                         WHERE has_table_privilege(papel, 'public.user_mobile_link_uso', priv)),
        'user_mobile_link_uso: RLS ligada, 0 policy, nenhum privilégio para anon nem authenticated');
    PERFORM pg_temp.confere(
        (SELECT p.prosecdef AND p.provolatile = 'v' AND 'search_path=public, pg_temp' = ANY (p.proconfig)
                AND p.proacl IS NOT NULL
                AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
           FROM pg_proc p WHERE p.oid = 'public._celular_cota(text, text, integer)'::regprocedure),
        '_celular_cota: DEFINER, VOLATILE, search_path fixo, sem EXECUTE para PUBLIC, anon nem authenticated');
    PERFORM pg_temp.confere(
        (SELECT p.prosrc LIKE '%PERFORM public._celular_cota(p_token, ''subir'', 120);%' FROM pg_proc p
          WHERE p.oid = 'public.celular_diario_autoriza(text, uuid)'::regprocedure)
        AND (SELECT p.prosrc LIKE '%PERFORM public._celular_cota(p_token, ''assinar'', 600);%' FROM pg_proc p
              WHERE p.oid = 'public.celular_diario_midia_permitida(text, text[])'::regprocedure),
        'autoriza chama a cota de subir (120) e midia_permitida a de assinar (600)');
    PERFORM pg_temp.confere(
        (SELECT bool_and(p.prosrc LIKE '%public._celular_planejamento_aceito(%) IS NOT TRUE THEN%'
                         AND p.prosrc NOT LIKE '%NOT public._celular_planejamento_aceito(%')
              AND count(*) = 2
           FROM pg_proc p
          WHERE p.oid IN ('public.celular_planejamento_ler(text, uuid, uuid)'::regprocedure,
                          'public.celular_planejamento_gravar_evolucao(text, uuid, uuid, jsonb)'::regprocedure)),
        'planejamento_ler e gravar_evolucao: _celular_planejamento_aceito(...) IS NOT TRUE');

    -- Link apagado leva a conta junto (ON DELETE CASCADE).
    DELETE FROM public.user_mobile_links WHERE id = link_g;
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.user_mobile_link_uso WHERE link_id = link_g),
        'apagar o link apaga a conta dele');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
