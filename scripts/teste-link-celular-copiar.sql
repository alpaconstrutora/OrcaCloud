-- scripts/teste-link-celular-copiar.sql
-- Prova do "Copiar link" do link do celular
-- (aplicar_20271125600000_link_celular_copiar.sql; plano
-- docs/planos/2026-11-11-link-celular-tarefas-diario.md, seção "Copiar link ativo").
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-copiar.sql
--
-- Para ensaiar ANTES de aplicar: gere um arquivo com o conteúdo da migration no
-- lugar da linha MIGRATION abaixo.

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

-- Roda p_sql como p_papel com as claims de p_user: 'ok:<resultado>' ou '<SQLSTATE>:<mensagem>'.
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

DO $$
DECLARE
    u UUID; o UUID; m UUID; w UUID; x UUID;
    t1 TEXT; t2 TEXT; v TEXT; st JSONB;
    recusa CONSTANT TEXT := '42501:sem permissão para gerenciar o link do celular desta pessoa';
    l RECORD;
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- u e w: membros comuns (não owner/admin, nem pelo e-mail) da mesma org o; m: gestor de o.
    SELECT om.user_id, om.organization_id INTO u, o
      FROM public.organization_members om
      JOIN auth.users au ON au.id = om.user_id
     WHERE om.user_id IS NOT NULL AND au.email IS NOT NULL
       AND om.role NOT IN ('owner', 'admin')
       AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = om.organization_id
                          AND lower(g.email) = lower(au.email) AND g.role IN ('owner', 'admin'))
       AND EXISTS (SELECT 1 FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
                    WHERE g.organization_id = om.organization_id AND g.role IN ('owner', 'admin')
                      AND g.user_id <> om.user_id AND lower(g.email) = lower(ag.email))
       AND EXISTS (SELECT 1 FROM public.organization_members w2 JOIN auth.users aw ON aw.id = w2.user_id
                    WHERE w2.organization_id = om.organization_id AND w2.user_id <> om.user_id
                      AND w2.role NOT IN ('owner', 'admin')
                      AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                                       WHERE g.organization_id = w2.organization_id
                                         AND lower(g.email) = lower(aw.email) AND g.role IN ('owner', 'admin')))
     ORDER BY om.organization_id, om.user_id
     LIMIT 1;
    PERFORM pg_temp.confere(u IS NOT NULL, 'fixture: membro comum u numa org o com gestor e outro membro comum');

    SELECT g.user_id INTO m
      FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
     WHERE g.organization_id = o AND g.role IN ('owner', 'admin')
       AND g.user_id <> u AND lower(g.email) = lower(ag.email)
     ORDER BY g.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'fixture: gestor m de o');

    SELECT w2.user_id INTO w
      FROM public.organization_members w2 JOIN auth.users aw ON aw.id = w2.user_id
     WHERE w2.organization_id = o AND w2.user_id <> u AND w2.role NOT IN ('owner', 'admin')
       AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = o AND lower(g.email) = lower(aw.email) AND g.role IN ('owner', 'admin'))
     ORDER BY w2.user_id LIMIT 1;
    PERFORM pg_temp.confere(w IS NOT NULL, 'fixture: outro membro comum w de o');

    SELECT au.id INTO x
      FROM auth.users au
     WHERE au.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                        WHERE g.organization_id = o AND (g.user_id = au.id OR lower(g.email) = lower(au.email)))
     ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'fixture: conta x fora de o');

    -- ── link antigo (sem token guardado): status não copiável, copiar = NULL ──
    -- Simula linha de antes da migration: gera e apaga o token à mão.
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u gera o próprio link (veio ' || v || ')');
    UPDATE public.user_mobile_links SET token = NULL WHERE org_id = o AND user_id = u;

    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    st := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(st ->> 'copiavel' = 'false' AND st ->> 'revogado' = 'false',
        'link antigo ativo: status com copiavel=false (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:<null>', 'link antigo: copiar devolve NULL (veio ' || v || ')');

    -- ── gerar guarda o token; o hash continua batendo ───────────────────────
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor m gera o link do membro u (veio ' || v || ')');
    t1 := substr(v, 4);
    SELECT * INTO l FROM public.user_mobile_links WHERE org_id = o AND user_id = u;
    PERFORM pg_temp.confere(l.token = t1, 'token guardado = o devolvido');
    PERFORM pg_temp.confere(l.token_hash = public._mobile_link_hash(t1), 'token_hash continua = hash do token');
    PERFORM pg_temp.confere((public._mobile_link_resolver(t1)).user_id = u, 'o resolvedor do celular aceita o token');

    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(substr(v, 4)::jsonb ->> 'copiavel' = 'true', 'novo link: copiavel=true (veio ' || v || ')');

    -- ── quem copia ──────────────────────────────────────────────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:' || t1, 'a própria pessoa copia o próprio link (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:' || t1, 'gestor da org copia o link do membro (veio ' || v || ')');
    v := pg_temp.como(w, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = recusa, 'outro membro comum NÃO copia (veio ' || v || ')');
    v := pg_temp.como(x, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = recusa, 'conta de fora da org NÃO copia (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'anon NÃO executa copiar (veio ' || v || ')');

    -- ── tabela segue fechada para a API, inclusive a coluna nova ────────────
    v := pg_temp.como(m, 'authenticated', 'SELECT count(*)::text FROM public.user_mobile_links');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'gestor NÃO lê a tabela direto (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', 'SELECT string_agg(token, '','') FROM public.user_mobile_links');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'dono NÃO lê a coluna token direto (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', 'SELECT count(*)::text FROM public.user_mobile_links');
    PERFORM pg_temp.confere(v LIKE '42501:%', 'anon NÃO lê a tabela (veio ' || v || ')');

    -- ── gerar de novo troca o token copiado ─────────────────────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    t2 := substr(v, 4);
    PERFORM pg_temp.confere(t2 <> t1, 'novo token difere do anterior');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:' || t2, 'copiar devolve o token NOVO (veio ' || v || ')');

    -- ── vencido não copia ───────────────────────────────────────────────────
    UPDATE public.user_mobile_links SET expires_at = now() - interval '1 minute' WHERE org_id = o AND user_id = u;
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:<null>', 'link vencido: copiar devolve NULL (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(substr(v, 4)::jsonb ->> 'copiavel' = 'false', 'link vencido: copiavel=false');
    UPDATE public.user_mobile_links SET expires_at = now() + interval '90 days' WHERE org_id = o AND user_id = u;

    -- ── revogar apaga o token guardado ──────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_revoke(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'gestor revoga (veio ' || v || ')');
    SELECT * INTO l FROM public.user_mobile_links WHERE org_id = o AND user_id = u;
    PERFORM pg_temp.confere(l.revoked_at IS NOT NULL AND l.token IS NULL, 'revogado: token apagado da linha');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_copiar(%L, %L)', u, o));
    PERFORM pg_temp.confere(v = 'ok:<null>', 'revogado: copiar devolve NULL (veio ' || v || ')');
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', u, o));
    PERFORM pg_temp.confere(substr(v, 4)::jsonb ->> 'copiavel' = 'false', 'revogado: copiavel=false');

    -- ── sair da org (gatilho antigo) também apaga o token ───────────────────
    v := pg_temp.como(u, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', u, o));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'u gera de novo (veio ' || v || ')');
    DELETE FROM public.organization_members WHERE organization_id = o AND user_id = u;
    SELECT * INTO l FROM public.user_mobile_links WHERE org_id = o AND user_id = u;
    PERFORM pg_temp.confere(l.revoked_at IS NOT NULL AND l.token IS NULL, 'saiu da org: revogado e sem token');

    -- ── sem linha: status com copiavel=false ────────────────────────────────
    v := pg_temp.como(w, 'authenticated', format('SELECT public.mobile_link_status(%L, %L)::text', w, o));
    IF (substr(v, 4)::jsonb ->> 'existe') = 'false' THEN
        PERFORM pg_temp.confere(substr(v, 4)::jsonb ->> 'copiavel' = 'false', 'sem link: copiavel=false (veio ' || v || ')');
    END IF;
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
