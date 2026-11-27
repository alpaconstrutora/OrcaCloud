-- scripts/teste-recebimento-nucleo.sql
-- Prova do núcleo do Recebimento (docs/planos/2026-11-27-recebimento-mobile.md, Fase 2):
--   aplicar_20271127300100_recebimento_quem_recebeu.sql
--   aplicar_20271127300200_recebimento_nucleo_escrita.sql
--   aplicar_20271127300300_recebimento_leitura.sql
--
--   A. _recebimento_registrar_core — versão errada → CONFLICT (40001); Parcial deixa o
--      pedido Entregue com a versão +1, autor e origem gravados, índice do item; o MESMO
--      receipt_id de novo → "já existia" sem duplicar; 2ª conferência com divergência →
--      Divergência + purchase_discrepancies + foto no pedido; CIF "Confirmado" e pedido
--      já conferido → 22023; foto fora da pasta → 22023; não membro, membro sem Compras e
--      o próprio fornecedor → 42501.
--   B. _pedido_retirada_core — FOB: colaborador de outra org → 42501; CIF → 22023; data
--      futura → 22023; versão errada → CONFLICT; ok → Entregue + versão +1; repetir → já existia.
--   C. Fornecedor não mexe em pedido conferido (purchase_order_update_as_supplier → 'recebido').
--   D. Gatilho de autoria: insert direto com sessão grava o autor DA SESSÃO e origem APP.
--   E. Leitura: recebimento_listar/abrir pelas orgs do usuário com Compras, grupos, recorte
--      por org, pedido de outra org → 42501, anon sem EXECUTE.
--   F. ACL: núcleos sem EXECUTE para anon/authenticated.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …'; sucesso = 'TUDO OK'.
--   npx supabase db query --linked -f scripts/teste-recebimento-nucleo.sql
-- Para ensaiar ANTES de aplicar, ponha as 3 migrations, em ordem, no lugar da linha MIGRATION.

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

-- Como postgres (o papel da service_role na Edge), sem claims.
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
    org UUID; org2 UUID; m UUID; m_mid UUID; x UUID; y UUID;
    obra UUID; obra2 UUID; forn UUID; forn_y UUID; forn_m UUID;
    pc UUID; pc_conf UUID; pf UUID; pf_conf UUID; p_outra UUID; p_self UUID; p_novo UUID;
    e_ok UUID; e_fora UUID;
    r1 CONSTANT UUID := gen_random_uuid();
    r2 CONSTANT UUID := gen_random_uuid();
    v TEXT; j JSONB;
    fob CONSTANT TEXT := 'FOB - Retirada por conta do comprador';
    itens CONSTANT JSONB := '[{"code": "C1", "description": "Cimento", "unit": "sc", "quantity": 10},
                              {"code": "A1", "description": "Areia", "unit": "m3", "quantity": 4}]';
    reg CONSTANT TEXT := 'SELECT public._recebimento_registrar_core(%L::uuid, %L::uuid, %L::uuid, %s, %L, %L, %L, %L, %L::jsonb, %L::jsonb, %L::jsonb, %L)::text';
    ret CONSTANT TEXT := 'SELECT public._pedido_retirada_core(%L::uuid, %L::uuid, %s, %L::date, %L::uuid)::text';
    linhas_parcial CONSTANT JSONB := '[{"order_item_index": 0, "order_item_code": "C1", "description": "Cimento", "unit": "sc", "quantity_ordered": 10, "quantity_received": 6},
                                       {"order_item_index": 1, "order_item_code": "A1", "description": "Areia", "unit": "m3", "quantity_ordered": 4, "quantity_received": 4}]';
    linhas_div CONSTANT JSONB := '[{"order_item_index": 0, "order_item_code": "C1", "description": "Cimento", "unit": "sc", "quantity_ordered": 4, "quantity_received": 3, "issue": "quebrado", "notes": "1 rasgado"}]';
    div CONSTANT JSONB := '[{"order_item_code": "C1", "description": "Cimento", "unit": "sc", "issue": "quebrado", "quantity": 1, "notes": "1 rasgado"}]';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    -- m: member (com e-mail na linha de membro, não superadmin) de org.
    SELECT om.organization_id, om.user_id, om.id INTO org, m, m_mid
      FROM public.organization_members om JOIN auth.users au ON au.id = om.user_id
     WHERE om.role = 'member' AND om.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY om.organization_id, om.user_id LIMIT 1;
    PERFORM pg_temp.confere(m IS NOT NULL, 'massa: member com e-mail');
    UPDATE public.organization_members SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewOrders": true}' WHERE id = m_mid;
    SELECT o.id INTO org2 FROM public.organizations o WHERE NOT public.is_org_member_de(m, o.id) ORDER BY o.id LIMIT 1;
    SELECT au.id INTO x FROM auth.users au
     WHERE NOT public.is_org_member_de(au.id, org) AND au.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id LIMIT 1;
    SELECT au.id INTO y FROM auth.users au
     WHERE au.id NOT IN (m, x) AND au.email IS NOT NULL AND NOT public.is_org_member_de(au.id, org)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins sa WHERE sa.email = lower(au.email))
     ORDER BY au.id DESC LIMIT 1;
    PERFORM pg_temp.confere(org2 IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL, 'massa: org2, x e y');

    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TRN obra', m, org, jsonb_build_object('classification', 'OBRA', 'organizationId', org)) RETURNING id INTO obra;
    INSERT INTO public.projects (name, user_id, organization_id, settings)
    VALUES ('TRN obra de fora', m, org2, jsonb_build_object('classification', 'OBRA', 'organizationId', org2)) RETURNING id INTO obra2;
    INSERT INTO public.suppliers (name, organization_id, email) VALUES ('TRN fornecedor', org, 'trn-fornecedor@example.invalid') RETURNING id INTO forn;
    -- suppliers.email é único: reaproveita o cadastro que já tiver o e-mail de y.
    SELECT s.id INTO forn_y FROM public.suppliers s WHERE lower(s.email) = (SELECT lower(email) FROM auth.users WHERE id = y) LIMIT 1;
    IF forn_y IS NULL THEN
        INSERT INTO public.suppliers (name, organization_id, email) VALUES ('TRN fornecedor y', org, (SELECT email FROM auth.users WHERE id = y)) RETURNING id INTO forn_y;
    END IF;
    -- suppliers.email é único: reaproveita o cadastro que já tiver o e-mail de m.
    SELECT s.id INTO forn_m FROM public.suppliers s WHERE lower(s.email) = (SELECT lower(email) FROM auth.users WHERE id = m) LIMIT 1;
    IF forn_m IS NULL THEN
        INSERT INTO public.suppliers (name, organization_id, email) VALUES ('TRN fornecedor m', org, (SELECT email FROM auth.users WHERE id = m)) RETURNING id INTO forn_m;
    END IF;

    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-CIF', obra, forn_y, org, 'Em Trânsito', itens, 'CIF - Entrega por conta do fornecedor', 3) RETURNING id INTO pc;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-CIF-CONF', obra, forn, org, 'Confirmado', itens, NULL, 1) RETURNING id INTO pc_conf;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-FOB', obra, forn, org, 'Entregue', itens, fob, 1) RETURNING id INTO pf;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-FOB-CONF', obra, forn, org, 'Confirmado', itens, fob, 2) RETURNING id INTO pf_conf;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-FORA', obra2, forn, org2, 'Entregue', itens, NULL, 1) RETURNING id INTO p_outra;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-SELF', obra, forn_m, org, 'Entregue', itens, NULL, 1) RETURNING id INTO p_self;
    INSERT INTO public.purchase_orders (number, project_id, supplier_id, organization_id, status, items, delivery_method, version)
    VALUES ('TRN-NOVO', obra, forn_y, org, 'Em Trânsito', itens, NULL, 1) RETURNING id INTO p_novo;

    INSERT INTO public.employees (org_id, name, status) VALUES (org, 'TRN Ana', 'ATIVO') RETURNING id INTO e_ok;
    INSERT INTO public.employees (org_id, name, status) VALUES (org2, 'TRN de fora', 'ATIVO') RETURNING id INTO e_fora;

    -- ── A. conferência ───────────────────────────────────────────────────────
    v := pg_temp.direto(format(reg, m, pc, r1, 2, 'Parcial', 'Entregue', 'chegou metade', NULL, linhas_parcial, '[]', NULL, 'LINK'));
    PERFORM pg_temp.confere(v LIKE '40001:CONFLICT%', 'A versão errada → CONFLICT (veio ' || v || ')');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.purchase_receipts WHERE order_id = pc), 'A o conflito não deixou conferência órfã');

    v := pg_temp.direto(format(reg, m, pc, r1, 3, 'Parcial', 'Entregue', 'chegou metade', NULL, linhas_parcial, '[]', NULL, 'LINK'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) ->> 'versao' = '4' AND (substr(v, 4)::jsonb) -> 'ja_existia' = 'false',
        'A parcial gravado, versão 4 (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT status = 'Entregue' AND version = 4 AND received_at IS NOT NULL AND actual_delivery_date IS NOT NULL
                                    AND receipt_notes = 'chegou metade' FROM public.purchase_orders WHERE id = pc),
        'A pedido CIF "Em Trânsito" recebido parcial fica Entregue, com data de entrega e recebimento');
    PERFORM pg_temp.confere((SELECT received_by = m AND origem = 'LINK' AND status = 'Parcial' FROM public.purchase_receipts WHERE id = r1),
        'A autor e origem gravados pelo núcleo (sem sessão)');
    PERFORM pg_temp.confere((SELECT array_agg(order_item_index ORDER BY order_item_index) FROM public.purchase_receipt_items WHERE receipt_id = r1) = ARRAY[0, 1],
        'A itens com o índice do pedido');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.purchase_discrepancies WHERE order_id = pc), 'A parcial sem divergência');

    v := pg_temp.direto(format(reg, m, pc, r1, 3, 'Parcial', 'Entregue', 'chegou metade', NULL, linhas_parcial, '[]', NULL, 'LINK'));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'ja_existia' = 'true' AND (substr(v, 4)::jsonb) ->> 'versao' = '4',
        'A o MESMO receipt_id de novo → já existia, sem conflito (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.purchase_receipts WHERE order_id = pc) = 1, 'A reenvio não duplicou');

    v := pg_temp.direto(format(reg, m, pc, r2, 4, 'Divergência', 'Divergência', NULL, 'x/fora.jpg', linhas_div, div, '[{"code": "C1"}]', 'APP'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'A foto fora da pasta do pedido → 22023 (veio ' || v || ')');
    v := pg_temp.direto(format(reg, m, pc, r2, 4, 'Divergência', 'Divergência', NULL, pc || '/receipt_' || r2 || '.jpg', linhas_div, div, '[{"code": "C1"}]', 'APP'));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'A 2ª conferência com divergência (veio ' || v || ')');
    PERFORM pg_temp.confere((SELECT status = 'Divergência' AND version = 5 AND receipt_photo_path = pc || '/receipt_' || r2 || '.jpg'
                                    AND discrepancy_report = '[{"code": "C1"}]' FROM public.purchase_orders WHERE id = pc),
        'A pedido Divergência, versão 5, foto e relatório no pedido');
    PERFORM pg_temp.confere((SELECT count(*) = 1 AND bool_and(issue = 'quebrado' AND quantity = 1 AND status = 'Pendente' AND receipt_id = r2)
                               FROM public.purchase_discrepancies WHERE order_id = pc),
        'A divergência aberta (Pendente) ligada à conferência');

    v := pg_temp.direto(format(reg, m, pc, gen_random_uuid(), 5, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '22023:%não pode ser conferido%', 'A pedido já conferido → 22023 (veio ' || v || ')');
    v := pg_temp.direto(format(reg, m, pc_conf, gen_random_uuid(), 1, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '22023:%Confirmado%', 'A CIF "Confirmado" não recebe → 22023 (veio ' || v || ')');
    v := pg_temp.direto(format(reg, m, pf, gen_random_uuid(), 1, 'Parcial', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '22023:%', 'A status do pedido incoerente com o da conferência → 22023 (veio ' || v || ')');

    v := pg_temp.direto(format(reg, x, pf, gen_random_uuid(), 1, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'A não membro → 42501 (veio ' || v || ')');
    v := pg_temp.direto(format(reg, m, p_outra, gen_random_uuid(), 1, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'A pedido de org de que m não é membro → 42501 (veio ' || v || ')');
    v := pg_temp.direto(format(reg, m, p_self, gen_random_uuid(), 1, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '42501:O fornecedor não confere%', 'A o próprio fornecedor → 42501 (veio ' || v || ')');
    UPDATE public.organization_members SET permissions = permissions || '{"canViewOrders": false}' WHERE id = m_mid;
    v := pg_temp.direto(format(reg, m, pf, gen_random_uuid(), 1, 'Recebido', 'Recebido', NULL, NULL, linhas_parcial, '[]', NULL, 'APP'));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'A membro sem Compras → 42501 (veio ' || v || ')');
    UPDATE public.organization_members SET permissions = permissions || '{"canViewOrders": true}' WHERE id = m_mid;

    -- ── B. retirada FOB ──────────────────────────────────────────────────────
    v := pg_temp.direto(format(ret, m, pf_conf, 2, current_date, e_fora));
    PERFORM pg_temp.confere(v LIKE '42501:Colaborador%', 'B colaborador de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.direto(format(ret, m, pc_conf, 1, current_date, e_ok));
    PERFORM pg_temp.confere(v LIKE '22023:Só pedido FOB%', 'B CIF não tem retirada (veio ' || v || ')');
    v := pg_temp.direto(format(ret, m, pf_conf, 2, current_date + 5, e_ok));
    PERFORM pg_temp.confere(v LIKE '22023:%futura%', 'B data futura → 22023 (veio ' || v || ')');
    v := pg_temp.direto(format(ret, m, pf_conf, 1, current_date, e_ok));
    PERFORM pg_temp.confere(v LIKE '40001:CONFLICT%', 'B versão errada → CONFLICT (veio ' || v || ')');
    v := pg_temp.direto(format(ret, m, pf_conf, 2, current_date, e_ok));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (SELECT status = 'Entregue' AND version = 3 AND retirado_por_employee_id = e_ok
                                                       AND actual_delivery_date::date = current_date FROM public.purchase_orders WHERE id = pf_conf),
        'B retirada registrada: Entregue, versão 3 (veio ' || v || ')');
    v := pg_temp.direto(format(ret, m, pf_conf, 2, current_date, e_ok));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND (substr(v, 4)::jsonb) -> 'ja_existia' = 'true', 'B repetir a mesma retirada → já existia (veio ' || v || ')');

    -- ── C. fornecedor não mexe em pedido conferido ───────────────────────────
    v := pg_temp.como(y, 'authenticated', format('SELECT public.purchase_order_update_as_supplier(%L::uuid, %L)::text', pc, 'Entregue'));
    PERFORM pg_temp.confere(v LIKE 'ok:%"recebido"%' AND (SELECT status FROM public.purchase_orders WHERE id = pc) = 'Divergência',
        'C fornecedor não volta pedido conferido para Entregue (veio ' || v || ')');
    v := pg_temp.como(y, 'authenticated', format('SELECT public.purchase_order_update_as_supplier(%L::uuid, %L)::text', p_novo, 'Recebido'));
    PERFORM pg_temp.confere(v LIKE 'ok:%"recebido"%', 'C fornecedor não marca Recebido (veio ' || v || ')');
    v := pg_temp.como(y, 'authenticated', format('SELECT public.purchase_order_update_as_supplier(%L::uuid, %L)::text', p_novo, 'Entregue'));
    PERFORM pg_temp.confere(v LIKE 'ok:%"valid": true%' AND (SELECT status = 'Entregue' AND version = 2 FROM public.purchase_orders WHERE id = p_novo),
        'C sem conferência, o fornecedor segue marcando Entregue (veio ' || left(v, 80) || ')');
    PERFORM pg_temp.confere((SELECT p.prosrc LIKE '%version              = COALESCE(version, 0) + 1%' AND p.prosrc LIKE '%"reason":"recebido"%'
                               FROM pg_proc p WHERE p.oid = 'public.supplier_portal_update_order_logistics(text, uuid, text, date, date, date, date)'::regprocedure),
        'C RPC do fornecedor por token: trava de conferido e versão +1');

    -- ── D. gatilho de autoria ────────────────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', format(
        'INSERT INTO public.purchase_receipts (order_id, status, received_by, origem) VALUES (%L, %L, %L, %L) RETURNING (received_by::text || '','' || origem)',
        pf, 'Recebido', x, 'LINK'));
    PERFORM pg_temp.confere(v = 'ok:' || m || ',APP', 'D insert direto com sessão grava o autor DA SESSÃO e origem APP (veio ' || v || ')');

    -- ── E. leitura ───────────────────────────────────────────────────────────
    v := pg_temp.como(m, 'authenticated', 'SELECT public.recebimento_listar()::text');
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'E listar (veio ' || left(v, 200) || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(
        (SELECT e ->> 'grupo' FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pc_conf) = 'a_caminho'
        AND (SELECT e ->> 'grupo' FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pf) = 'a_conferir'
        AND (SELECT e ->> 'grupo' FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pf_conf) = 'a_conferir'
        AND (SELECT e ->> 'grupo' FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pc) = 'conferidos'
        AND (SELECT e ->> 'grupo' FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = p_novo) = 'a_conferir'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid IN (p_outra, p_self)),
        'E grupos: CIF confirmado a caminho; FOB retirado e CIF entregue a conferir; conferido; nada de outra org nem do próprio fornecedor');
    PERFORM pg_temp.confere((SELECT (e ->> 'divergencias_pendentes')::int = 1 AND e ->> 'org_id' = org::text AND (e -> 'fob') = 'false'
                               FROM jsonb_array_elements(j) e WHERE (e ->> 'id')::uuid = pc),
        'E linha traz org, FOB e divergências pendentes');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.recebimento_listar(%L::uuid)::text', org2));
    PERFORM pg_temp.confere(v = 'ok:[]', 'E recorte por org de que m não é membro → vazio (veio ' || left(v, 80) || ')');

    v := pg_temp.como(m, 'authenticated', format('SELECT public.recebimento_abrir(%L::uuid)::text', pc));
    PERFORM pg_temp.confere(v LIKE 'ok:%', 'E abrir (veio ' || left(v, 200) || ')');
    j := substr(v, 4)::jsonb;
    PERFORM pg_temp.confere(jsonb_array_length(j -> 'itens') = 2 AND (j -> 'itens' -> 1 ->> 'indice') = '1'
                        AND (j -> 'itens' -> 0 ->> 'quantity')::numeric = 10
                        AND jsonb_array_length(j -> 'conferencias') = 2
                        AND (j -> 'conferencias' -> 0 ->> 'status') = 'Parcial'
                        AND (j -> 'conferencias' -> 0 ->> 'origem') = 'LINK'
                        AND jsonb_array_length(j -> 'conferencias' -> 0 -> 'itens') = 2
                        AND jsonb_array_length(j -> 'divergencias') = 1
                        AND (j ->> 'versao') = '5',
        'E abrir: itens com índice, conferências com itens e origem, divergências, versão');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.recebimento_abrir(%L::uuid)::text', pf_conf));
    PERFORM pg_temp.confere(v LIKE 'ok:%' AND jsonb_array_length((substr(v, 4)::jsonb) -> 'colaboradores') = 0,
        'E FOB já retirado não oferece colaboradores');
    v := pg_temp.como(m, 'authenticated', format('SELECT public.recebimento_abrir(%L::uuid)::text', p_outra));
    PERFORM pg_temp.confere(v LIKE '42501:%', 'E abrir pedido de outra org → 42501 (veio ' || v || ')');
    v := pg_temp.como(NULL, 'anon', 'SELECT public.recebimento_listar()::text');
    PERFORM pg_temp.confere(v LIKE '42501:permission denied%', 'E anon não lista (veio ' || v || ')');

    -- ── F. ACL ───────────────────────────────────────────────────────────────
    PERFORM pg_temp.confere(
        (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         AND p.proacl IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0))
              AND count(*) = 8
           FROM pg_proc p
          WHERE p.oid IN ('public._pedido_org(uuid)'::regprocedure,
                          'public._recebimento_autoriza_de(uuid, uuid)'::regprocedure,
                          'public._recebimento_status_recebe(text, text)'::regprocedure,
                          'public._recebimento_registrar_core(uuid, uuid, uuid, integer, text, text, text, text, jsonb, jsonb, jsonb, text)'::regprocedure,
                          'public._pedido_retirada_core(uuid, uuid, integer, date, uuid)'::regprocedure,
                          'public._recebimento_paths_permitidos(uuid, text[])'::regprocedure,
                          'public._recebimento_listar_de(uuid, uuid)'::regprocedure,
                          'public._recebimento_abrir_de(uuid, uuid)'::regprocedure)),
        'F núcleos (8): sem EXECUTE para PUBLIC, anon e authenticated');
    PERFORM pg_temp.confere(
        (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
           FROM pg_proc p WHERE p.oid IN ('public.recebimento_listar(uuid)'::regprocedure, 'public.recebimento_abrir(uuid)'::regprocedure)),
        'F recebimento_listar/abrir: authenticated sim, anon não');
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
