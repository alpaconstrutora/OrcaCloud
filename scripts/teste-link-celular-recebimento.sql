-- scripts/teste-link-celular-recebimento.sql
-- Prova da aba "Receber" do link /celular
-- (supabase/migrations/aplicar_20271127300400_link_celular_recebimento.sql;
--  docs/planos/2026-11-27-recebimento-mobile.md, Fase 2). Depende das 300100–300300.
--
--   1. dono do link membro de A (org do link) e de B, não de C: a lista traz pedidos de A
--      e B, nada de C; abrir B ok; abrir C → 42501;
--   2. _celular_recebimento_autoriza: só service_role; devolve dono e e-mail; ação
--      inválida → 22023; cota estourada → 54000 (o CHECK aceita as ações novas);
--   3. sem Compras em nenhuma org → 'sem acesso a Pedidos de Compra' (lista e autoriza);
--   4. token revogado → 'link inválido ou vencido' em todas.
--
-- BEGIN … ROLLBACK; sucesso = 'TUDO OK'.
--   npx supabase db query --linked -f scripts/teste-link-celular-recebimento.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims',
        CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
             ELSE json_build_object('sub', p_user, 'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user), 'role', p_papel)::text END,
        true);
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
    a UUID; b UUID; c UUID; m UUID; m_mid UUID; tk TEXT; link UUID;
    obra_a UUID; obra_b UUID; obra_c UUID; forn UUID;
    pa UUID; pb UUID; pc UUID;
    v TEXT; j JSONB;
    recusa   CONSTANT TEXT := '42501:link inválido ou vencido';
    sem      CONSTANT TEXT := '42501:sem acesso a Pedidos de Compra';
    listar   CONSTANT TEXT := 'SELECT public.celular_recebimento_listar(%L)::text';
    abrir    CONSTANT TEXT := 'SELECT public.celular_recebimento_abrir(%L, %L::uuid)::text';
    autoriza CONSTANT TEXT := 'SELECT (SELECT row(z.user_id, z.email)::text FROM public._celular_recebimento_autoriza(%L, %L) z)';
BEGIN
    -- m: member (não owner/admin em org nenhuma — a prova desliga Compras) de A.
    SELECT om.organization_id, om.user_id, om.id INTO a, m, m_mid
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.role = 'member' AND om.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.organization_members x WHERE x.user_id = om.user_id AND x.role IN ('owner', 'admin'))
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'massa: member');
    SELECT o.id INTO b FROM public.organizations o WHERE NOT public.is_org_member_de(m, o.id) ORDER BY o.id LIMIT 1;
    SELECT o.id INTO c FROM public.organizations o WHERE NOT public.is_org_member_de(m, o.id) AND o.id <> b ORDER BY o.id DESC LIMIT 1;
    PERFORM pg_temp.confere(b IS NOT NULL AND c IS NOT NULL, 'massa: orgs B e C sem m');
    -- Compras ligado em A; m entra em B com Compras (só nesta transação).
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewOrders": true}' WHERE id = m_mid;
    INSERT INTO public.organization_members (organization_id, user_id, email, role, permissions)
    VALUES (b, m, (SELECT email FROM auth.users WHERE id = m), 'member', '{"canViewOrders": true}');

    v := pg_temp.como(m, 'authenticated', format('SELECT public.mobile_link_generate(%L, %L)', m, a));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'massa: link de m em A (veio ' || v || ')');
    tk := substr(v, 4);
    SELECT l.id INTO link FROM public.user_mobile_links l WHERE l.token_hash = public._mobile_link_hash(tk);

    INSERT INTO public.projects (name, user_id, organization_id, settings) VALUES ('TLR obra A', m, a, jsonb_build_object('classification', 'OBRA', 'organizationId', a)) RETURNING id INTO obra_a;
    INSERT INTO public.projects (name, user_id, organization_id, settings) VALUES ('TLR obra B', m, b, jsonb_build_object('classification', 'OBRA', 'organizationId', b)) RETURNING id INTO obra_b;
    INSERT INTO public.projects (name, user_id, organization_id, settings) VALUES ('TLR obra C', m, c, jsonb_build_object('classification', 'OBRA', 'organizationId', c)) RETURNING id INTO obra_c;
    INSERT INTO public.suppliers (name, organization_id, email) VALUES ('TLR fornecedor', a, 'tlr-fornecedor@example.invalid') RETURNING id INTO forn;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, version)
    VALUES ('TLR-A', obra_a, forn, a, 'Entregue', '[{"code": "X", "quantity": 1}]', 1) RETURNING id INTO pa;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, version)
    VALUES ('TLR-B', obra_b, forn, b, 'Em Trânsito', '[{"code": "X", "quantity": 1}]', 1) RETURNING id INTO pb;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, version)
    VALUES ('TLR-C', obra_c, forn, c, 'Entregue', '[{"code": "X", "quantity": 1}]', 1) RETURNING id INTO pc;

    -- ── 1. lista e abrir nas orgs do dono ────────────────────────────────────
    v := pg_temp.como(NULL, 'anon', format(listar, tk));
    PERFORM pg_temp.confere(v LIKE 'ok:%', '1 listar como anon (veio ' || left(v, 200) || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pa AND e ->> 'grupo' = 'a_conferir')
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pb AND e ->> 'grupo' = 'a_conferir'
                                                                         AND e ->> 'org_id' = b::text)
                        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pc)
                        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE NOT public.is_org_member_de(m, (e ->> 'org_id')::uuid)),
        '1 lista: A (org do link) e B (outra org de m) sim; C não; nenhuma org de que m não é membro');
    v := pg_temp.como(NULL, 'anon', format(abrir, tk, pb));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) ->> 'org_id' = b::text, '1 abrir pedido de B (veio ' || left(v, 120) || ')');
    v := pg_temp.como(NULL, 'anon', format(abrir, tk, pc));
    PERFORM pg_temp.confere(v = '42501:pedido não encontrado ou sem permissão', '1 abrir pedido de C → 42501 (veio ' || v || ')');

    -- ── 2. autoriza (Edge) ───────────────────────────────────────────────────
    v := pg_temp.como(NULL, 'anon', format(autoriza, tk, 'receber'));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', '2 anon não executa o autoriza (veio ' || v || ')');
    v := pg_temp.como(m, 'authenticated', format(autoriza, tk, 'receber'));
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', '2 authenticated não executa o autoriza (veio ' || v || ')');
    v := pg_temp.direto(format(autoriza, tk, 'receber'));
    PERFORM pg_temp.confere(v = format('ok:(%s,%s)', m, (SELECT lower(email) FROM auth.users WHERE id = m)), '2 autoriza devolve dono e e-mail (veio ' || v || ')');
    v := pg_temp.direto(format(autoriza, tk, 'apagar'));
    PERFORM pg_temp.confere(v LIKE '22023:%', '2 ação inválida → 22023 (veio ' || v || ')');
    FOREACH v IN ARRAY ARRAY['retirada', 'subir', 'assinar'] LOOP
        PERFORM pg_temp.confere(pg_temp.direto(format(autoriza, tk, v)) LIKE 'ok:%', '2 ação ' || v || ' aceita pelo CHECK');
    END LOOP;
    UPDATE public.user_mobile_link_uso SET n = 30
     WHERE link_id = link AND acao = 'recebimento_receber' AND janela = date_trunc('hour', now(), 'UTC');
    v := pg_temp.direto(format(autoriza, tk, 'receber'));
    PERFORM pg_temp.confere(v LIKE '54000:%', '2 a 31ª conferência na hora → 54000 (veio ' || v || ')');

    -- ── 3. sem Compras em nenhuma org ────────────────────────────────────────
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewOrders": false}'
     WHERE user_id = m OR (user_id IS NULL AND lower(email) = (SELECT lower(email) FROM auth.users WHERE id = m));
    v := pg_temp.como(NULL, 'anon', format(listar, tk));
    PERFORM pg_temp.confere(v = sem, '3 sem Compras: lista recusa (veio ' || v || ')');
    v := pg_temp.direto(format(autoriza, tk, 'assinar'));
    PERFORM pg_temp.confere(v = sem, '3 sem Compras: autoriza recusa (veio ' || v || ')');

    -- ── 4. token revogado ────────────────────────────────────────────────────
    UPDATE public.user_mobile_links SET revoked_at = now() WHERE id = link;
    PERFORM pg_temp.confere(pg_temp.como(NULL, 'anon', format(listar, tk)) = recusa, '4 lista com token revogado');
    PERFORM pg_temp.confere(pg_temp.como(NULL, 'anon', format(abrir, tk, pa)) = recusa, '4 abrir com token revogado');
    PERFORM pg_temp.confere(pg_temp.direto(format(autoriza, tk, 'receber')) = recusa, '4 autoriza com token revogado');

    -- ── ACL ──────────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('anon', p.oid, 'EXECUTE') AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) z WHERE z.grantee = 0))
           FROM pg_proc p WHERE p.oid IN ('public.celular_recebimento_listar(text)'::regprocedure,
                                          'public.celular_recebimento_abrir(text, uuid)'::regprocedure)),
        'ACL: celular_recebimento_* para anon e authenticated, sem PUBLIC');
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
