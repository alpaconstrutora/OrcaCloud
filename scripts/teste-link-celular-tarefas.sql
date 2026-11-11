-- scripts/teste-link-celular-tarefas.sql
-- Prova do link do celular — Minhas Tarefas por token, sem login
-- (docs/planos/2026-11-11-link-celular-tarefas-diario.md, Parte 1).
--
--   Seção A — tabela user_mobile_links, _mobile_link_resolver, gêmeos de
--             autorização (*_de) e gestão do link (mobile_link_*).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-tarefas.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo
-- dela no lugar da linha MIGRATION abaixo.

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

-- Estado entre seções: a seção B usa o token válido de u gerado aqui.
CREATE TEMP TABLE lc_ctx (u UUID, o UUID, m UUID, x UUID, o2 UUID, token TEXT);

-- ═════════════════════════════════════════════════════════════════════════════
-- Seção A — tabela, resolver, gêmeos e gestão do link
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    u UUID; u_email TEXT; o UUID; m UUID; x UUID; o2 UUID;
    t1 TEXT; t2 TEXT; t3 TEXT; v TEXT; ex_membro TEXT; volta TEXT; apagadas INT; fora BOOLEAN;
    recusa CONSTANT TEXT := '42501:link inválido ou vencido';
    l RECORD;
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- u: membro comum (não owner/admin) de o, por user_id, sem outra porta de
    --    entrada (sem linha de gestor pelo e-mail, sem corretor) — assim o
    --    DELETE de organization_members tira u de o de verdade.
    -- m: owner/admin de o (is_org_manager lê o e-mail das claims).
    SELECT om.user_id, om.organization_id, au.email INTO u, o, u_email
      FROM public.organization_members om
      JOIN auth.users au ON au.id = om.user_id
     WHERE om.user_id IS NOT NULL AND au.email IS NOT NULL
       AND om.role NOT IN ('owner', 'admin')
       AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = om.organization_id
                          AND lower(g.email) = lower(au.email) AND g.role IN ('owner', 'admin'))
       AND NOT EXISTS (SELECT 1 FROM public.broker_profiles b
                        WHERE b.organization_id = om.organization_id AND lower(b.email) = lower(au.email))
       AND EXISTS (SELECT 1 FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
                    WHERE g.organization_id = om.organization_id AND g.role IN ('owner', 'admin')
                      AND g.user_id <> om.user_id AND lower(g.email) = lower(ag.email))
     ORDER BY om.organization_id, om.user_id
     LIMIT 1;
    PERFORM pg_temp.confere(u IS NOT NULL, 'fixture: membro comum u numa org o com gestor');

    SELECT g.user_id INTO m
      FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
     WHERE g.organization_id = o AND g.role IN ('owner', 'admin')
       AND g.user_id <> u AND lower(g.email) = lower(ag.email)
     ORDER BY g.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: gestor m de o com conta');

    -- x: conta real que não é nada em o (nem membro, nem gestor, nem corretor).
    SELECT au.id INTO x
      FROM auth.users au
     WHERE au.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = o AND (g.user_id = au.id OR lower(g.email) = lower(au.email)))
       AND NOT EXISTS (SELECT 1 FROM public.broker_profiles b
                        WHERE b.organization_id = o AND lower(b.email) = lower(au.email))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'fixture: conta x fora de o');

    -- o2: organização em que u não é membro.
    SELECT org.id INTO o2
      FROM public.organizations org
     WHERE NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = org.id AND (g.user_id = u OR lower(g.email) = lower(u_email)))
       AND NOT EXISTS (SELECT 1 FROM public.broker_profiles b
                        WHERE b.organization_id = org.id AND lower(b.email) = lower(u_email))
     ORDER BY org.id LIMIT 1;

    -- ── u gera o próprio link ───────────────────────────────────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u gera o próprio link (veio ' || v || ')');
    t1 := substr(v, 4);
    PERFORM pg_temp.confere(t1 ~ '^[A-Za-z0-9_-]{43}$', 'token = 43 caracteres base64url (veio ' || t1 || ')');

    SELECT * INTO l FROM public.user_mobile_links WHERE org_id = o AND user_id = u;
    PERFORM pg_temp.confere(l.id IS NOT NULL, 'linha criada em user_mobile_links');
    PERFORM pg_temp.confere(l.token_hash = public._mobile_link_hash(t1), 'token_hash = _mobile_link_hash(token)');
    PERFORM pg_temp.confere(l.token_hash = encode(extensions.digest(t1, 'sha256'), 'hex'), 'token_hash = SHA-256 hex do token');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.user_mobile_links r WHERE strpos(r::text, t1) > 0),
        'o token em claro não está gravado em nenhuma coluna');
    PERFORM pg_temp.confere(l.created_by = u, 'created_by = quem gerou');
    PERFORM pg_temp.confere(l.revoked_at IS NULL AND l.last_used_at IS NULL, 'novo: sem revogação e sem uso');
    PERFORM pg_temp.confere(l.expires_at BETWEEN now() + interval '89 days' AND now() + interval '91 days',
        'validade de 90 dias');

    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u lê o status do próprio link (veio ' || v || ')');
    PERFORM pg_temp.confere((substr(v, 4)::jsonb ->> 'existe') = 'true'
                        AND (substr(v, 4)::jsonb ->> 'revogado') = 'false'
                        AND (substr(v, 4)::jsonb ? 'expires_at') AND (substr(v, 4)::jsonb ? 'last_used_at'),
        'status = {existe, expires_at, last_used_at, revogado} (veio ' || v || ')');

    -- ── resolver ────────────────────────────────────────────────────────────
    v := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id || ''|'' || r.org_id FROM public._mobile_link_resolver(%L) r', t1));
    PERFORM pg_temp.confere(v = 'ok:' || u || '|' || o, 'resolver(token) → (u, o) (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT last_used_at FROM public.user_mobile_links WHERE org_id = o AND user_id = u) IS NOT NULL,
        'resolver grava last_used_at');

    v := pg_temp.como(NULL, 'postgres', 'SELECT r.user_id::text FROM public._mobile_link_resolver(''nao-existe-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'') r');
    PERFORM pg_temp.confere(v = recusa, 'token inexistente → recusa (veio ' || v || ')');
    v := pg_temp.como(NULL, 'postgres', 'SELECT r.user_id::text FROM public._mobile_link_resolver(NULL) r');
    PERFORM pg_temp.confere(v = recusa, 'token NULL → recusa (veio ' || v || ')');
    v := pg_temp.como(NULL, 'postgres', 'SELECT r.user_id::text FROM public._mobile_link_resolver('''') r');
    PERFORM pg_temp.confere(v = recusa, 'token vazio → recusa (veio ' || v || ')');

    -- ── quem NÃO pode gerir o link de u ─────────────────────────────────────
    v := pg_temp.como(x, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'x (não gestor, não dono) gerando link de u → 42501 (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format('SELECT public.mobile_link_revoke(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'x revogando link de u → 42501 (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'x lendo status do link de u → 42501 (veio ' || v || ')');
    v := pg_temp.como(NULL, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated sem sub → 42501 (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, NULL)', u));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'org NULL → 42501 (veio ' || v || ')');
    IF o2 IS NOT NULL THEN
        v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o2));
        PERFORM pg_temp.confere(v LIKE '42501:%', 'u gerando link numa org em que não é membro → 42501 (veio ' || v || ')');
    END IF;
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', x, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'gestor gerando link para quem não é membro de o → 42501 (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'membro comum gerando link do gestor → 42501 (veio ' || v || ')');

    -- ── privilégios: anon e authenticated não leem a tabela nem chamam internos
    v := pg_temp.como(NULL, 'anon', 'SELECT count(*)::text FROM public.user_mobile_links');
    PERFORM pg_temp.confere(v = 'ok:0' OR v LIKE '42501:%', 'anon: SELECT em user_mobile_links → 0 linhas ou 42501 (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', 'SELECT count(*)::text FROM public.user_mobile_links');
    PERFORM pg_temp.confere(v = 'ok:0' OR v LIKE '42501:%', 'authenticated: SELECT em user_mobile_links → 0 linhas ou 42501 (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('UPDATE public.user_mobile_links SET expires_at = now() + interval ''10 years'' WHERE user_id = %L RETURNING id::text', u));
    PERFORM pg_temp.confere(v = 'ok:<null>' OR v LIKE '42501:%', 'authenticated: UPDATE direto em user_mobile_links não passa (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t1));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', 'anon: _mobile_link_resolver → 42501 de privilégio (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t1));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', 'authenticated: _mobile_link_resolver → 42501 de privilégio (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', 'anon: mobile_link_generate sem GRANT (veio ' || v || ')');

    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public._mobile_link_hash(text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._mobile_link_hash(text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public._mobile_link_resolver(text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._mobile_link_resolver(text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.is_org_member_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.is_org_member_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.is_task_space_member_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.is_task_space_member_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.is_task_collaborator_de(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.is_task_collaborator_de(uuid,uuid)', 'EXECUTE'),
        'internos (_mobile_link_*, gêmeos *_de): sem EXECUTE para anon nem authenticated');
    PERFORM pg_temp.confere(
        has_function_privilege('authenticated', 'public.mobile_link_generate(uuid,uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.mobile_link_revoke(uuid,uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.mobile_link_status(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.mobile_link_generate(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.mobile_link_revoke(uuid,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.mobile_link_status(uuid,uuid)', 'EXECUTE'),
        'mobile_link_*: só authenticated executa');
    -- As policies de tarefas são TO public: os originais continuam executáveis.
    PERFORM pg_temp.confere(
        has_function_privilege('anon', 'public.is_task_space_member(uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.is_task_space_member(uuid)', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.is_task_space_member(uuid)', 'EXECUTE')
        AND has_function_privilege('anon', 'public.is_task_collaborator(uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.is_task_collaborator(uuid)', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.is_task_collaborator(uuid)', 'EXECUTE'),
        'is_task_space_member / is_task_collaborator mantêm EXECUTE de anon, authenticated e service_role');

    -- ── revogado → recusa ───────────────────────────────────────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_revoke(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u revoga o próprio link (veio ' || v || ')');
    v := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t1));
    PERFORM pg_temp.confere(v = recusa, 'revogado → ' || recusa || ' (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere((substr(v, 4)::jsonb ->> 'revogado') = 'true', 'status mostra revogado (veio ' || v || ')');

    -- ── gestor regenera para u: token novo vale, o antigo continua morto ────
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor lê o status do link de um membro (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor (owner/admin) gera o link de um membro (veio ' || v || ')');
    t2 := substr(v, 4);
    SELECT * INTO l FROM public.user_mobile_links WHERE org_id = o AND user_id = u;
    PERFORM pg_temp.confere(l.created_by = m AND l.revoked_at IS NULL AND l.last_used_at IS NULL,
        'regenerar: created_by = gestor, revoked_at e last_used_at zerados');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.user_mobile_links WHERE org_id = o AND user_id = u) = 1,
        'um link por pessoa por organização');
    PERFORM pg_temp.confere(t2 <> t1, 'regenerar troca o token');
    v := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t1));
    PERFORM pg_temp.confere(v = recusa, 'token anterior segue recusado depois de regenerar (veio ' || v || ')');
    v := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t2));
    PERFORM pg_temp.confere(v = 'ok:' || u, 'token regenerado vale (veio ' || v || ')');

    -- ── vencido → recusa ────────────────────────────────────────────────────
    UPDATE public.user_mobile_links SET expires_at = now() - interval '1 s' WHERE org_id = o AND user_id = u;
    v := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t2));
    PERFORM pg_temp.confere(v = recusa, 'vencido → ' || recusa || ' (veio ' || v || ')');

    -- ── ex-membro → recusa (Review Focus 1) ─────────────────────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u gera de novo depois de vencido (veio ' || v || ')');
    t3 := substr(v, 4);
    BEGIN
        DELETE FROM public.organization_members
         WHERE organization_id = o AND (user_id = u OR lower(email) = lower(u_email));
        GET DIAGNOSTICS apagadas = ROW_COUNT;
        fora := public.is_org_member_de(u, o);
        ex_membro := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
        RAISE EXCEPTION 'desfaz o DELETE' USING ERRCODE = 'LC001';
    EXCEPTION WHEN SQLSTATE 'LC001' THEN NULL;
    END;
    PERFORM pg_temp.confere(apagadas > 0 AND fora IS FALSE, 'DELETE tirou u de o (linhas: ' || apagadas || ')');
    PERFORM pg_temp.confere(ex_membro = recusa, 'saiu da org → ' || recusa || ' (veio ' || coalesce(ex_membro, '<null>') || ')');
    volta := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
    PERFORM pg_temp.confere(volta = 'ok:' || u, 'de volta à org, o mesmo token vale (veio ' || volta || ')');

    INSERT INTO lc_ctx VALUES (u, o, m, x, o2, t3);
END $$;

-- ── equivalência: is_org_member_de(user, org) = is_org_member(org) com as claims do user
DO $$
DECLARE r RECORD; a BOOLEAN; b BOOLEAN; n INT := 0;
BEGIN
    FOR r IN
        -- toda linha de organization_members com user_id (limite 500) …
        (SELECT om.user_id AS usr, om.organization_id AS org
           FROM public.organization_members om WHERE om.user_id IS NOT NULL
          ORDER BY om.organization_id, om.user_id LIMIT 500)
        UNION
        -- … cada um desses usuários contra todas as orgs (pares que dão FALSE) …
        (SELECT DISTINCT om.user_id, org.id
           FROM public.organization_members om CROSS JOIN public.organizations org
          WHERE om.user_id IS NOT NULL LIMIT 2000)
        UNION
        -- … e os corretores com conta (perna de broker_profiles).
        (SELECT au.id, b.organization_id
           FROM public.broker_profiles b JOIN auth.users au ON lower(au.email) = lower(b.email) LIMIT 200)
    LOOP
        PERFORM set_config('request.jwt.claims', pg_temp.claims(r.usr, 'authenticated'), true);
        a := public.is_org_member(r.org);
        b := public.is_org_member_de(r.usr, r.org);
        PERFORM pg_temp.confere(a IS NOT DISTINCT FROM b,
            format('is_org_member_de(%s, %s) = %s, mas is_org_member com as claims = %s', r.usr, r.org, b, a));
        n := n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM pg_temp.confere(n > 0, 'equivalência: houve pares para comparar');
    RAISE NOTICE 'equivalência is_org_member × is_org_member_de: % pares', n;
END $$;

-- ── gêmeos de Tarefas ───────────────────────────────────────────────────────
DO $$
DECLARE s UUID; su UUID; c RECORD; x UUID; v TEXT; colab TEXT; colab_de BOOLEAN;
BEGIN
    SELECT tsm.space_id, tsm.user_id INTO s, su
      FROM public.task_space_members tsm JOIN auth.users au ON au.id = tsm.user_id
     ORDER BY tsm.space_id, tsm.user_id LIMIT 1;
    PERFORM pg_temp.confere(s IS NOT NULL, 'fixture: membro real de task_space_members');

    v := pg_temp.como(su, 'authenticated', format('SELECT public.is_task_space_member(%L)::text', s));
    PERFORM pg_temp.confere(v = 'ok:true', 'is_task_space_member com claims de um membro = TRUE (veio ' || v || ')');
    PERFORM pg_temp.confere(public.is_task_space_member_de(su, s) IS TRUE, 'is_task_space_member_de(membro, espaço) = TRUE');

    SELECT au.id INTO x FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.task_space_members t WHERE t.space_id = s AND t.user_id = au.id)
     ORDER BY au.id LIMIT 1;
    v := pg_temp.como(x, 'authenticated', format('SELECT public.is_task_space_member(%L)::text', s));
    PERFORM pg_temp.confere(v = 'ok:false' AND public.is_task_space_member_de(x, s) IS FALSE,
        'não membro do espaço: original e gêmeo = FALSE (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.is_task_space_member(%L)::text', s));
    PERFORM pg_temp.confere(v = 'ok:false', 'anon chama is_task_space_member sem erro e recebe FALSE (veio ' || v || ')');

    -- is_task_collaborator: hoje nenhum colaborador tem e-mail igual ao de uma
    -- conta; o par é montado no subbloco (e desfeito) trocando o e-mail do
    -- funcionário colaborador pelo de uma conta real.
    SELECT tc.task_id, tc.employee_id INTO c FROM public.task_collaborators tc ORDER BY tc.task_id LIMIT 1;
    IF c.task_id IS NULL THEN
        RAISE NOTICE 'sem task_collaborators: equivalência de is_task_collaborator não exercitada';
    ELSE
        BEGIN
            UPDATE public.employees SET email = (SELECT email FROM auth.users WHERE id = su) WHERE id = c.employee_id;
            colab := pg_temp.como(su, 'authenticated', format('SELECT public.is_task_collaborator(%L)::text', c.task_id));
            colab_de := public.is_task_collaborator_de(su, c.task_id);
            RAISE EXCEPTION 'desfaz o UPDATE' USING ERRCODE = 'LC001';
        EXCEPTION WHEN SQLSTATE 'LC001' THEN NULL;
        END;
        PERFORM pg_temp.confere(colab = 'ok:true' AND colab_de IS TRUE,
            'is_task_collaborator com claims do colaborador = TRUE = gêmeo (veio ' || colab || ' / ' || coalesce(colab_de::text, '<null>') || ')');
        v := pg_temp.como(x, 'authenticated', format('SELECT public.is_task_collaborator(%L)::text', c.task_id));
        PERFORM pg_temp.confere(v = 'ok:' || public.is_task_collaborator_de(x, c.task_id)::text,
            'is_task_collaborator de quem não colabora = gêmeo (veio ' || v || ')');
    END IF;
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
