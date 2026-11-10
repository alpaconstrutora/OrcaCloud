-- ==========================================================================
-- REVERTE aplicar_20271110400000_juros_relatorios_por_categoria
-- Definições de PRODUÇÃO de 10/11/2026, lidas antes de aplicar a migration.
-- Aplicar com `npx supabase db query --linked -f <este arquivo>`.
-- Depois de reverter, o front volta a somar n_transacoes no Balancete
-- (n_partes_juros some: a tela trata a coluna ausente como 0).
-- ==========================================================================
BEGIN;

-- A view nova tem 2 colunas a mais no fim: CREATE OR REPLACE não remove coluna.
DROP VIEW IF EXISTS public.vw_fact_financial_tx;
CREATE VIEW public.vw_fact_financial_tx WITH (security_invoker = on) AS
 SELECT it.id,
    it.organization_id,
    it.transaction_date,
    it.payment_date,
    it.due_date,
    it.competencia_date,
    it.direction,
    it.status,
    it.business_status,
    it.approval_status,
    it.amount,
    it.category_id,
    fc.parent_id AS category_parent_id,
    it.project_id,
    it.cost_center_id,
    it.supplier_id,
    it.contract_id,
    it.purchase_order_id,
    it.payment_account_id,
    cl.id AS client_id,
    it.created_by,
    p.empresa_id,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'::text) AS dre_group,
    COALESCE(fc.nature, 'EXPENSE'::text) AS nature,
    COALESCE(fc.name, it.category, 'Sem categoria'::text) AS category_name,
    COALESCE(fc.sort_order, 99) AS sort_order,
    s.name AS supplier_name,
    COALESCE(cl.name,
        CASE
            WHEN it.party_type = 'CLIENT'::text THEN NULLIF(it.party_name, ''::text)
            ELSE NULL::text
        END) AS client_name,
    p.name AS project_name,
    pa.name AS account_name,
    it.source_system,
    it.reference_id,
    it.description,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'CONCILIATED'::text THEN it.amount
            ELSE 0::numeric
        END AS credit_realizado,
        CASE
            WHEN it.direction = 'DEBIT'::text AND it.status = 'CONCILIATED'::text THEN it.amount
            ELSE 0::numeric
        END AS debit_realizado,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'PENDING'::text THEN it.amount
            ELSE 0::numeric
        END AS credit_previsto,
        CASE
            WHEN it.direction = 'DEBIT'::text AND it.status = 'PENDING'::text THEN it.amount
            ELSE 0::numeric
        END AS debit_previsto,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'CONCILIATED'::text THEN it.amount
            WHEN it.direction = 'DEBIT'::text AND it.status = 'CONCILIATED'::text THEN - it.amount
            ELSE 0::numeric
        END AS net_realizado,
        CASE
            WHEN it.direction = 'CREDIT'::text AND it.status = 'PENDING'::text THEN it.amount
            WHEN it.direction = 'DEBIT'::text AND it.status = 'PENDING'::text THEN - it.amount
            ELSE 0::numeric
        END AS net_previsto,
    COALESCE(NULLIF(it.party_name, ''::text), NULLIF(it.entity_name, ''::text), s.name, cl.name) AS party_label,
        CASE
            WHEN cc.id IS NULL THEN NULL::text
            WHEN ccp.name IS NOT NULL THEN (ccp.name || ' › '::text) || cc.name
            ELSE cc.name
        END AS cost_center_name,
    fcp.name AS category_parent_name,
        CASE
            WHEN ct.id IS NULL THEN NULL::text
            ELSE concat_ws(' · '::text, NULLIF(ct.number, ''::text), NULLIF(ct.title, ''::text))
        END AS contract_name,
        CASE
            WHEN po.id IS NULL THEN NULL::text
            ELSE 'Pedido '::text || COALESCE(NULLIF(po.number, ''::text), "left"(po.id::text, 8))
        END AS purchase_order_name,
    it.plano_de_contas_id,
        CASE
            WHEN pc.id IS NULL THEN NULL::text
            ELSE concat_ws(' · '::text, NULLIF(pc.code, ''::text), pc.name)
        END AS plano_de_contas_name,
    ct.domain AS contract_domain,
    NULLIF(ct.number, ''::text) AS contract_number,
    ct.client_id AS contract_client_id,
    clc.name AS contract_client_name,
    COALESCE(NULLIF(d.code, ''::text), NULLIF(d.contract_number, ''::text)) AS deal_label,
    cp.name AS property_name
   FROM internal_transactions it
     LEFT JOIN financial_categories fc ON fc.id = it.category_id
     LEFT JOIN financial_categories fcp ON fcp.id = fc.parent_id
     LEFT JOIN suppliers s ON s.id = it.supplier_id
     LEFT JOIN clients cl ON cl.id = it.party_id
     LEFT JOIN projects p ON p.id = it.project_id
     LEFT JOIN payment_accounts pa ON pa.id = it.payment_account_id
     LEFT JOIN cost_centers_v2 cc ON cc.id = it.cost_center_id
     LEFT JOIN cost_centers_v2 ccp ON ccp.id = cc.parent_id
     LEFT JOIN contracts ct ON ct.id = it.contract_id
     LEFT JOIN purchase_orders po ON po.id = it.purchase_order_id
     LEFT JOIN plano_de_contas pc ON pc.id = it.plano_de_contas_id
     LEFT JOIN commercial_deals d ON d.id = ct.deal_id
     LEFT JOIN commercial_properties cp ON cp.id = d.property_id
     LEFT JOIN clients clc ON clc.id = ct.client_id
  WHERE it.status <> 'CANCELLED'::text;;

CREATE OR REPLACE VIEW public.vw_fpa_budget_vs_actual WITH (security_invoker = on) AS
 WITH actuals AS (
         SELECT it.organization_id,
            COALESCE(p.empresa_id, c.id) AS empresa_id,
            it.project_id,
            it.cost_center_id,
            fc_1.id AS financial_category_id,
            EXTRACT(year FROM it.transaction_date)::integer AS year,
            EXTRACT(month FROM it.transaction_date)::integer AS month,
            sum(
                CASE
                    WHEN it.direction = 'CREDIT'::text THEN it.amount
                    ELSE - it.amount
                END) AS actual_amount
           FROM internal_transactions it
             LEFT JOIN financial_categories fc_1 ON fc_1.name = it.category
             LEFT JOIN projects p ON p.id = it.project_id
             LEFT JOIN companies c ON c.org_id = it.organization_id
          WHERE it.status = 'CONCILIATED'::text
          GROUP BY it.organization_id, (COALESCE(p.empresa_id, c.id)), it.project_id, it.cost_center_id, fc_1.id, (EXTRACT(year FROM it.transaction_date)::integer), (EXTRACT(month FROM it.transaction_date)::integer)
        )
 SELECT b.id AS budget_id,
    b.empresa_id,
    b.project_id,
    b.cost_center_id,
    b.name AS budget_name,
    b.year,
    bl.month,
    fc.name AS category_name,
    fc.dre_group,
    bl.planned_amount,
    COALESCE(a.actual_amount, 0::numeric) AS actual_amount,
    COALESCE(a.actual_amount, 0::numeric) - bl.planned_amount AS variance_amount,
        CASE
            WHEN bl.planned_amount = 0::numeric THEN 0::numeric
            ELSE round((COALESCE(a.actual_amount, 0::numeric) - bl.planned_amount) / NULLIF(bl.planned_amount, 0::numeric) * 100::numeric, 2)
        END AS variance_percent
   FROM fpa_budget_lines bl
     JOIN fpa_budgets b ON b.id = bl.budget_id
     LEFT JOIN financial_categories fc ON fc.id = bl.financial_category_id
     LEFT JOIN actuals a ON a.empresa_id = b.empresa_id AND (a.project_id = b.project_id OR a.project_id IS NULL AND b.project_id IS NULL) AND (a.cost_center_id = b.cost_center_id OR a.cost_center_id IS NULL AND b.cost_center_id IS NULL) AND a.financial_category_id = bl.financial_category_id AND a.year = b.year AND a.month = bl.month;;

REVOKE ALL ON public.vw_fact_financial_tx FROM anon;
REVOKE ALL ON public.vw_fact_financial_tx FROM PUBLIC;
REVOKE ALL ON public.vw_fpa_budget_vs_actual FROM anon;
REVOKE ALL ON public.vw_fpa_budget_vs_actual FROM PUBLIC;
GRANT SELECT ON public.vw_fact_financial_tx, public.vw_fpa_budget_vs_actual TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_entries_without_project(p_organization_id uuid)
 RETURNS TABLE(direction text, natureza text, empreendimento_id uuid, empreendimento_nome text, categoria text, realizado numeric, a_vencer_90d numeric, vencido numeric, qtd integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    x.direction,
    x.natureza,
    x.empreendimento_id,
    x.empreendimento_nome,
    x.categoria,
    COALESCE(SUM(x.amount) FILTER (WHERE x.realizado), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.em_aberto
               AND x.data_ref BETWEEN CURRENT_DATE AND CURRENT_DATE + 90), 0),
    COALESCE(SUM(x.amount) FILTER (WHERE x.em_aberto AND x.data_ref < CURRENT_DATE), 0),
    count(*)::int
  FROM public.fn_fi_ledger(public.fn_fi_targets(p_organization_id)) x
  WHERE x.obra_id IS NULL
    AND x.natureza IS DISTINCT FROM 'LOCACAO'
  GROUP BY x.direction, x.natureza, x.empreendimento_id, x.empreendimento_nome, x.categoria
  ORDER BY x.direction, 6 DESC;
END;
$function$;

-- RETURNS TABLE do pivô perde qtd_titulos: DROP antes.
DROP FUNCTION IF EXISTS public.fn_opura_pivot(uuid,text,text,date,date,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[]);
CREATE OR REPLACE FUNCTION public.fn_opura_pivot(p_organization_id uuid, p_dimension text DEFAULT 'category'::text, p_date_field text DEFAULT 'transaction'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_project_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_purchase_order_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_business_status text DEFAULT NULL::text, p_client_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(dimension_key text, dimension_label text, qtd bigint, credit_realizado numeric, debit_realizado numeric, credit_previsto numeric, debit_previsto numeric, net_realizado numeric, vencido numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  -- Dimensões de domínio de contrato só olham o próprio domínio (decisão do usuário, 2026-09-13)
  v_domain  TEXT;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  v_domain := CASE p_dimension
    WHEN 'venda_ativos'       THEN 'VENDAS'
    WHEN 'locacoes'           THEN 'LOCACAO'
    WHEN 'locacoes_locatario' THEN 'LOCACAO'
    WHEN 'contratos_servico'  THEN 'SERVICOS'
  END;

  RETURN QUERY
  WITH base AS (
    SELECT
      f.*,
      CASE p_dimension
        WHEN 'supplier'        THEN COALESCE(f.supplier_id::text, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END)
        WHEN 'project'         THEN f.project_id::text
        WHEN 'cost_center'     THEN f.cost_center_id::text
        WHEN 'category'        THEN f.category_id::text
        WHEN 'category_parent' THEN f.category_parent_id::text
        WHEN 'client'          THEN f.client_id::text
        WHEN 'contract'        THEN f.contract_id::text
        WHEN 'purchase_order'  THEN f.purchase_order_id::text
        WHEN 'account'         THEN f.payment_account_id::text
        WHEN 'empresa'         THEN f.empresa_id::text
        WHEN 'user'            THEN f.created_by::text
        WHEN 'contraparte'     THEN f.party_label
        WHEN 'plano_de_contas'    THEN f.plano_de_contas_id::text
        WHEN 'venda_ativos'       THEN f.contract_id::text
        WHEN 'locacoes'           THEN f.contract_id::text
        WHEN 'locacoes_locatario' THEN f.contract_client_id::text
        WHEN 'contratos_servico'  THEN f.contract_id::text
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        WHEN 'dre_group'       THEN f.dre_group
        ELSE f.category_id::text
      END AS dim_key,
      CASE p_dimension
        WHEN 'supplier'        THEN COALESCE(f.supplier_name, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END, '— Sem fornecedor')
        WHEN 'project'         THEN COALESCE(f.project_name,  '— Sem obra')
        WHEN 'cost_center'     THEN COALESCE(f.cost_center_name,     '— Sem centro de custo')
        WHEN 'category'        THEN COALESCE(f.category_name, '— Sem categoria')
        WHEN 'category_parent' THEN COALESCE(f.category_parent_name, '— Sem categoria-pai')
        WHEN 'client'          THEN COALESCE(f.client_name,   '— Sem cliente')
        WHEN 'contract'        THEN COALESCE(f.contract_name,        '— Sem contrato')
        WHEN 'purchase_order'  THEN COALESCE(f.purchase_order_name,  '— Sem pedido')
        WHEN 'account'         THEN COALESCE(f.account_name,  '— Sem conta')
        WHEN 'user'            THEN COALESCE(f.created_by::text,     '— Sem usuário')
        WHEN 'contraparte'     THEN COALESCE(f.party_label,   '— Sem contraparte')
        WHEN 'plano_de_contas'    THEN COALESCE(f.plano_de_contas_name, '— Sem plano de contas')
        WHEN 'venda_ativos'       THEN COALESCE(NULLIF(CONCAT_WS(' · ', COALESCE(f.deal_label, f.contract_number), f.property_name), ''), f.contract_name, '— Sem contrato')
        WHEN 'locacoes'           THEN COALESCE(NULLIF(CONCAT_WS(' · ', f.contract_number, f.property_name), ''), f.contract_name, '— Sem contrato')
        WHEN 'locacoes_locatario' THEN COALESCE(f.contract_client_name, '— Sem locatário')
        WHEN 'contratos_servico'  THEN COALESCE(f.contract_name, '— Sem contrato')
        WHEN 'dre_group'       THEN f.dre_group
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        ELSE COALESCE(f.category_name, '—')
      END AS dim_label,
      CASE p_date_field
        WHEN 'due'         THEN f.due_date
        WHEN 'payment'     THEN f.payment_date
        WHEN 'competencia' THEN f.competencia_date
        ELSE f.transaction_date
      END AS filter_date
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND (p_project_id        IS NULL OR f.project_id        = p_project_id)
      AND (p_supplier_id       IS NULL OR f.supplier_id       = p_supplier_id)
      AND (p_client_id         IS NULL OR f.client_id         = p_client_id)
      AND (p_client_ids        IS NULL OR f.client_id         = ANY(p_client_ids))
      AND (p_contract_id       IS NULL OR f.contract_id       = p_contract_id)
      AND (p_purchase_order_id IS NULL OR f.purchase_order_id = p_purchase_order_id)
      AND (p_cost_center_id    IS NULL OR f.cost_center_id    = p_cost_center_id)
      AND (p_category_id       IS NULL OR f.category_id       = p_category_id)
      AND (p_account_id        IS NULL OR f.payment_account_id = p_account_id)
      AND (p_empresa_id        IS NULL OR f.empresa_id        = p_empresa_id)
      AND (p_direction         IS NULL OR f.direction         = p_direction)
      AND (p_status            IS NULL OR f.status            = p_status)
      AND (p_business_status   IS NULL OR f.business_status   = p_business_status)
      AND (v_domain IS NULL OR f.contract_domain = v_domain)
  )
  SELECT
    b.dim_key   AS dimension_key,
    b.dim_label AS dimension_label,
    COUNT(*)    AS qtd,
    COALESCE(SUM(b.credit_realizado), 0) AS credit_realizado,
    COALESCE(SUM(b.debit_realizado),  0) AS debit_realizado,
    COALESCE(SUM(b.credit_previsto),  0) AS credit_previsto,
    COALESCE(SUM(b.debit_previsto),   0) AS debit_previsto,
    COALESCE(SUM(b.net_realizado),    0) AS net_realizado,
    COALESCE(SUM(CASE WHEN b.status = 'PENDING' AND b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE
                      THEN b.amount ELSE 0 END), 0) AS vencido
  FROM base b
  WHERE (p_date_from IS NULL OR b.filter_date >= p_date_from)
    AND (p_date_to   IS NULL OR b.filter_date <= p_date_to)
  GROUP BY b.dim_key, b.dim_label
  ORDER BY COALESCE(SUM(b.net_realizado), 0) DESC, COUNT(*) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_opura_aging(p_organization_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_client_ids uuid[] DEFAULT NULL::uuid[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_base text DEFAULT 'periodo'::text, p_dimension text DEFAULT NULL::text)
 RETURNS TABLE(dimension_key text, faixa text, qtd bigint, valor numeric, atraso_max integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  IF p_base NOT IN ('periodo', 'hoje') THEN
    RAISE EXCEPTION 'Base desconhecida em p_base: %', p_base;
  END IF;
  IF p_dimension IS NOT NULL AND p_dimension NOT IN ('client', 'project') THEN
    RAISE EXCEPTION 'Dimensão desconhecida em p_dimension: %', p_dimension;
  END IF;
  IF p_client_id IS NULL AND p_client_ids IS NULL THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH abertos AS (
    SELECT
      CASE p_dimension
        WHEN 'client'  THEN f.client_id::text
        WHEN 'project' THEN f.project_id::text
      END AS dim_key,
      f.amount,
      CASE WHEN f.due_date IS NOT NULL AND f.due_date < CURRENT_DATE
           THEN (CURRENT_DATE - f.due_date) END AS dias
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND f.direction = 'CREDIT'
      AND f.status = 'PENDING'
      AND (p_client_id  IS NULL OR f.client_id = p_client_id)
      AND (p_client_ids IS NULL OR f.client_id = ANY(p_client_ids))
      AND (p_base = 'hoje' OR (
            (p_date_from IS NULL OR f.transaction_date >= p_date_from)
        AND (p_date_to   IS NULL OR f.transaction_date <= p_date_to)))
  )
  SELECT
    a.dim_key AS dimension_key,
    CASE
      WHEN a.dias IS NULL  THEN 'a_vencer'
      WHEN a.dias <= 30    THEN '1_30'
      WHEN a.dias <= 60    THEN '31_60'
      WHEN a.dias <= 90    THEN '61_90'
      ELSE 'mais_90'
    END AS faixa,
    COUNT(*)                       AS qtd,
    COALESCE(SUM(a.amount), 0)     AS valor,
    MAX(a.dias)::integer           AS atraso_max
  FROM abertos a
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_opura_entries(p_organization_id uuid, p_date_field text DEFAULT 'transaction'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_project_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_purchase_order_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_business_status text DEFAULT NULL::text, p_dre_group text DEFAULT NULL::text, p_category_parent_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_party_label text DEFAULT NULL::text, p_plano_de_contas_id uuid DEFAULT NULL::uuid, p_contract_domain text DEFAULT NULL::text, p_contract_client_id uuid DEFAULT NULL::uuid, p_client_ids uuid[] DEFAULT NULL::uuid[], p_sem_dimensao text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, transaction_date date, due_date date, payment_date date, direction text, status text, amount numeric, category_name text, dre_group text, supplier_name text, client_name text, project_name text, account_name text, description text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  IF p_sem_dimensao IS NOT NULL AND p_sem_dimensao NOT IN (
    'supplier', 'project', 'cost_center', 'category', 'category_parent', 'client',
    'contract', 'purchase_order', 'account', 'empresa', 'user', 'contraparte',
    'plano_de_contas'
  ) THEN
    RAISE EXCEPTION 'Dimensão desconhecida em p_sem_dimensao: %', p_sem_dimensao;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      f.id, f.transaction_date, f.due_date, f.payment_date,
      f.direction, f.status, f.amount, f.category_name, f.dre_group,
      -- Saída sem supplier_id: a contraparte (party_label) entra como fornecedor,
      -- mesma regra da dimensão 'supplier' em fn_opura_pivot. Antes ela chegava
      -- ao extrato via client_name, que agora é só cliente de verdade.
      COALESCE(f.supplier_name, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END) AS supplier_name,
      f.client_name, f.project_name, f.account_name,
      f.description,
      CASE p_date_field
        WHEN 'due'         THEN f.due_date
        WHEN 'payment'     THEN f.payment_date
        WHEN 'competencia' THEN f.competencia_date
        ELSE f.transaction_date
      END AS filter_date
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
      AND (p_project_id        IS NULL OR f.project_id        = p_project_id)
      AND (p_supplier_id       IS NULL OR f.supplier_id       = p_supplier_id)
      AND (p_client_id         IS NULL OR f.client_id         = p_client_id)
      AND (p_client_ids        IS NULL OR f.client_id         = ANY(p_client_ids))
      AND (p_contract_id       IS NULL OR f.contract_id       = p_contract_id)
      AND (p_purchase_order_id IS NULL OR f.purchase_order_id = p_purchase_order_id)
      AND (p_cost_center_id    IS NULL OR f.cost_center_id    = p_cost_center_id)
      AND (p_category_id       IS NULL OR f.category_id       = p_category_id)
      AND (p_account_id        IS NULL OR f.payment_account_id = p_account_id)
      AND (p_empresa_id        IS NULL OR f.empresa_id        = p_empresa_id)
      AND (p_direction         IS NULL OR f.direction         = p_direction)
      AND (p_status            IS NULL OR f.status            = p_status)
      AND (p_business_status   IS NULL OR f.business_status   = p_business_status)
      AND (p_dre_group         IS NULL OR f.dre_group         = p_dre_group)
      AND (p_category_parent_id IS NULL OR f.category_parent_id = p_category_parent_id)
      AND (p_created_by        IS NULL OR f.created_by        = p_created_by)
      AND (p_party_label       IS NULL OR f.party_label       = p_party_label)
      AND (p_plano_de_contas_id IS NULL OR f.plano_de_contas_id = p_plano_de_contas_id)
      AND (p_contract_domain    IS NULL OR f.contract_domain    = p_contract_domain)
      AND (p_contract_client_id IS NULL OR f.contract_client_id = p_contract_client_id)
      -- "— Sem <dimensão>": a chave do pivô (mesma expressão) é NULL.
      AND (p_sem_dimensao IS NULL OR (CASE p_sem_dimensao
            WHEN 'supplier'        THEN COALESCE(f.supplier_id::text, CASE WHEN f.direction = 'DEBIT' THEN f.party_label END)
            WHEN 'project'         THEN f.project_id::text
            WHEN 'cost_center'     THEN f.cost_center_id::text
            WHEN 'category'        THEN f.category_id::text
            WHEN 'category_parent' THEN f.category_parent_id::text
            WHEN 'client'          THEN f.client_id::text
            WHEN 'contract'        THEN f.contract_id::text
            WHEN 'purchase_order'  THEN f.purchase_order_id::text
            WHEN 'account'         THEN f.payment_account_id::text
            WHEN 'empresa'         THEN f.empresa_id::text
            WHEN 'user'            THEN f.created_by::text
            WHEN 'contraparte'     THEN f.party_label
            WHEN 'plano_de_contas' THEN f.plano_de_contas_id::text
          END) IS NULL)
  ),
  dated AS (
    SELECT * FROM filtered
    WHERE (p_date_from IS NULL OR filter_date >= p_date_from)
      AND (p_date_to   IS NULL OR filter_date <= p_date_to)
  )
  SELECT
    d.id, d.transaction_date, d.due_date, d.payment_date,
    d.direction, d.status, d.amount, d.category_name, d.dre_group,
    d.supplier_name, d.client_name, d.project_name, d.account_name,
    d.description,
    COUNT(*) OVER () AS total_count
  FROM dated d
  ORDER BY d.transaction_date DESC, d.id
  LIMIT  GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_balancete(uuid, date, date, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_balancete(p_organization_id uuid, p_date_from date, p_date_to date, p_project_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(category_id uuid, category_name text, dre_group text, nature text, sort_order integer, creditos numeric, debitos numeric, saldo_liquido numeric, n_transacoes bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  SELECT
    fc.id                                                            AS category_id,
    COALESCE(fc.name, it.category, '(Sem Categoria)')               AS category_name,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')                     AS dre_group,
    COALESCE(fc.nature,    'EXPENSE')                               AS nature,
    COALESCE(fc.sort_order, 99)                                     AS sort_order,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS creditos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS debitos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  THEN -it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount_dre
                        ELSE 0 END), 0)
    END AS saldo_liquido,
    COUNT(*)                                                         AS n_transacoes
  FROM public.v_internal_transactions_dre it
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id_dre
    OR (it.category_id_dre IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
  WHERE it.organization_id = ANY(v_targets)
    AND it.status != 'CANCELLED'
    AND (
      CASE WHEN p_regime = 'COMPETENCIA'
           THEN COALESCE(it.competencia_date, it.transaction_date::date)
           ELSE it.transaction_date::date
      END
    ) BETWEEN p_date_from AND p_date_to
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
  GROUP BY
    fc.id,
    COALESCE(fc.name, it.category, '(Sem Categoria)'),
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'),
    COALESCE(fc.nature,    'EXPENSE'),
    COALESCE(fc.sort_order, 99)
  ORDER BY
    COALESCE(fc.sort_order, 99),
    COALESCE(fc.name, it.category, '(Sem Categoria)');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) TO authenticated, service_role;

COMMIT;
