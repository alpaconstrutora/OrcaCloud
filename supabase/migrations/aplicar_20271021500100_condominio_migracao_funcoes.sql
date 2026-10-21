-- ============================================================================
-- Condomínio com organização própria — F1, funções de migração com reversão
--
-- Plano: docs/planos/2026-10-21-sindico-operador-org-condominio.md
-- Decisão do usuário (21/10/2026): migrar TODO o histórico da operação do
-- condomínio para a org nova; o cadastro do prédio fica na org dona.
--
-- Peças (todas só para o sistema — sem GRANT a anon/authenticated):
--  - condominio_migracao_registro: CADA valor trocado (e cada linha inserida),
--    por lote. NUNCA apagar: é o que permite reverter e auditar.
--  - fn_condominio_migracao_plano: a lista exata do que muda (tabela, coluna,
--    linha, valor novo). Só as linhas que estão na org de ORIGEM (a do
--    empreendimento); o que já está noutra org fica de fora e é listado.
--  - fn_condominio_migracao_inventario: o ENSAIO — só lê; contagens, somas,
--    bloqueios e o que não migra.
--  - fn_condominio_migrar / fn_condominio_migracao_reverter.
--
-- Gatilhos de usuário das tabelas tocadas ficam DESLIGADOS dentro da
-- transação da migração (ALTER TABLE … DISABLE TRIGGER USER) e são religados
-- no fim: trocar só a organização de uma linha não pode disparar regra de
-- negócio (sincronizar baixa de boleto, regravar valor de título pago,
-- comissão, recibo, herança de org…). As travas que importam — período
-- contábil fechado e competência de Contas a Pagar fechada — viram checagem
-- explícita ANTES de mexer. Se qualquer coisa falhar, o ROLLBACK desfaz tudo,
-- inclusive o desligamento.
--
-- NÃO migra (fica na org de origem, decidido no plano): bank_transactions (o
-- extrato é da conta; reconciliation_matches não tem org e o vínculo segue),
-- process_instances (alertas automáticos da origem), warranty_claims,
-- email_capture_messages, empreendimento/torres/unidades/commercial_properties.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.condominio_migracao_registro (
    id            bigserial PRIMARY KEY,
    lote          text NOT NULL,
    tabela        text NOT NULL,
    registro_id   text NOT NULL,
    coluna        text NOT NULL,
    valor_antigo  text,
    valor_novo    text,
    em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_condominio_migracao_registro_lote ON public.condominio_migracao_registro (lote, id);
COMMENT ON TABLE public.condominio_migracao_registro IS
    'Cada valor trocado e cada linha inserida pelas migrações de condomínio para organização própria (21/10/2026). Coluna __insert__/__copia__ = linha criada. NUNCA APAGAR: é a reversão.';
ALTER TABLE public.condominio_migracao_registro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.condominio_migracao_registro FROM PUBLIC, anon, authenticated;

-- Tabelas cujos gatilhos de usuário ficam desligados durante migrar/reverter.
CREATE OR REPLACE FUNCTION public.fn_cm_gatilhos(p_ligar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_t text;
BEGIN
    FOREACH v_t IN ARRAY ARRAY['internal_transactions', 'boletos', 'invoices', 'contracts',
        'condominio_rateios', 'condominio_rateio_itens', 'purchase_orders', 'unit_occupancies',
        'cost_centers_v2', 'empreendimentos', 'clients', 'opura_assets', 'maintenance_orders',
        'maintenance_plan_items'] LOOP
        EXECUTE format('ALTER TABLE public.%I %s TRIGGER USER', v_t, CASE WHEN p_ligar THEN 'ENABLE' ELSE 'DISABLE' END);
    END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cm_gatilhos(boolean) FROM PUBLIC, anon, authenticated;

-- Troca uma coluna de um conjunto de linhas, registrando o valor antigo.
CREATE OR REPLACE FUNCTION public.fn_cm_aplicar(p_lote text, p_tabela text, p_coluna text, p_ids text[], p_valor text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tipo text;
    v_n    integer;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
      FROM pg_attribute a
     WHERE a.attrelid = format('public.%I', p_tabela)::regclass AND a.attname = p_coluna AND NOT a.attisdropped;
    IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Coluna %.% não existe.', p_tabela, p_coluna;
    END IF;

    EXECUTE format(
        'INSERT INTO public.condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
         SELECT $1, $2, id::text, $3, %1$I::text, $4 FROM public.%2$I
          WHERE id::text = ANY($5) AND %1$I IS DISTINCT FROM $4::%3$s', p_coluna, p_tabela, v_tipo)
        USING p_lote, p_tabela, p_coluna, p_valor, p_ids;

    EXECUTE format(
        'UPDATE public.%2$I SET %1$I = $1::%3$s WHERE id::text = ANY($2) AND %1$I IS DISTINCT FROM $1::%3$s',
        p_coluna, p_tabela, v_tipo)
        USING p_valor, p_ids;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cm_aplicar(text, text, text, text[], text) FROM PUBLIC, anon, authenticated;

-- ── O plano: o que muda, linha a linha ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_condominio_migracao_plano(p_emp uuid, p_org_dest uuid DEFAULT NULL, p_empresa_dest uuid DEFAULT NULL)
 RETURNS TABLE (ordem integer, tabela text, coluna text, registro_id text, valor_novo text)
 LANGUAGE plpgsql
 VOLATILE  -- cria tabelas temporárias
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_src   uuid;
    v_code  text;
    v_dest  text := coalesce(p_org_dest::text, '<destino>');
    v_emp_d text := coalesce(p_empresa_dest::text, '<matriz>');
    v_raiz  uuid;
    v_t     text;
BEGIN
    SELECT e.organization_id, e.code INTO v_src, v_code FROM empreendimentos e WHERE e.id = p_emp;
    IF v_src IS NULL THEN
        RAISE EXCEPTION 'Empreendimento % não encontrado.', p_emp;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _cm_cc (id uuid) ON COMMIT DROP;      TRUNCATE _cm_cc;
    CREATE TEMP TABLE IF NOT EXISTS _cm_ct (id uuid) ON COMMIT DROP;      TRUNCATE _cm_ct;
    CREATE TEMP TABLE IF NOT EXISTS _cm_tx (id uuid) ON COMMIT DROP;      TRUNCATE _cm_tx;
    CREATE TEMP TABLE IF NOT EXISTS _cm_bo (id uuid) ON COMMIT DROP;      TRUNCATE _cm_bo;
    CREATE TEMP TABLE IF NOT EXISTS _cm_un (id uuid) ON COMMIT DROP;      TRUNCATE _cm_un;
    CREATE TEMP TABLE IF NOT EXISTS _cm_ra (id uuid) ON COMMIT DROP;      TRUNCATE _cm_ra;

    INSERT INTO _cm_cc SELECT id FROM cost_centers_v2 WHERE empreendimento_id = p_emp AND organization_id = v_src;
    INSERT INTO _cm_ct SELECT id FROM contracts WHERE cost_center_id IN (SELECT id FROM _cm_cc) AND organization_id = v_src;
    INSERT INTO _cm_tx SELECT id FROM internal_transactions
     WHERE organization_id = v_src AND (cost_center_id IN (SELECT id FROM _cm_cc) OR contract_id IN (SELECT id FROM _cm_ct));
    INSERT INTO _cm_bo SELECT id FROM boletos WHERE cost_center_id IN (SELECT id FROM _cm_cc) AND organization_id = v_src;
    INSERT INTO _cm_un SELECT u.id FROM empreendimento_units u JOIN empreendimento_towers t ON t.id = u.tower_id WHERE t.empreendimento_id = p_emp;
    INSERT INTO _cm_ra SELECT id FROM condominio_rateios WHERE empreendimento_id = p_emp AND organization_id = v_src;

    -- Centro de custo raiz da org nova: o de código igual ao do condomínio, ou o primeiro.
    SELECT c.id INTO v_raiz FROM cost_centers_v2 c WHERE c.id IN (SELECT id FROM _cm_cc)
     ORDER BY (c.code = v_code) DESC, c.code LIMIT 1;

    -- 10/11 · centros de custo
    RETURN QUERY SELECT 10, 'cost_centers_v2', 'organization_id', id::text, v_dest FROM _cm_cc;
    RETURN QUERY SELECT 10, 'cost_centers_v2', 'empresa_id', id::text, v_emp_d FROM _cm_cc;
    RETURN QUERY SELECT 11, 'cost_centers_v2', 'parent_id', id::text, CASE WHEN id = v_raiz THEN NULL ELSE v_raiz::text END FROM _cm_cc;
    -- 20 · o vínculo
    RETURN QUERY SELECT 20, 'empreendimentos', 'condominio_org_id', p_emp::text, v_dest;
    -- 30 · dados do condomínio pelo empreendimento
    FOREACH v_t IN ARRAY ARRAY['condominio_avisos', 'condominio_documentos', 'maintenance_plans', 'maintenance_orders', 'opura_assets'] LOOP
        RETURN QUERY EXECUTE format('SELECT 30, %L, ''organization_id'', id::text, %L FROM public.%I WHERE empreendimento_id = $1 AND organization_id = $2', v_t, v_dest, v_t)
            USING p_emp, v_src;
    END LOOP;
    RETURN QUERY SELECT 30, 'condominio_rateios', 'organization_id', id::text, v_dest FROM _cm_ra;
    -- 31 · filhos (rateio, plano, ativo)
    FOREACH v_t IN ARRAY ARRAY['condominio_rateio_itens', 'condo_rateio_number_history', 'condominio_rateio_decisoes'] LOOP
        RETURN QUERY EXECUTE format('SELECT 31, %L, ''organization_id'', id::text, %L FROM public.%I WHERE rateio_id IN (SELECT id FROM _cm_ra) AND organization_id = $1', v_t, v_dest, v_t)
            USING v_src;
    END LOOP;
    RETURN QUERY SELECT 31, 'maintenance_plan_items', 'organization_id', i.id::text, v_dest FROM maintenance_plan_items i
      WHERE i.organization_id = v_src AND i.plan_id IN (SELECT id FROM maintenance_plans WHERE empreendimento_id = p_emp);
    FOREACH v_t IN ARRAY ARRAY['opura_asset_documents', 'opura_asset_maintenances', 'opura_asset_movements', 'opura_asset_reservations'] LOOP
        RETURN QUERY EXECUTE format('SELECT 31, %L, ''organization_id'', id::text, %L FROM public.%I WHERE organization_id = $1 AND asset_id IN (SELECT id FROM opura_assets WHERE empreendimento_id = $2)', v_t, v_dest, v_t)
            USING v_src, p_emp;
    END LOOP;
    -- 40 · ocupações, acessos, chamados, token do síndico
    RETURN QUERY SELECT 40, 'unit_occupancies', 'organization_id', id::text, v_dest FROM unit_occupancies WHERE unit_id IN (SELECT id FROM _cm_un) AND organization_id = v_src;
    RETURN QUERY SELECT 40, 'condomino_portal_access', 'organization_id', id::text, v_dest FROM condomino_portal_access WHERE unit_id IN (SELECT id FROM _cm_un) AND organization_id = v_src;
    RETURN QUERY SELECT 40, 'client_requests', 'organization_id', id::text, v_dest FROM client_requests WHERE unit_id IN (SELECT id FROM _cm_un) AND organization_id = v_src;
    RETURN QUERY SELECT 40, 'client_request_eventos', 'organization_id', ev.id::text, v_dest FROM client_request_eventos ev
      WHERE ev.organization_id = v_src AND ev.request_id IN (SELECT id FROM client_requests WHERE unit_id IN (SELECT id FROM _cm_un));
    RETURN QUERY SELECT 40, 'sindico_portal_tokens', 'org_id', t.id::text, v_dest FROM sindico_portal_tokens t
      WHERE t.org_id = v_src AND t.client_id = (SELECT sindico_client_id FROM empreendimentos WHERE id = p_emp);
    -- 50 · contratos e filhos
    RETURN QUERY SELECT 50, 'contracts', 'organization_id', id::text, v_dest FROM _cm_ct;
    FOREACH v_t IN ARRAY ARRAY['contract_acceptances', 'contract_addendums', 'contract_document_requirements',
        'contract_document_versions', 'contract_evaluations', 'contract_guarantees', 'contract_interfaces',
        'contract_labor_questionnaires', 'contract_number_history', 'contract_penalties',
        'contract_precedent_conditions', 'contract_retention_releases', 'contract_risk_assessments',
        'contract_supply_matrix', 'contract_technical_responsibilities', 'doc_gen_documentos',
        'opura_documents', 'client_service_orders'] LOOP
        RETURN QUERY EXECUTE format('SELECT 51, %L, ''organization_id'', id::text, %L FROM public.%I WHERE contract_id IN (SELECT id FROM _cm_ct) AND organization_id = $1', v_t, v_dest, v_t)
            USING v_src;
    END LOOP;
    -- 60 · títulos (e projeto da origem → NULL: a org nova não tem os projetos)
    RETURN QUERY SELECT 60, 'internal_transactions', 'organization_id', id::text, v_dest FROM _cm_tx;
    RETURN QUERY SELECT 61, 'internal_transactions', 'project_id', it.id::text, NULL::text FROM internal_transactions it
      JOIN projects p ON p.id = it.project_id WHERE it.id IN (SELECT id FROM _cm_tx) AND p.organization_id = v_src;
    FOREACH v_t IN ARRAY ARRAY['financial_receipts', 'dunning_events', 'client_charges', 'property_expense_allocations'] LOOP
        RETURN QUERY EXECUTE format('SELECT 62, %L, ''organization_id'', id::text, %L FROM public.%I WHERE transaction_id IN (SELECT id FROM _cm_tx) AND organization_id = $1', v_t, v_dest, v_t)
            USING v_src;
    END LOOP;
    RETURN QUERY SELECT 62, 'supplier_payments', 'organization_id', id::text, v_dest FROM supplier_payments
      WHERE organization_id = v_src AND (transaction_id IN (SELECT id FROM _cm_tx) OR boleto_id IN (SELECT id FROM _cm_bo));
    -- 70 · boletos e auditoria
    RETURN QUERY SELECT 70, 'boletos', 'organization_id', id::text, v_dest FROM _cm_bo;
    RETURN QUERY SELECT 71, 'boletos', 'project_id', b.id::text, NULL::text FROM boletos b
      JOIN projects p ON p.id = b.project_id WHERE b.id IN (SELECT id FROM _cm_bo) AND p.organization_id = v_src;
    RETURN QUERY SELECT 72, 'boletos_auditoria', 'organization_id', id::text, v_dest FROM boletos_auditoria WHERE boleto_id IN (SELECT id FROM _cm_bo) AND organization_id = v_src;
    -- 75 · notas
    RETURN QUERY SELECT 75, 'invoices', 'organization_id', i.id::text, v_dest FROM invoices i
      WHERE i.organization_id = v_src AND (i.cost_center_id IN (SELECT id FROM _cm_cc) OR i.id IN (SELECT invoice_id FROM boletos WHERE id IN (SELECT id FROM _cm_bo)));
    -- 80 · pedidos e memória de classificação da conciliação
    RETURN QUERY SELECT 80, 'purchase_orders', 'organization_id', id::text, v_dest FROM purchase_orders WHERE cost_center_id IN (SELECT id FROM _cm_cc) AND organization_id = v_src;
    RETURN QUERY SELECT 81, 'purchase_orders', 'project_id', po.id::text, NULL::text FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id WHERE po.cost_center_id IN (SELECT id FROM _cm_cc) AND po.organization_id = v_src AND p.organization_id = v_src;
    RETURN QUERY SELECT 80, 'reconciliation_classification_memory', 'organization_id', id::text, v_dest FROM reconciliation_classification_memory WHERE cost_center_id IN (SELECT id FROM _cm_cc) AND organization_id = v_src;
    -- 90 · compartilhamentos (o cadastro fica na origem; a org nova passa a ver)
    RETURN QUERY SELECT DISTINCT 90, 'supplier_org_shares', '__insert__', s.sid::text, v_dest FROM (
            SELECT supplier_id sid FROM internal_transactions WHERE id IN (SELECT id FROM _cm_tx)
            UNION SELECT supplier_id FROM boletos WHERE id IN (SELECT id FROM _cm_bo)
            UNION SELECT supplier_id FROM contracts WHERE id IN (SELECT id FROM _cm_ct)
            UNION SELECT supplier_id FROM invoices WHERE cost_center_id IN (SELECT id FROM _cm_cc)
            UNION SELECT supplier_id FROM purchase_orders WHERE cost_center_id IN (SELECT id FROM _cm_cc)) s
      WHERE s.sid IS NOT NULL
        AND (p_org_dest IS NULL OR NOT EXISTS (SELECT 1 FROM supplier_org_shares x WHERE x.supplier_id = s.sid AND x.target_org_id = p_org_dest));
    CREATE TEMP TABLE IF NOT EXISTS _cm_cl (id uuid) ON COMMIT DROP; TRUNCATE _cm_cl;
    INSERT INTO _cm_cl SELECT DISTINCT cid FROM (
            SELECT client_id cid FROM unit_occupancies WHERE unit_id IN (SELECT id FROM _cm_un)
            UNION SELECT sindico_client_id FROM empreendimentos WHERE id = p_emp
            UNION SELECT client_id FROM contracts WHERE id IN (SELECT id FROM _cm_ct)
            UNION SELECT client_id FROM condominio_rateio_itens WHERE rateio_id IN (SELECT id FROM _cm_ra)
            UNION SELECT client_id FROM client_requests WHERE unit_id IN (SELECT id FROM _cm_un)) c
      WHERE cid IS NOT NULL;
    RETURN QUERY SELECT 90, 'client_org_shares', '__insert__', c.id::text, v_dest FROM _cm_cl c
      WHERE p_org_dest IS NULL OR NOT EXISTS (SELECT 1 FROM client_org_shares x WHERE x.client_id = c.id AND x.target_org_id = p_org_dest);
    RETURN QUERY SELECT 91, 'clients', 'is_shared', cl.id::text, 'true' FROM clients cl
      WHERE cl.id IN (SELECT id FROM _cm_cl) AND NOT coalesce(cl.is_shared, false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_condominio_migracao_plano(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Bloqueios: o que impede migrar ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_condominio_migracao_bloqueios(p_emp uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 VOLATILE  -- chama o plano, que cria tabelas temporárias
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_src uuid;
    v_b   text[] := '{}';
BEGIN
    SELECT organization_id INTO v_src FROM empreendimentos WHERE id = p_emp;
    -- As duas travas que valem respeitar, com a mesma regra dos gatilhos
    -- fn_block_period_internal_tx e fn_payable_bloqueia_competencia_fechada.
    SELECT v_b || coalesce(array_agg(DISTINCT 'Período contábil fechado: ' || to_char(it.transaction_date, 'MM/YYYY')), '{}')
      INTO v_b
      FROM internal_transactions it
     WHERE it.id IN (SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp) WHERE tabela = 'internal_transactions' AND coluna = 'organization_id')
       AND public.fn_period_is_closed(it.organization_id, it.transaction_date);
    SELECT v_b || coalesce(array_agg(DISTINCT 'Competência fechada em Contas a Pagar: ' || to_char(c.competencia, 'MM/YYYY')), '{}')
      INTO v_b
      FROM internal_transactions it
      JOIN cost_center_closings c ON c.organization_id = it.organization_id
                                 AND c.competencia = date_trunc('month', coalesce(it.due_date, it.transaction_date))::date
                                 AND c.status = 'FECHADO'
     WHERE it.id IN (SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp) WHERE tabela = 'internal_transactions' AND coluna = 'organization_id');
    RETURN v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_condominio_migracao_bloqueios(uuid) FROM PUBLIC, anon, authenticated;

-- ── Ensaio ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_condominio_migracao_inventario(p_emp uuid, p_org_dest uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_src  uuid;
    v_res  jsonb;
BEGIN
    SELECT organization_id INTO v_src FROM empreendimentos WHERE id = p_emp;
    SELECT jsonb_build_object(
        'org_origem', v_src,
        'muda', (SELECT jsonb_object_agg(k, n) FROM (
                    SELECT tabela || '.' || coluna AS k, count(*) AS n
                      FROM fn_condominio_migracao_plano(p_emp, p_org_dest) GROUP BY 1) z),
        'bloqueios', to_jsonb(fn_condominio_migracao_bloqueios(p_emp)),
        'soma_titulos', (SELECT jsonb_build_object('qtde', count(*), 'valor', coalesce(sum(amount), 0))
                           FROM internal_transactions WHERE id IN (
                             SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp, p_org_dest)
                              WHERE tabela = 'internal_transactions' AND coluna = 'organization_id')),
        'fora_da_origem', jsonb_build_object(
            'titulos_em_outra_org', (SELECT count(*) FROM internal_transactions it
                                      JOIN cost_centers_v2 c ON c.id = it.cost_center_id
                                     WHERE c.empreendimento_id = p_emp AND it.organization_id <> v_src),
            'boletos_em_outra_org', (SELECT count(*) FROM boletos b
                                      JOIN cost_centers_v2 c ON c.id = b.cost_center_id
                                     WHERE c.empreendimento_id = p_emp AND b.organization_id <> v_src)),
        'nao_migra', jsonb_build_object(
            'bank_transactions', (SELECT count(*) FROM bank_transactions bt JOIN cost_centers_v2 c ON c.id = bt.cost_center_id WHERE c.empreendimento_id = p_emp),
            'process_instances', (SELECT count(*) FROM process_instances pi WHERE pi.internal_transaction_id IN (
                                    SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp) WHERE tabela = 'internal_transactions' AND coluna = 'organization_id')
                                   OR pi.boleto_id IN (SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp) WHERE tabela = 'boletos' AND coluna = 'organization_id')),
            'email_capture_messages', (SELECT count(*) FROM email_capture_messages WHERE boleto_id IN (
                                    SELECT registro_id::uuid FROM fn_condominio_migracao_plano(p_emp) WHERE tabela = 'boletos' AND coluna = 'organization_id')),
            'building_systems_a_copiar', (SELECT count(DISTINCT x) FROM (
                    SELECT building_system_id x FROM opura_assets WHERE empreendimento_id = p_emp
                    UNION ALL SELECT building_system_id FROM maintenance_orders WHERE empreendimento_id = p_emp
                    UNION ALL SELECT building_system_id FROM maintenance_plan_items WHERE plan_id IN (SELECT id FROM maintenance_plans WHERE empreendimento_id = p_emp)) z
                   WHERE x IS NOT NULL))
    ) INTO v_res;
    RETURN v_res;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_condominio_migracao_inventario(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Migrar ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_condominio_migrar(p_emp uuid, p_org_dest uuid, p_empresa_dest uuid, p_lote text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_src      uuid;
    v_bloq     text[];
    r          record;
    v_n        integer;
    v_total    integer := 0;
    v_bs       record;
    v_novo     uuid;
    v_esperado integer;
    v_feito    integer;
    v_sobra    integer;
BEGIN
    SELECT organization_id INTO v_src FROM empreendimentos WHERE id = p_emp;
    IF v_src IS NULL THEN RAISE EXCEPTION 'Empreendimento % não encontrado.', p_emp; END IF;
    IF NOT public.fn_org_eh_condominio(p_org_dest) THEN
        RAISE EXCEPTION 'A organização de destino % não está marcada como CONDOMINIO.', p_org_dest;
    END IF;
    IF p_org_dest = v_src THEN RAISE EXCEPTION 'Destino igual à origem.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_empresa_dest AND org_id = p_org_dest) THEN
        RAISE EXCEPTION 'A empresa % não é da organização de destino.', p_empresa_dest;
    END IF;
    IF EXISTS (SELECT 1 FROM condominio_migracao_registro WHERE lote = p_lote) THEN
        RAISE EXCEPTION 'Lote % já usado.', p_lote;
    END IF;
    v_bloq := fn_condominio_migracao_bloqueios(p_emp);
    IF array_length(v_bloq, 1) > 0 THEN
        RAISE EXCEPTION 'Migração bloqueada: %', array_to_string(v_bloq, '; ');
    END IF;

    CREATE TEMP TABLE _cm_plano ON COMMIT DROP AS
        SELECT * FROM fn_condominio_migracao_plano(p_emp, p_org_dest, p_empresa_dest);

    PERFORM fn_cm_gatilhos(false);

    FOR r IN SELECT p.ordem, p.tabela, p.coluna, p.valor_novo, array_agg(p.registro_id) AS ids
               FROM _cm_plano p WHERE p.coluna NOT LIKE '\_\_%'
              GROUP BY p.ordem, p.tabela, p.coluna, p.valor_novo ORDER BY p.ordem, p.tabela, p.coluna LOOP
        v_n := fn_cm_aplicar(p_lote, r.tabela, r.coluna, r.ids, r.valor_novo);
        v_total := v_total + v_n;
    END LOOP;

    -- Sistemas prediais usados: CÓPIA na org nova (a org nova não lê os da origem).
    FOR v_bs IN SELECT DISTINCT bs.* FROM building_systems bs WHERE bs.organization_id = v_src AND bs.id IN (
            SELECT building_system_id FROM opura_assets WHERE empreendimento_id = p_emp
            UNION SELECT building_system_id FROM maintenance_orders WHERE empreendimento_id = p_emp
            UNION SELECT building_system_id FROM maintenance_plan_items WHERE plan_id IN (SELECT id FROM maintenance_plans WHERE empreendimento_id = p_emp)) LOOP
        INSERT INTO building_systems (organization_id, name, slug, description, norm_ref, is_active, sort_order)
        VALUES (p_org_dest, v_bs.name, v_bs.slug, v_bs.description, v_bs.norm_ref, v_bs.is_active, v_bs.sort_order)
        RETURNING id INTO v_novo;
        INSERT INTO condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
        VALUES (p_lote, 'building_systems', v_novo::text, '__copia__', v_bs.id::text, p_org_dest::text);
        PERFORM fn_cm_aplicar(p_lote, 'opura_assets', 'building_system_id',
            ARRAY(SELECT id::text FROM opura_assets WHERE empreendimento_id = p_emp AND building_system_id = v_bs.id), v_novo::text);
        PERFORM fn_cm_aplicar(p_lote, 'maintenance_orders', 'building_system_id',
            ARRAY(SELECT id::text FROM maintenance_orders WHERE empreendimento_id = p_emp AND building_system_id = v_bs.id), v_novo::text);
        PERFORM fn_cm_aplicar(p_lote, 'maintenance_plan_items', 'building_system_id',
            ARRAY(SELECT id::text FROM maintenance_plan_items WHERE building_system_id = v_bs.id
                     AND plan_id IN (SELECT id FROM maintenance_plans WHERE empreendimento_id = p_emp)), v_novo::text);
    END LOOP;

    -- Compartilhamentos (linhas criadas, registradas para a reversão).
    FOR r IN SELECT registro_id FROM _cm_plano WHERE tabela = 'supplier_org_shares' LOOP
        INSERT INTO supplier_org_shares (supplier_id, target_org_id) VALUES (r.registro_id::uuid, p_org_dest)
        ON CONFLICT DO NOTHING RETURNING id INTO v_novo;
        IF v_novo IS NOT NULL THEN
            INSERT INTO condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
            VALUES (p_lote, 'supplier_org_shares', v_novo::text, '__insert__', NULL, r.registro_id);
        END IF;
        v_novo := NULL;
    END LOOP;
    FOR r IN SELECT registro_id FROM _cm_plano WHERE tabela = 'client_org_shares' LOOP
        INSERT INTO client_org_shares (client_id, target_org_id) VALUES (r.registro_id::uuid, p_org_dest)
        ON CONFLICT DO NOTHING RETURNING id INTO v_novo;
        IF v_novo IS NOT NULL THEN
            INSERT INTO condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
            VALUES (p_lote, 'client_org_shares', v_novo::text, '__insert__', NULL, r.registro_id);
        END IF;
        v_novo := NULL;
    END LOOP;

    PERFORM fn_cm_gatilhos(true);

    -- Conferência: tudo o que o plano mandava trocar foi trocado…
    SELECT count(*) INTO v_esperado FROM _cm_plano WHERE coluna NOT LIKE '\_\_%';
    SELECT count(*) INTO v_feito FROM condominio_migracao_registro
     WHERE lote = p_lote AND coluna NOT LIKE '\_\_%' AND coluna <> 'building_system_id';
    IF v_feito <> v_esperado THEN
        RAISE EXCEPTION 'Conferência falhou: o plano tinha % trocas e foram feitas %.', v_esperado, v_feito;
    END IF;
    -- …e nada da operação do condomínio sobrou na origem.
    SELECT (SELECT count(*) FROM internal_transactions WHERE organization_id = v_src AND cost_center_id IN (SELECT id FROM cost_centers_v2 WHERE empreendimento_id = p_emp))
         + (SELECT count(*) FROM boletos WHERE organization_id = v_src AND cost_center_id IN (SELECT id FROM cost_centers_v2 WHERE empreendimento_id = p_emp))
         + (SELECT count(*) FROM contracts WHERE organization_id = v_src AND cost_center_id IN (SELECT id FROM cost_centers_v2 WHERE empreendimento_id = p_emp))
         + (SELECT count(*) FROM cost_centers_v2 WHERE organization_id = v_src AND empreendimento_id = p_emp)
         + (SELECT count(*) FROM condominio_rateios WHERE organization_id = v_src AND empreendimento_id = p_emp)
         + (SELECT count(*) FROM unit_occupancies WHERE organization_id = v_src AND unit_id IN (
               SELECT u.id FROM empreendimento_units u JOIN empreendimento_towers t ON t.id = u.tower_id WHERE t.empreendimento_id = p_emp))
      INTO v_sobra;
    IF v_sobra > 0 THEN
        RAISE EXCEPTION 'Conferência falhou: % linhas da operação do condomínio ainda na origem.', v_sobra;
    END IF;

    RETURN jsonb_build_object('ok', true, 'lote', p_lote, 'trocas', v_feito,
        'linhas_criadas', (SELECT count(*) FROM condominio_migracao_registro WHERE lote = p_lote AND coluna LIKE '\_\_%'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_condominio_migrar(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Reverter ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_condominio_migracao_reverter(p_lote text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    r       record;
    v_tipo  text;
    v_n     integer := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM condominio_migracao_registro WHERE lote = p_lote) THEN
        RAISE EXCEPTION 'Lote % não existe.', p_lote;
    END IF;
    IF EXISTS (SELECT 1 FROM condominio_migracao_registro WHERE lote = p_lote AND coluna = '__revertido__') THEN
        RAISE EXCEPTION 'Lote % já foi revertido.', p_lote;
    END IF;

    PERFORM fn_cm_gatilhos(false);
    -- Ordem inversa: referências voltam antes de apagar as cópias e os
    -- compartilhamentos; ocupações antes do vínculo; filhos de CC antes da raiz.
    FOR r IN SELECT * FROM condominio_migracao_registro WHERE lote = p_lote ORDER BY id DESC LOOP
        IF r.coluna IN ('__insert__', '__copia__') THEN
            EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', r.tabela) USING r.registro_id;
        ELSE
            SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo FROM pg_attribute a
             WHERE a.attrelid = format('public.%I', r.tabela)::regclass AND a.attname = r.coluna AND NOT a.attisdropped;
            EXECUTE format('UPDATE public.%I SET %I = $1::%s WHERE id::text = $2', r.tabela, r.coluna, v_tipo)
                USING r.valor_antigo, r.registro_id;
        END IF;
        v_n := v_n + 1;
    END LOOP;
    PERFORM fn_cm_gatilhos(true);

    INSERT INTO condominio_migracao_registro (lote, tabela, registro_id, coluna, valor_antigo, valor_novo)
    VALUES (p_lote, '-', '-', '__revertido__', NULL, v_n::text);
    RETURN jsonb_build_object('ok', true, 'lote', p_lote, 'desfeitos', v_n);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_condominio_migracao_reverter(text) FROM PUBLIC, anon, authenticated;
