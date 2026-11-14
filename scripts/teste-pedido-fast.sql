-- scripts/teste-pedido-fast.sql
-- Prova da migration do Pedido Fast
-- (docs/planos/2026-11-14-pedido-fast.md, Parte 1 item 2;
--  supabase/migrations/aplicar_20271114500000_pedido_fast.sql).
--
--   1. as três funções novas são só da service_role (anon/authenticated → 42501);
--   2. fn_pode_criar_pedido_de: owner → sim; membro sem nada gravado → sim;
--      membro com canViewOrders=false → não; matriz do cargo com compras=false → não;
--      quem não é da org → não; fn_pode_criar_pedido_em_alguma_de acompanha;
--   3. fn_next_document_seq_de: membro → número; não membro → 42501;
--   4. gatilho de autoria: INSERT logado com criado_por forjado → auth.uid();
--      UPDATE logado não muda origem/criado_por/leitura_ia; sem sessão
--      (service_role) o INSERT guarda o criado_por que veio.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-pedido-fast.sql

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

DO $$
DECLARE
    v_org      UUID;
    v_owner    UUID;
    v_membro   UUID;
    v_membro_m UUID;
    v_fora     UUID;
    v_obra     UUID;
    v_r        TEXT;
    v_pedido   UUID;
BEGIN
    -- Uma org com owner de login, um membro 'member' de login e uma obra.
    SELECT om.organization_id, om.user_id INTO v_org, v_owner
      FROM public.organization_members om
     WHERE om.role = 'owner' AND om.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.organization_members m2
                    WHERE m2.organization_id = om.organization_id AND m2.role = 'member' AND m2.user_id IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.projects p
                    WHERE p.organization_id = om.organization_id
                      AND upper(btrim(p.settings ->> 'classification')) = 'OBRA')
     LIMIT 1;
    PERFORM pg_temp.confere(v_org IS NOT NULL, 'massa: org com owner, member e obra');

    SELECT om.id, om.user_id INTO v_membro_m, v_membro
      FROM public.organization_members om
     WHERE om.organization_id = v_org AND om.role = 'member' AND om.user_id IS NOT NULL
     LIMIT 1;

    SELECT u.id INTO v_fora FROM auth.users u
     WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = v_org
                          AND (om.user_id = u.id OR lower(om.email) = lower(u.email)))
     LIMIT 1;

    SELECT p.id INTO v_obra FROM public.projects p
     WHERE p.organization_id = v_org AND upper(btrim(p.settings ->> 'classification')) = 'OBRA'
     LIMIT 1;

    -- 1. Só service_role executa.
    v_r := pg_temp.como(v_owner, 'authenticated', format('SELECT public.fn_pode_criar_pedido_de(%L, %L)::text', v_owner, v_org));
    PERFORM pg_temp.confere(v_r LIKE '42501:%', 'authenticated não executa fn_pode_criar_pedido_de: ' || v_r);
    v_r := pg_temp.como(NULL, 'anon', format('SELECT public.fn_pode_criar_pedido_em_alguma_de(%L)::text', v_owner));
    PERFORM pg_temp.confere(v_r LIKE '42501:%', 'anon não executa fn_pode_criar_pedido_em_alguma_de: ' || v_r);
    v_r := pg_temp.como(v_owner, 'authenticated', format('SELECT public.fn_next_document_seq_de(%L, %L, %L, %L)::text', v_owner, v_org, 'PURCHASE_ORDER', 'prova'));
    PERFORM pg_temp.confere(v_r LIKE '42501:%', 'authenticated não executa fn_next_document_seq_de: ' || v_r);

    -- 2. Quem pode pedir.
    PERFORM pg_temp.confere(public.fn_pode_criar_pedido_de(v_owner, v_org), 'owner pode');
    PERFORM pg_temp.confere(NOT public.fn_pode_criar_pedido_de(v_fora, v_org), 'quem não é da org não pode');
    PERFORM pg_temp.confere(NOT public.fn_pode_criar_pedido_de(NULL, v_org), 'usuário nulo não pode');

    UPDATE public.organization_members SET permissions = '{}'::jsonb, custom_role_id = NULL WHERE id = v_membro_m;
    UPDATE public.organizations SET settings = coalesce(settings, '{}'::jsonb) - 'module_visibility' WHERE id = v_org;
    PERFORM pg_temp.confere(public.fn_pode_criar_pedido_de(v_membro, v_org), 'member sem nada gravado pode (padrão ligado)');

    UPDATE public.organizations
       SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{module_visibility}',
                                '{"platform": {"member": {"compras": false}}}'::jsonb)
     WHERE id = v_org;
    PERFORM pg_temp.confere(NOT public.fn_pode_criar_pedido_de(v_membro, v_org), 'matriz do cargo com compras=false barra');

    UPDATE public.organization_members SET permissions = '{"canViewOrders": true}'::jsonb WHERE id = v_membro_m;
    PERFORM pg_temp.confere(public.fn_pode_criar_pedido_de(v_membro, v_org), 'permissão do membro vence a matriz');

    UPDATE public.organization_members SET permissions = '{"canViewOrders": false}'::jsonb WHERE id = v_membro_m;
    PERFORM pg_temp.confere(NOT public.fn_pode_criar_pedido_de(v_membro, v_org), 'canViewOrders=false barra');

    PERFORM pg_temp.confere(public.fn_pode_criar_pedido_em_alguma_de(v_owner), 'owner pode em alguma');

    -- 3. Sequencial.
    PERFORM pg_temp.confere(public.fn_next_document_seq_de(v_owner, v_org, 'PURCHASE_ORDER', '__prova_pedido_fast__') >= 1, 'seq do membro');
    BEGIN
        PERFORM public.fn_next_document_seq_de(v_fora, v_org, 'PURCHASE_ORDER', '__prova_pedido_fast__');
        RAISE EXCEPTION 'FALHOU: seq de não membro passou';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- 4. Autoria.
    v_r := pg_temp.como(v_owner, 'authenticated', format(
        'INSERT INTO public.purchase_orders (project_id, status, items, origem, criado_por, leitura_ia)
         VALUES (%L, %L, %L::jsonb, %L, %L, %L::jsonb) RETURNING id::text || %L || criado_por::text',
        v_obra, 'Rascunho', '[]', 'FAST', v_fora, '{"x":1}', '|'));
    PERFORM pg_temp.confere(v_r LIKE 'ok:%', 'insert logado: ' || v_r);
    PERFORM pg_temp.confere(split_part(v_r, '|', 2) = v_owner::text, 'criado_por forjado vira auth.uid(): ' || v_r);
    v_pedido := split_part(substr(v_r, 4), '|', 1)::uuid;

    v_r := pg_temp.como(v_owner, 'authenticated', format(
        'UPDATE public.purchase_orders SET origem = NULL, criado_por = %L, leitura_ia = NULL, notes = %L
          WHERE id = %L RETURNING coalesce(origem, %L) || %L || criado_por::text || %L || coalesce(leitura_ia::text, %L) || %L || notes',
        v_fora, 'mexi', v_pedido, '-', '|', '|', '-', '|'));
    PERFORM pg_temp.confere(v_r = format('ok:FAST|%s|{"x": 1}|mexi', v_owner), 'update logado não muda autoria: ' || v_r);

    INSERT INTO public.purchase_orders (project_id, status, items, origem, criado_por)
    VALUES (v_obra, 'Rascunho', '[]'::jsonb, 'FAST', v_membro)
    RETURNING criado_por::text INTO v_r;
    PERFORM pg_temp.confere(v_r = v_membro::text, 'sem sessão guarda o criado_por enviado: ' || v_r);
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
