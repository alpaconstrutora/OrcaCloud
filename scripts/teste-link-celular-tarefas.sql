-- scripts/teste-link-celular-tarefas.sql
-- Prova do link do celular — Minhas Tarefas por token, sem login
-- (docs/planos/2026-11-11-link-celular-tarefas-diario.md, Parte 1).
--
--   Seção A — tabela user_mobile_links, _mobile_link_resolver, gêmeos de
--             autorização (*_de), gestão do link (mobile_link_*: gestor só
--             gera para `member`) e o gatilho que revoga o link ao sair da org.
--   Seção B — RPCs de Tarefas do link (celular_*), chamadas como anon só com
--             o token da seção A: mesma visibilidade da RLS, presa à org do link;
--             lista branca de escrita; recusas 42501/22023.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-tarefas.sql
--
-- Para ensaiar as migrations ANTES de aplicá-las, gere um arquivo com o
-- conteúdo das duas, em ordem, no lugar da linha MIGRATION abaixo:
--   aplicar_20271111950000_link_celular_tabela_e_gemeos.sql
--   aplicar_20271111960000_link_celular_rpcs_tarefas.sql

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
    linhas_de_u public.organization_members[]; revogado_ao_sair BOOLEAN; dentro BOOLEAN; reinserido TEXT;
    f1_admin TEXT; f1_owner TEXT; f1_status TEXT; f1_revoga TEXT; f1_revogado BOOLEAN;
    o_tmp UUID; link_tmp TEXT; sobrou_tmp INT;
    recusa CONSTANT TEXT := '42501:link inválido ou vencido';
    recusa_gestao CONSTANT TEXT := '42501:sem permissão para gerenciar o link do celular desta pessoa';
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

    -- ── F1: admin/owner geram o PRÓPRIO link ────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'owner/admin gera o próprio link (veio ' || v || ')');
    PERFORM pg_temp.confere(public._mobile_link_hash(substr(v, 4))
                            = (SELECT token_hash FROM public.user_mobile_links WHERE org_id = o AND user_id = m),
        'link próprio do gestor gravado na linha dele');

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

    -- ── ex-membro → recusa (Review Focus 1) e o link fica revogado (F4) ─────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u gera de novo depois de vencido (veio ' || v || ')');
    t3 := substr(v, 4);
    BEGIN
        SELECT array_agg(om) INTO linhas_de_u FROM public.organization_members om
         WHERE om.organization_id = o AND (om.user_id = u OR lower(om.email) = lower(u_email));
        DELETE FROM public.organization_members
         WHERE organization_id = o AND (user_id = u OR lower(email) = lower(u_email));
        GET DIAGNOSTICS apagadas = ROW_COUNT;
        fora := public.is_org_member_de(u, o);
        revogado_ao_sair := (SELECT revoked_at IS NOT NULL FROM public.user_mobile_links WHERE org_id = o AND user_id = u);
        ex_membro := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
        -- A pessoa volta à org (as mesmas linhas): o link antigo NÃO ressuscita.
        INSERT INTO public.organization_members SELECT (lin).* FROM unnest(linhas_de_u) lin;
        dentro := public.is_org_member_de(u, o);
        reinserido := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
        RAISE EXCEPTION 'desfaz o DELETE' USING ERRCODE = 'LC001';
    EXCEPTION WHEN SQLSTATE 'LC001' THEN NULL;
    END;
    PERFORM pg_temp.confere(apagadas > 0 AND fora IS FALSE, 'DELETE tirou u de o (linhas: ' || apagadas || ')');
    PERFORM pg_temp.confere(revogado_ao_sair IS TRUE, 'F4: DELETE do membro preenche revoked_at do link dele na org');
    PERFORM pg_temp.confere(ex_membro = recusa, 'saiu da org → ' || recusa || ' (veio ' || coalesce(ex_membro, '<null>') || ')');
    PERFORM pg_temp.confere(dentro IS TRUE, 'F4: reinserir as linhas devolve u à org');
    PERFORM pg_temp.confere(reinserido = recusa,
        'F4: de volta à org, o link antigo continua recusado (veio ' || coalesce(reinserido, '<null>') || ')');
    -- Desfeito o subbloco (DELETE, gatilho e reinserção), o token é o de antes: a
    -- recusa acima veio da saída da org, não de outra coisa.
    volta := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
    PERFORM pg_temp.confere(volta = 'ok:' || u, 'desfeita a saída, o mesmo token vale (veio ' || volta || ')');

    -- ── F1: gestor NÃO gera link de outro admin/owner; revoga e consulta, sim ─
    -- u promovido (e desfeito) no subbloco: o mesmo par gestor × alvo de antes.
    BEGIN
        UPDATE public.organization_members SET role = 'admin' WHERE organization_id = o AND user_id = u;
        f1_admin := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
        UPDATE public.organization_members SET role = 'owner' WHERE organization_id = o AND user_id = u;
        f1_owner := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
        f1_status := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
        f1_revoga := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_revoke(%L, %L)::text', u, o));
        f1_revogado := (SELECT revoked_at IS NOT NULL FROM public.user_mobile_links WHERE org_id = o AND user_id = u);
        RAISE EXCEPTION 'desfaz a promoção' USING ERRCODE = 'LC001';
    EXCEPTION WHEN SQLSTATE 'LC001' THEN NULL;
    END;
    PERFORM pg_temp.confere(f1_admin = recusa_gestao, 'gestor gerando link de um ADMIN → ' || recusa_gestao || ' (veio ' || coalesce(f1_admin, '<null>') || ')');
    PERFORM pg_temp.confere(f1_owner = recusa_gestao, 'gestor gerando link de um OWNER → ' || recusa_gestao || ' (veio ' || coalesce(f1_owner, '<null>') || ')');
    PERFORM pg_temp.confere(f1_status LIKE 'ok:%', 'gestor consulta o link de um owner (veio ' || coalesce(f1_status, '<null>') || ')');
    PERFORM pg_temp.confere(f1_revoga LIKE 'ok:%' AND f1_revogado IS TRUE,
        'gestor revoga o link de um owner (veio ' || coalesce(f1_revoga, '<null>') || ')');
    volta := pg_temp.como(NULL, 'postgres', format('SELECT r.user_id::text FROM public._mobile_link_resolver(%L) r', t3));
    PERFORM pg_temp.confere(volta = 'ok:' || u, 'desfeita a promoção, o token de u segue valendo (veio ' || volta || ')');

    -- ── F4: apagar a ORGANIZAÇÃO (cascata em organization_members e em
    --    user_mobile_links) não esbarra no gatilho ──────────────────────────
    BEGIN
        INSERT INTO public.organizations (name) VALUES ('LC org temporária') RETURNING id INTO o_tmp;
        INSERT INTO public.organization_members (organization_id, user_id, email, role)
        VALUES (o_tmp, u, u_email, 'member');
        link_tmp := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o_tmp));
        DELETE FROM public.organizations WHERE id = o_tmp;
        SELECT count(*) INTO sobrou_tmp FROM public.user_mobile_links WHERE org_id = o_tmp;
        RAISE EXCEPTION 'desfaz a org temporária' USING ERRCODE = 'LC001';
    EXCEPTION WHEN SQLSTATE 'LC001' THEN NULL;
    END;
    PERFORM pg_temp.confere(link_tmp LIKE 'ok:%', 'org temporária: u gera o link (veio ' || coalesce(link_tmp, '<null>') || ')');
    PERFORM pg_temp.confere(sobrou_tmp = 0, 'org apagada: cascata leva o link junto, sem erro do gatilho');

    PERFORM pg_temp.confere(EXISTS (
        SELECT 1 FROM pg_trigger t
         WHERE t.tgrelid = 'public.organization_members'::regclass
           AND t.tgname = 'trg_org_members_revoga_link_celular'
           AND t.tgfoid = 'public._mobile_link_revoga_ao_sair_da_org()'::regprocedure
           AND (t.tgtype & 1) = 1      -- FOR EACH ROW
           AND (t.tgtype & 2) = 0      -- AFTER
           AND (t.tgtype & 8) = 8      -- DELETE
           AND (t.tgtype & (4 | 16 | 32)) = 0),
        'F4: gatilho AFTER DELETE FOR EACH ROW em organization_members');
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public._mobile_link_revoga_ao_sair_da_org()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public._mobile_link_revoga_ao_sair_da_org()', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'public._mobile_link_revoga_ao_sair_da_org()'::regprocedure AND a.grantee = 0)
        AND (SELECT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               FROM pg_proc p WHERE p.oid = 'public._mobile_link_revoga_ao_sair_da_org()'::regprocedure),
        'F4: função do gatilho SECURITY DEFINER, search_path fixo, sem EXECUTE para PUBLIC/anon/authenticated');

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

-- ═════════════════════════════════════════════════════════════════════════════
-- Seção B — RPCs de Tarefas do link (celular_*), chamadas como anon só com o token
-- ═════════════════════════════════════════════════════════════════════════════
-- Chama uma celular_* como anon (sem sessão, como o celular) e devolve
-- 'ok:<json>' ou '<SQLSTATE>:<mensagem>'.
CREATE FUNCTION pg_temp.cel(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(NULL, 'anon', p_sql)
$$;

-- Conjunto de ids (texto ordenado por uuid) de um array JSON de objetos com 'id'.
CREATE FUNCTION pg_temp.ids(p_arr JSONB) RETURNS TEXT LANGUAGE sql AS $$
    SELECT coalesce(string_agg(e->>'id', ',' ORDER BY (e->>'id')::uuid), '')
      FROM jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e
$$;

DO $$
DECLARE
    ctx RECORD;
    u UUID; o UUID; m UUID; o2 UUID; tk TEXT; u_email TEXT;
    s_u UUID; s_u2 UUID; s_m UUID; s_o2 UUID; s_dono UUID; f_u UUID; f_u2 UUID;
    t_own UUID; t_outro UUID; t_sm UUID; t_espaco UUID; t_sempasta UUID; t_colab UUID;
    t_o2 UUID; t_sub UUID; t_done UUID; t_nova UUID;
    e_colab UUID; e_ok UUID; e_fora UUID; e_comp UUID; st_done UUID; st_o2 UUID;
    p_o UUID; p_fora UUID;
    w UUID; ow UUID; tk2 TEXT;
    v TEXT; ref TEXT; j JSONB; tr RECORD;
    recusa CONSTANT TEXT := '42501:link inválido ou vencido';
    cols_tarefa CONSTANT TEXT := 'alert_at,assignee_employee_id,created_at,description,due_date,folder_id,id,org_id,parent_task_id,priority,project_id,source_module,space_id,start_date,status,status_id,title';
    filtro_aberta CONSTANT TEXT := 't.status = ''open'' AND t.parent_task_id IS NULL';
BEGIN
    SELECT * INTO ctx FROM lc_ctx;
    u := ctx.u; o := ctx.o; m := ctx.m; o2 := ctx.o2; tk := ctx.token;
    PERFORM pg_temp.confere(tk IS NOT NULL AND o2 IS NOT NULL, 'fixture B: token válido de u (seção A) e org o2 sem u');
    SELECT au.email INTO u_email FROM auth.users au WHERE au.id = u;

    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- Espaços (o dono vira membro pelo gatilho seed_space_owner_member):
    --   s_u, s_u2 — de m em o, com u membro; s_m — de m em o, sem u;
    --   s_o2 — em o2, com u membro (prova que o escopo é a org do link).
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (o, m, 'LC espaço de u') RETURNING id INTO s_u;
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (o, m, 'LC outro espaço de u') RETURNING id INTO s_u2;
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (o, m, 'LC espaço sem u') RETURNING id INTO s_m;
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (o2, m, 'LC espaço da outra org') RETURNING id INTO s_o2;
    INSERT INTO public.task_space_members (space_id, user_id, role)
    VALUES (s_u, u, 'member'), (s_u2, u, 'member'), (s_o2, u, 'member');
    INSERT INTO public.task_folders (space_id, name) VALUES (s_u, 'LC pasta de u') RETURNING id INTO f_u;
    INSERT INTO public.task_folders (space_id, name) VALUES (s_u2, 'LC pasta do outro espaço') RETURNING id INTO f_u2;

    -- Tarefas
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (o, u, 'LC minha', 'open', 3) RETURNING id INTO t_own;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (o, m, 'LC de outro, fora de espaço', 'open', 3) RETURNING id INTO t_outro;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id)
    VALUES (o, m, 'LC de outro, em espaço sem u', 'open', 3, s_m) RETURNING id INTO t_sm;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id, folder_id)
    VALUES (o, m, 'LC na pasta do espaço de u', 'open', 2, s_u, f_u) RETURNING id INTO t_espaco;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id)
    VALUES (o, m, 'LC sem pasta no espaço de u', 'open', 2, s_u) RETURNING id INTO t_sempasta;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (o, m, 'LC u só colaborador', 'open', 3) RETURNING id INTO t_colab;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (o2, u, 'LC de u em outra org', 'open', 3) RETURNING id INTO t_o2;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority, parent_task_id)
    VALUES (o, u, 'LC subtarefa', 'open', 3, t_own) RETURNING id INTO t_sub;
    INSERT INTO public.tasks (org_id, user_id, title, status, priority)
    VALUES (o, u, 'LC já concluída', 'done', 3) RETURNING id INTO t_done;

    -- u colaborador de t_colab: funcionário com o e-mail da conta de u.
    SELECT e.id INTO e_colab FROM public.employees e WHERE e.email = u_email ORDER BY e.id LIMIT 1;
    IF e_colab IS NULL THEN
        INSERT INTO public.employees (org_id, name, email, status)
        VALUES (o, 'LC colaborador', u_email, 'ATIVO') RETURNING id INTO e_colab;
    END IF;
    INSERT INTO public.task_collaborators (task_id, employee_id) VALUES (t_colab, e_colab);

    -- Responsáveis: e_ok (ATIVO em o) entra; e_fora (ATIVO em o2, sem compartilhar com o) não.
    INSERT INTO public.employees (org_id, name, status) VALUES (o, 'LC responsável de o', 'ATIVO') RETURNING id INTO e_ok;
    INSERT INTO public.employees (org_id, name, status) VALUES (o2, 'LC responsável de fora', 'ATIVO') RETURNING id INTO e_fora;

    -- Status: o "concluído" de o (cria se a org não tiver) e um status de o2.
    SELECT ts.id INTO st_done FROM public.task_statuses ts WHERE ts.org_id = o AND ts.is_done ORDER BY ts.position, ts.id LIMIT 1;
    IF st_done IS NULL THEN
        INSERT INTO public.task_statuses (org_id, name, is_done) VALUES (o, 'LC concluído', true) RETURNING id INTO st_done;
    END IF;
    INSERT INTO public.task_statuses (org_id, name) VALUES (o2, 'LC status de outra org') RETURNING id INTO st_o2;

    -- e_comp: ATIVO em o2, compartilhado com o (perna employee_org_shares de listAssignable).
    INSERT INTO public.employees (org_id, name, status) VALUES (o2, 'LC compartilhado com o', 'ATIVO') RETURNING id INTO e_comp;
    INSERT INTO public.employee_org_shares (employee_id, target_org_id) VALUES (e_comp, o);

    -- Obras: uma de o (nome deve vir) e uma de o2 (nome não deve vir).
    INSERT INTO public.projects (name, organization_id, user_id) VALUES ('LC obra de o', o, m) RETURNING id INTO p_o;
    INSERT INTO public.projects (name, organization_id, user_id) VALUES ('LC obra de outra org', o2, m) RETURNING id INTO p_fora;
    UPDATE public.tasks SET project_id = p_o    WHERE id = t_own;
    UPDATE public.tasks SET project_id = p_fora WHERE id = t_espaco;

    -- ── celular_tarefas_listar = o que a RLS entrega a u, na org do link ─────
    ref := pg_temp.como(u, 'authenticated', format(
        'SELECT coalesce(string_agg(s.id::text, '','' ORDER BY s.id), '''') FROM ('
        || 'SELECT t.id FROM public.tasks t WHERE t.org_id = %L AND ' || filtro_aberta
        || ' ORDER BY t.due_date ASC NULLS LAST, t.priority ASC, t.id LIMIT 300) s', o));
    v := pg_temp.cel(format('SELECT pg_temp.ids(public.celular_tarefas_listar(%L)->''tarefas'')', tk));
    PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref,
        'listar (anon + token) = SELECT em tasks com as claims de u na org do link (RLS: ' || ref || ' / RPC: ' || v || ')');
    PERFORM pg_temp.confere(strpos(v, t_own::text) > 0 AND strpos(v, t_espaco::text) > 0
                        AND strpos(v, t_sempasta::text) > 0 AND strpos(v, t_colab::text) > 0,
        'listar traz a própria, as do espaço de u e a em que u é colaborador');
    PERFORM pg_temp.confere(strpos(v, t_outro::text) = 0 AND strpos(v, t_sm::text) = 0 AND strpos(v, t_o2::text) = 0
                        AND strpos(v, t_sub::text) = 0 AND strpos(v, t_done::text) = 0,
        'listar NÃO traz: de outro fora de espaço de u, de espaço sem u, de outra org, subtarefa, concluída');

    j := public.celular_tarefas_listar(tk);
    PERFORM pg_temp.confere((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j->'tarefas'->0) k) = cols_tarefa,
        'tarefa sai com exatamente as colunas de TASK_COLS');
    PERFORM pg_temp.confere(jsonb_typeof(j->'nomes_obras') = 'object', 'nomes_obras é um objeto {id: nome}');
    PERFORM pg_temp.confere(j->'nomes_obras'->>p_o::text = 'LC obra de o',
        'nomes_obras traz o nome da obra da org do link (veio ' || (j->'nomes_obras')::text || ')');
    PERFORM pg_temp.confere(NOT (j->'nomes_obras' ? p_fora::text), 'nomes_obras não traz obra de outra org');
    -- ordem do loadTasks: due_date ASC NULLS LAST, priority ASC
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j->'tarefas') WITH ORDINALITY a(e, n)
          JOIN jsonb_array_elements(j->'tarefas') WITH ORDINALITY b(e, n) ON b.n = a.n + 1
         WHERE (a.e->>'due_date') IS NULL AND (b.e->>'due_date') IS NOT NULL
            OR ((a.e->>'due_date')::timestamptz = (b.e->>'due_date')::timestamptz
                AND (a.e->>'priority')::int > (b.e->>'priority')::int)
            OR (a.e->>'due_date')::timestamptz > (b.e->>'due_date')::timestamptz),
        'listar ordena por due_date ASC NULLS LAST, priority ASC');

    -- recortes: espaço, pasta, sem pasta
    v := pg_temp.ids(public.celular_tarefas_listar(tk, s_u)->'tarefas');
    PERFORM pg_temp.confere(strpos(v, t_espaco::text) > 0 AND strpos(v, t_sempasta::text) > 0 AND strpos(v, t_own::text) = 0,
        'listar(espaço) = só as do espaço');
    v := pg_temp.ids(public.celular_tarefas_listar(tk, NULL, f_u)->'tarefas');
    PERFORM pg_temp.confere(v = t_espaco::text, 'listar(pasta) = só as da pasta (veio ' || v || ')');
    v := pg_temp.ids(public.celular_tarefas_listar(tk, s_u, NULL, true)->'tarefas');
    PERFORM pg_temp.confere(v = t_sempasta::text, 'listar(espaço, sem pasta) = só as sem pasta (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefas_listar(%L, NULL, NULL, true)::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', '"sem pasta" sem espaço → 22023 (veio ' || v || ')');
    v := pg_temp.ids(public.celular_tarefas_listar(tk, s_o2)->'tarefas');
    PERFORM pg_temp.confere(v = '', 'listar(espaço de outra org) = vazio');

    -- ── colaborador lê, mas não edita; de outro / de outra org: nem edita ─────
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"LC x"}'')::text', tk, t_colab));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar tarefa em que u é só colaborador → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"LC x"}'')::text', tk, t_outro));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar tarefa de outro fora de espaço de u → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"LC x"}'')::text', tk, t_o2));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar tarefa de u em OUTRA org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"LC x"}'')::text', tk, gen_random_uuid()));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar tarefa inexistente → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"  LC editada  "}'')->>''title''', tk, t_espaco));
    PERFORM pg_temp.confere(v = 'ok:LC editada', 'membro do espaço edita tarefa de outro no espaço (veio ' || v || ')');

    -- ── criar ────────────────────────────────────────────────────────────────
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'space_id', s_o2)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'criar em espaço de outra org (u é membro dele) → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'space_id', s_m)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'criar em espaço da org sem ser membro → 42501 (veio ' || v || ')');

    -- F5: dono do espaço (owner_user_id) que NÃO é membro dele — tasks_insert
    -- recusa, a RPC também. O gatilho seed_space_owner_member põe o dono como
    -- membro; a linha é tirada aqui (como postgres, sem auth.uid()).
    INSERT INTO public.task_spaces (org_id, owner_user_id, name) VALUES (o, u, 'LC espaço de u sem u membro') RETURNING id INTO s_dono;
    DELETE FROM public.task_space_members WHERE space_id = s_dono AND user_id = u;
    PERFORM pg_temp.confere(NOT public.is_task_space_member_de(u, s_dono), 'fixture F5: u é dono de s_dono mas não membro');
    v := pg_temp.como(u, 'authenticated', format(
        'INSERT INTO public.tasks (org_id, user_id, title, status, priority, space_id) VALUES (%L, %L, ''LC x'', ''open'', 3, %L) RETURNING id::text', o, u, s_dono));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'referência: tasks_insert recusa o dono não membro (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'space_id', s_dono)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'F5: criar em espaço de que u é dono mas não membro → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'space_id', s_u, 'folder_id', f_u2)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com pasta de outro espaço → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'folder_id', f_u)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com pasta sem espaço → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''{"title":"  "}'')::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com título em branco → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''{"description":"sem título"}'')::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar sem título → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'org_id', o2)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com org_id no payload → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object('title', 'LC x', 'user_id', m)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com user_id no payload → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''{"title":"LC x","status":"done"}'')::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com status no payload → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''{"title":"LC x","priority":7}'')::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com prioridade 7 → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''["title"]'')::text', tk));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'criar com payload que não é objeto → 22023 (veio ' || v || ')');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, %L::jsonb)::text', tk, jsonb_build_object(
        'title', '  LC criada pelo celular  ', 'description', 'desc', 'priority', 2,
        'start_date', '2026-11-12T15:00:00.000Z', 'due_date', '2026-11-20T15:00:00.000Z',
        'space_id', s_u, 'folder_id', f_u)));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'criar no espaço/pasta de u (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j) k) = cols_tarefa,
        'criada sai com exatamente as colunas de TASK_COLS');
    t_nova := (j->>'id')::uuid;
    SELECT * INTO tr FROM public.tasks WHERE id = t_nova;
    PERFORM pg_temp.confere(tr.user_id = u AND tr.org_id = o, 'criada: user_id = dono do link, org_id = org do link');
    PERFORM pg_temp.confere(tr.status = 'open' AND tr.source_module = 'manual' AND tr.title = 'LC criada pelo celular'
                        AND tr.space_id = s_u AND tr.folder_id = f_u AND tr.priority = 2
                        AND tr.due_date = '2026-11-20T15:00:00Z'::timestamptz AND tr.description = 'desc',
        'criada: status open, source_module manual, título aparado, espaço/pasta/prioridade/datas gravados');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_criar(%L, ''{"title":"LC avulsa"}'')->>''id''', tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'criar sem espaço (veio ' || v || ')');
    SELECT * INTO tr FROM public.tasks WHERE id = substr(v, 4)::uuid;
    PERFORM pg_temp.confere(tr.user_id = u AND tr.org_id = o AND tr.space_id IS NULL AND tr.folder_id IS NULL,
        'criada sem espaço: de u, na org do link, sem espaço/pasta');

    -- ── atualizar: lista branca e validações ────────────────────────────────
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own, jsonb_build_object('org_id', o2)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com org_id → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own, jsonb_build_object('user_id', m)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com user_id → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own, jsonb_build_object('space_id', s_u2)));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com space_id → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"  "}'')::text', tk, t_own));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com título em branco → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"status":"snoozed"}'')::text', tk, t_own));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com status fora de open/done → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"priority":0}'')::text', tk, t_own));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'atualizar com prioridade 0 → 22023 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own, jsonb_build_object('status_id', st_o2)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar com status_id de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own, jsonb_build_object('assignee_employee_id', e_fora)));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'atualizar com responsável de outra org → 42501 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT status_id IS NULL AND assignee_employee_id IS NULL AND title = 'LC minha'
                               FROM public.tasks WHERE id = t_own), 'recusas não gravaram nada');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)->>''assignee_employee_id''', tk, t_own, jsonb_build_object('assignee_employee_id', e_ok)));
    PERFORM pg_temp.confere(v = 'ok:' || e_ok, 'atualizar com responsável da org (veio ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"description":"nova","priority":1,"due_date":null}'')::text', tk, t_own));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'atualizar descrição/prioridade/prazo (veio ' || v || ')');
    SELECT * INTO tr FROM public.tasks WHERE id = t_own;
    PERFORM pg_temp.confere(tr.description = 'nova' AND tr.priority = 1 AND tr.due_date IS NULL
                        AND tr.assignee_employee_id = e_ok AND tr.title = 'LC minha',
        'atualizar mexe só nas chaves enviadas');

    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)::text', tk, t_own,
        jsonb_build_object('status', 'done', 'status_id', st_done)));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb->>'status') = 'done',
        'concluir com o status "concluído" da org (veio ' || v || ')');
    SELECT * INTO tr FROM public.tasks WHERE id = t_own;
    PERFORM pg_temp.confere(tr.status = 'done' AND tr.status_id = st_done AND tr.completed_at IS NOT NULL,
        'concluída: status done, status_id gravado, completed_at preenchido pelo gatilho');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"status":"open","status_id":null}'')->>''status''', tk, t_own));
    PERFORM pg_temp.confere(v = 'ok:open' AND (SELECT completed_at IS NULL FROM public.tasks WHERE id = t_own),
        'reabrir (desfazer) volta para open e limpa completed_at (veio ' || v || ')');

    -- ── celular_sessao ───────────────────────────────────────────────────────
    v := pg_temp.cel(format('SELECT public.celular_sessao(%L)::text', tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'sessao (veio ' || v || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere((j->>'user_id')::uuid = u AND (j->>'org_id')::uuid = o
                        AND (j->>'nome') IS NOT DISTINCT FROM (SELECT name FROM public.profiles WHERE id = u)
                        AND (j->>'org_nome') = (SELECT name FROM public.organizations WHERE id = o)
                        AND (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j) k) = 'nome,org_id,org_nome,user_id',
        'sessao = {user_id, nome, org_id, org_nome} do dono do link (veio ' || v || ')');

    -- ── celular_espacos_listar = task_spaces que a RLS entrega a u, na org do link
    ref := pg_temp.como(u, 'authenticated', format(
        'SELECT coalesce(string_agg(s.id::text, '','' ORDER BY s.id), '''') FROM public.task_spaces s WHERE s.org_id = %L', o));
    v := pg_temp.cel(format('SELECT pg_temp.ids(public.celular_espacos_listar(%L))', tk));
    PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref,
        'espaços (anon + token) = SELECT em task_spaces com as claims de u na org (RLS: ' || ref || ' / RPC: ' || v || ')');
    PERFORM pg_temp.confere(strpos(v, s_u::text) > 0 AND strpos(v, s_u2::text) > 0
                        AND strpos(v, s_m::text) = 0 AND strpos(v, s_o2::text) = 0,
        'espaços: os de u em o sim; o sem u e o de outra org não');
    j := (SELECT e FROM jsonb_array_elements(public.celular_espacos_listar(tk)) e WHERE e->>'id' = s_u::text);
    PERFORM pg_temp.confere((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j) k)
                            = 'color,created_at,folders,icon,id,member_count,name,open_task_count,org_id,owner_user_id,position,updated_at',
        'espaço no formato TaskSpaceWithMeta');
    PERFORM pg_temp.confere(pg_temp.ids(j->'folders') = f_u::text
                        AND (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(j->'folders'->0) k) = 'color,created_at,id,name,position,space_id',
        'espaço traz as pastas dele (colunas de task_folders)');
    PERFORM pg_temp.confere((j->>'member_count')::int = (SELECT count(*) FROM public.task_space_members WHERE space_id = s_u),
        'member_count = membros do espaço');
    ref := pg_temp.como(u, 'authenticated', format(
        'SELECT count(*)::text FROM public.tasks t WHERE t.space_id = %L AND ' || filtro_aberta, s_u));
    PERFORM pg_temp.confere('ok:' || (j->>'open_task_count') = ref,
        'open_task_count = abertas do espaço que a RLS entrega a u (RLS: ' || ref || ' / RPC: ' || (j->>'open_task_count') || ')');

    -- ── celular_status_listar = task_statuses da org do link ─────────────────
    ref := pg_temp.como(u, 'authenticated', format(
        'SELECT coalesce(string_agg(s.id::text, '','' ORDER BY s.id), '''') FROM public.task_statuses s WHERE s.org_id = %L', o));
    v := pg_temp.cel(format('SELECT pg_temp.ids(public.celular_status_listar(%L))', tk));
    PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref AND strpos(v, st_done::text) > 0 AND strpos(v, st_o2::text) = 0,
        'status = os da org do link, nenhum de outra (RLS: ' || ref || ' / RPC: ' || v || ')');
    PERFORM pg_temp.confere((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.celular_status_listar(tk)->0) k)
                            = 'color,id,is_default,is_done,name,org_id,position',
        'status com as colunas de taskStatusService.list');

    -- ── celular_responsaveis_listar = regra de listAssignable na org do link ─
    ref := pg_temp.como(u, 'authenticated', format(
        'SELECT coalesce(string_agg(e.id::text, '','' ORDER BY e.id), '''') FROM public.employees e '
        || 'WHERE e.status = ''ATIVO'' AND (e.org_id = %1$L OR e.id IN '
        || '(SELECT s.employee_id FROM public.employee_org_shares s WHERE s.target_org_id = %1$L))', o));
    v := pg_temp.cel(format('SELECT pg_temp.ids(public.celular_responsaveis_listar(%L))', tk));
    PERFORM pg_temp.confere(ref LIKE 'ok:%' AND v = ref AND strpos(v, e_ok::text) > 0 AND strpos(v, e_comp::text) > 0
                        AND strpos(v, e_fora::text) = 0,
        'responsáveis = listAssignable de u na org do link: da org e compartilhado sim, de fora não (RLS: ' || ref || ' / RPC: ' || v || ')');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, %L::jsonb)->>''assignee_employee_id''', tk, t_sempasta, jsonb_build_object('assignee_employee_id', e_comp)));
    PERFORM pg_temp.confere(v = 'ok:' || e_comp, 'atualizar com responsável compartilhado com a org (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.celular_responsaveis_listar(tk)->0) k) = 'id,name',
        'responsáveis no formato [{id, name}]');

    -- ── token de outra org não enxerga nada de o ─────────────────────────────
    -- Par (w, ow) com ow <> o e w membro de ow; de preferência o próprio u.
    SELECT om.user_id, om.organization_id INTO w, ow
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.organization_id <> o AND public.is_org_member_de(om.user_id, om.organization_id)
     ORDER BY (om.user_id = u) DESC, om.organization_id, om.user_id LIMIT 1;
    PERFORM pg_temp.confere(w IS NOT NULL, 'fixture: membro de outra org');
    v := pg_temp.como(w, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', w, ow));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'link de outra org gerado (veio ' || v || ')');
    tk2 := substr(v, 4);
    j := public.celular_tarefas_listar(tk2);
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'tarefas') e WHERE (e->>'org_id')::uuid <> ow),
        'token de outra org: só tarefas daquela org');
    PERFORM pg_temp.confere(strpos(pg_temp.ids(j->'tarefas'), t_sempasta::text) = 0 AND strpos(pg_temp.ids(j->'tarefas'), t_colab::text) = 0,
        'token de outra org: nada de o');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.celular_espacos_listar(tk2)) e WHERE (e->>'org_id')::uuid <> ow)
                        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.celular_status_listar(tk2)) e WHERE (e->>'org_id')::uuid <> ow),
        'token de outra org: espaços e status só daquela org');
    v := pg_temp.cel(format('SELECT public.celular_tarefa_atualizar(%L, %L, ''{"title":"LC x"}'')::text', tk2, t_sempasta));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'token de outra org não edita tarefa de o (veio ' || v || ')');

    -- ── token inválido: a mesma recusa em todas ─────────────────────────────
    FOREACH v IN ARRAY ARRAY[
        'SELECT public.celular_sessao(''nao-existe'')::text',
        'SELECT public.celular_tarefas_listar(''nao-existe'')::text',
        'SELECT public.celular_espacos_listar(''nao-existe'')::text',
        'SELECT public.celular_status_listar(''nao-existe'')::text',
        'SELECT public.celular_responsaveis_listar(''nao-existe'')::text',
        'SELECT public.celular_tarefa_criar(''nao-existe'', ''{"title":"LC x"}'')::text',
        format('SELECT public.celular_tarefa_atualizar(''nao-existe'', %L, ''{"title":"LC x"}'')::text', t_sempasta),
        'SELECT public.celular_tarefas_listar(NULL)::text']
    LOOP
        ref := pg_temp.cel(v);
        PERFORM pg_temp.confere(ref = recusa, 'token inválido → ' || recusa || ' em: ' || v || ' (veio ' || ref || ')');
    END LOOP;
    PERFORM pg_temp.confere((SELECT title FROM public.tasks WHERE id = t_sempasta) = 'LC sem pasta no espaço de u',
        'recusas por token não gravaram nada');

    -- ── privilégios e forma das funções ─────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('anon', p.oid, 'EXECUTE') AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND p.prosecdef AND p.provolatile = 'v'
                         AND 'search_path=public, pg_temp' = ANY (p.proconfig))
              AND count(*) = 7
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'celular\_%'),
        'celular_* (7): anon e authenticated executam; SECURITY DEFINER, VOLATILE, search_path = public, pg_temp');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
         WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'celular\_%' OR p.proname LIKE '\_celular\_%')
           AND a.grantee = 0),
        'celular_* e _celular_*: sem EXECUTE para PUBLIC');
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
              AND count(*) > 0
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '\_celular\_%'),
        'internos _celular_*: sem EXECUTE para anon nem authenticated');
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
