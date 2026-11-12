-- scripts/teste-link-celular-diario.sql
-- Prova do link do celular — Diário de Obras
-- (docs/planos/2026-11-11-link-celular-tarefas-diario.md, Parte 2).
--
--   Seção A — núcleo do Diário com ator explícito (_diary_upsert_core /
--             _diary_delete_core, fn_pode_aprovar_diario_de) e regressão do app
--             logado: diary_upsert_entry / diary_delete_entry mantêm o que o
--             membro grava, a recusa ao não membro, o diário de organization_id
--             NULL, a trava de aprovação e o gatilho de settings.diaryEntries.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-diario.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo
-- dela no lugar da linha MIGRATION abaixo:
--   aplicar_20271112950000_diario_nucleo_com_ator.sql
-- Sem ela, a regressão (1–5) passa igual — é o comportamento de hoje — e a prova
-- falha em "function public.fn_pode_aprovar_diario_de(uuid, uuid) does not exist"
-- (é o RED).

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

    -- ── 6. equivalência fn_pode_aprovar_diario_de × fn_pode_aprovar_diario ───
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

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
