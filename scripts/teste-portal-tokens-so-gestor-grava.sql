-- scripts/teste-portal-tokens-so-gestor-grava.sql
-- Prova de aplicar_20271125913700_portal_tokens_so_gestor_grava.sql:
-- links do Portal do Cliente (client_portal_tokens) e do Portal do Colaborador
-- (portal_tokens) — membro comum só LÊ; owner/admin grava; anon nada.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-portal-tokens-so-gestor-grava.sql
--
-- Para ensaiar ANTES de aplicar: conteúdo da migration no lugar da linha MIGRATION.
-- Sem a migration a prova falha em "membro comum NÃO desativa" (o RED).

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

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
    t TEXT; fk TEXT;
    o UUID; o2 UUID; u UUID; m UUID; total INT; v TEXT;
    linha_id UUID; linha_fk UUID; linha_token TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['client_portal_tokens', 'portal_tokens'] LOOP
        fk := CASE t WHEN 'client_portal_tokens' THEN 'client_id' ELSE 'employee_id' END;

        -- o: org com links; u: membro comum de o (não gestor nem pelo e-mail); m: gestor de o.
        EXECUTE format($q$
            SELECT om.organization_id, om.user_id
              FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
             WHERE om.role NOT IN ('owner', 'admin')
               AND EXISTS (SELECT 1 FROM public.%I x WHERE x.org_id = om.organization_id)
               AND NOT EXISTS (SELECT 1 FROM public.organization_members g
                                WHERE g.organization_id = om.organization_id AND g.role IN ('owner', 'admin')
                                  AND (g.user_id = om.user_id OR lower(g.email) = lower(au.email)))
               AND EXISTS (SELECT 1 FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
                            WHERE g.organization_id = om.organization_id AND g.role IN ('owner', 'admin')
                              AND lower(g.email) = lower(ag.email))
             ORDER BY 1, 2 LIMIT 1 $q$, t) INTO o, u;
        PERFORM pg_temp.confere(u IS NOT NULL, t || ' fixture: membro comum numa org com links e gestor');

        -- o gestor que gere MENOS orgs (precisa existir uma org que ele não gere).
        SELECT g.user_id INTO m
          FROM public.organization_members g JOIN auth.users ag ON ag.id = g.user_id
         WHERE g.organization_id = o AND g.role IN ('owner', 'admin') AND lower(g.email) = lower(ag.email)
         ORDER BY (SELECT count(*) FROM public.organization_members h
                    WHERE h.role IN ('owner', 'admin') AND (h.user_id = g.user_id OR lower(h.email) = lower(ag.email))), 1
         LIMIT 1;

        -- o2: org que m NÃO gere (para o WITH CHECK do UPDATE). Os gestores reais gerem
        -- todas as orgs, então vai um UUID que não é org nenhuma: a RLS (WITH CHECK) roda
        -- antes da FK, que é gatilho AFTER — a recusa esperada é 42501, não 23503.
        o2 := gen_random_uuid();

        EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = %L', t, o) INTO total;

        -- ── membro comum: lê tudo, não grava nada ──────────────────────────
        v := pg_temp.como(u, 'authenticated', format('SELECT count(*)::text FROM public.%I WHERE org_id = %L', t, o));
        PERFORM pg_temp.confere(v = 'ok:' || total, t || ': membro comum LÊ os links da org (veio ' || v || ', total ' || total || ')');

        v := pg_temp.como(u, 'authenticated', format(
            'WITH x AS (UPDATE public.%I SET is_active = false WHERE org_id = %L RETURNING 1) SELECT count(*)::text FROM x', t, o));
        PERFORM pg_temp.confere(v = 'ok:0', t || ': membro comum NÃO desativa (veio ' || v || ')');

        v := pg_temp.como(u, 'authenticated', format(
            'WITH x AS (DELETE FROM public.%I WHERE org_id = %L RETURNING 1) SELECT count(*)::text FROM x', t, o));
        PERFORM pg_temp.confere(v = 'ok:0', t || ': membro comum NÃO apaga (veio ' || v || ')');

        -- INSERT: tira uma linha (como postgres) e tenta devolvê-la.
        EXECUTE format('SELECT id, %I, token FROM public.%I WHERE org_id = %L ORDER BY id LIMIT 1', fk, t, o)
           INTO linha_id, linha_fk, linha_token;
        EXECUTE format('DELETE FROM public.%I WHERE id = %L', t, linha_id);
        v := pg_temp.como(u, 'authenticated', format(
            'WITH x AS (INSERT INTO public.%I (org_id, %I, token) VALUES (%L, %L, %L) RETURNING 1) SELECT count(*)::text FROM x',
            t, fk, o, linha_fk, linha_token));
        PERFORM pg_temp.confere(v LIKE '42501:%', t || ': membro comum NÃO cria (veio ' || v || ')');

        -- ── gestor: cria, desativa, não move para org que não gere, apaga ──
        v := pg_temp.como(m, 'authenticated', format(
            'WITH x AS (INSERT INTO public.%I (org_id, %I, token) VALUES (%L, %L, %L) RETURNING 1) SELECT count(*)::text FROM x',
            t, fk, o, linha_fk, linha_token));
        PERFORM pg_temp.confere(v = 'ok:1', t || ': gestor cria (veio ' || v || ')');

        v := pg_temp.como(m, 'authenticated', format(
            'WITH x AS (UPDATE public.%I SET is_active = false WHERE org_id = %L RETURNING 1) SELECT count(*)::text FROM x', t, o));
        PERFORM pg_temp.confere(v = 'ok:' || total, t || ': gestor desativa todos (veio ' || v || ')');

        v := pg_temp.como(m, 'authenticated', format(
            'WITH x AS (UPDATE public.%I SET org_id = %L WHERE org_id = %L RETURNING 1) SELECT count(*)::text FROM x', t, o2, o));
        PERFORM pg_temp.confere(v LIKE '42501:%', t || ': gestor NÃO move link para org que não gere (veio ' || v || ')');

        v := pg_temp.como(m, 'authenticated', format(
            'WITH x AS (DELETE FROM public.%I WHERE org_id = %L RETURNING 1) SELECT count(*)::text FROM x', t, o));
        PERFORM pg_temp.confere(v = 'ok:' || total, t || ': gestor apaga (veio ' || v || ')');

        -- ── visitante do portal (anon): nada ────────────────────────────────
        v := pg_temp.como(NULL, 'anon', format('SELECT count(*)::text FROM public.%I', t));
        PERFORM pg_temp.confere(v LIKE '42501:%', t || ': anon NÃO lê (veio ' || v || ')');
    END LOOP;
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
