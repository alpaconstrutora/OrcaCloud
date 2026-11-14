-- scripts/teste-link-celular-pedido-fast.sql
-- Prova da aba "Pedido" do link do celular (Pedido Fast sem login)
-- (docs/planos/2026-11-14-pedido-fast.md, Parte 2 item 1;
--  supabase/migrations/aplicar_20271114700000_link_celular_pedido_fast.sql).
--
--   1. _celular_pedido_fast_autoriza é só da service_role (anon/authenticated → 42501);
--   2. token válido → dono do link, org do link e e-mail; ação inválida → 22023;
--   3. token inválido e token revogado → 42501 'link inválido ou vencido';
--   4. dono sem acesso a Compras (canViewOrders=false) → 'sem acesso a Pedidos de Compra'
--      nas duas funções;
--   5. celular_obras_listar (como anon) → só OBRA da org do link, sem projeto de sistema
--      nem orçamento, nem obra de outra org.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-link-celular-pedido-fast.sql

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

-- Roda p_sql como postgres (o papel da service_role na Edge) e devolve 'ok:…' ou '<SQLSTATE>:<mensagem>'.
CREATE FUNCTION pg_temp.direto(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RETURN v;
END $$;

DO $$
DECLARE
    org   UUID;
    o2    UUID;
    m     UUID;
    m_id  UUID;
    tk    TEXT;
    v     TEXT;
    ob    UUID;
    orc   UUID;
    sis   UUID;
    fora  UUID;
    autoriza CONSTANT TEXT := 'SELECT (SELECT row(a.user_id, a.org_id, a.email)::text FROM public._celular_pedido_fast_autoriza(%L, %L) a)';
    obras    CONSTANT TEXT := 'SELECT coalesce(string_agg(o.id::text, '','' ORDER BY o.id), '''') FROM public.celular_obras_listar(%L) o';
BEGIN
    -- Membro (papel 'member', com login) de uma org; outra org qualquer.
    SELECT om.organization_id, om.user_id, om.id INTO org, m, m_id
      FROM public.organization_members om
     WHERE om.role = 'member' AND om.user_id IS NOT NULL
     LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'massa: um member com login');
    SELECT o.id INTO o2 FROM public.organizations o WHERE o.id <> org LIMIT 1;

    -- Acesso a Compras ligado no membro (o padrão também liga, mas a matriz da org poderia barrar).
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewOrders": true}'::jsonb WHERE id = m_id;

    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, org));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'massa: link de m (veio ' || v || ')');
    tk := substr(v, 4);

    -- Projetos da prova (como postgres): obra, orçamento e o projeto de sistema na org;
    -- obra de outra org.
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TPF obra', m, org, jsonb_build_object('classification', 'OBRA', 'organizationId', org)) RETURNING id INTO ob;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TPF orçamento', m, org, jsonb_build_object('classification', 'ORCAMENTO', 'organizationId', org)) RETURNING id INTO orc;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('Gestão Comercial', m, org, jsonb_build_object('classification', 'OBRA', 'organizationId', org)) RETURNING id INTO sis;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TPF obra de fora', m, o2, jsonb_build_object('classification', 'OBRA', 'organizationId', o2)) RETURNING id INTO fora;

    -- 1. Só service_role.
    v := pg_temp.como(NULL, 'anon', format(autoriza, tk, 'ler'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'anon não executa _celular_pedido_fast_autoriza: ' || v);
    v := pg_temp.como(m, 'authenticated', format(autoriza, tk, 'ler'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'authenticated não executa _celular_pedido_fast_autoriza: ' || v);

    -- 2. Token válido.
    v := pg_temp.direto(format(autoriza, tk, 'ler'));
    PERFORM pg_temp.confere(v = format('ok:(%s,%s,%s)', m, org, (SELECT lower(u.email) FROM auth.users u WHERE u.id = m)),
        'token válido devolve dono, org e e-mail: ' || v);
    v := pg_temp.direto(format(autoriza, tk, 'criar'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'criar autorizado: ' || v);
    v := pg_temp.direto(format(autoriza, tk, 'apagar'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'ação inválida → 22023: ' || v);

    -- 5. Obras do link (como anon, só com o token).
    v := pg_temp.como(NULL, 'anon', format(obras, tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'obras como anon: ' || v);
    PERFORM pg_temp.confere(position(ob::text IN v) > 0, 'a obra da org aparece: ' || v);
    PERFORM pg_temp.confere(position(orc::text IN v) = 0, 'orçamento não aparece');
    PERFORM pg_temp.confere(position(sis::text IN v) = 0, 'Gestão Comercial não aparece');
    PERFORM pg_temp.confere(position(fora::text IN v) = 0, 'obra de outra org não aparece');

    -- 4. Sem acesso a Compras.
    UPDATE public.organization_members SET permissions = permissions || '{"canViewOrders": false}'::jsonb WHERE id = m_id;
    v := pg_temp.direto(format(autoriza, tk, 'ler'));
    PERFORM pg_temp.confere(v = '42501:sem acesso a Pedidos de Compra', 'sem Compras recusa a autorização: ' || v);
    v := pg_temp.como(NULL, 'anon', format(obras, tk));
    PERFORM pg_temp.confere(v = '42501:sem acesso a Pedidos de Compra', 'sem Compras recusa a lista de obras: ' || v);

    -- 3. Token inválido e revogado.
    v := pg_temp.direto(format(autoriza, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'ler'));
    PERFORM pg_temp.confere(v = '42501:link inválido ou vencido', 'token inválido: ' || v);
    v := pg_temp.como(NULL, 'anon', format(obras, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    PERFORM pg_temp.confere(v = '42501:link inválido ou vencido', 'token inválido nas obras: ' || v);
    UPDATE public.user_mobile_links SET revoked_at = now() WHERE token_hash = public._mobile_link_hash(tk);
    v := pg_temp.direto(format(autoriza, tk, 'criar'));
    PERFORM pg_temp.confere(v = '42501:link inválido ou vencido', 'token revogado: ' || v);
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
