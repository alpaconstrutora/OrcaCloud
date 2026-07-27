-- ============================================================
-- ÒPURA Analytics — corrige 42702 em fn_opura_pivot
-- OrçaCloud SaaS · Migration 20270216000000
-- Idempotente (CREATE OR REPLACE).
--
-- Sintoma: "column reference \"credit_realizado\" is ambiguous"
-- (SQLSTATE 42702) em TODAS as telas de Análise de Dados —
-- ÒPURA Relatórios, Central de Obras, Central de Clientes e
-- Central de Fornecedores — que compartilham esta RPC.
--
-- Causa: a migration 20270127000000 (suporte a "Todas as
-- Organizações") converteu a função de LANGUAGE sql para plpgsql
-- para poder calcular v_org_ids. Em plpgsql, cada nome do
-- RETURNS TABLE vira uma variável OUT visível dentro do corpo —
-- e credit_realizado / debit_realizado / credit_previsto /
-- debit_previsto / net_realizado / qtd / vencido são exatamente
-- os nomes das colunas de vw_fact_financial_tx agregadas na
-- query. Enquanto era LANGUAGE sql não havia variáveis, então o
-- mesmo corpo funcionava.
--
-- Correção: aliasar a CTE como `b` e qualificar toda referência a
-- coluna com `b.` — qualificado, o parser resolve para a coluna e
-- nunca para a variável. O ORDER BY passa a repetir a expressão
-- agregada em vez de citar o alias de saída (que também colide).
-- Assinatura e nomes de retorno inalterados: o frontend
-- (opuraAnalyticsService.ts) não muda.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_opura_pivot(
  p_organization_id  UUID,
  p_dimension        TEXT DEFAULT 'category',
  p_date_field       TEXT DEFAULT 'transaction',
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_project_id       UUID DEFAULT NULL,
  p_supplier_id      UUID DEFAULT NULL,
  p_client_id        UUID DEFAULT NULL,
  p_contract_id      UUID DEFAULT NULL,
  p_purchase_order_id UUID DEFAULT NULL,
  p_cost_center_id   UUID DEFAULT NULL,
  p_category_id      UUID DEFAULT NULL,
  p_account_id       UUID DEFAULT NULL,
  p_empresa_id       UUID DEFAULT NULL,
  p_direction        TEXT DEFAULT NULL,
  p_status           TEXT DEFAULT NULL,
  p_business_status  TEXT DEFAULT NULL
)
RETURNS TABLE (
  dimension_key    TEXT,
  dimension_label  TEXT,
  qtd              BIGINT,
  credit_realizado NUMERIC,
  debit_realizado  NUMERIC,
  credit_previsto  NUMERIC,
  debit_previsto   NUMERIC,
  net_realizado    NUMERIC,
  vencido          NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
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
        WHEN 'category'        THEN COALESCE(f.category_name, '— Sem categoria')
        WHEN 'client'          THEN COALESCE(f.client_name,   '— Sem cliente')
        WHEN 'account'         THEN COALESCE(f.account_name,  '— Sem conta')
        WHEN 'contraparte'     THEN COALESCE(f.party_label,   '— Sem contraparte')
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
      AND (p_contract_id       IS NULL OR f.contract_id       = p_contract_id)
      AND (p_purchase_order_id IS NULL OR f.purchase_order_id = p_purchase_order_id)
      AND (p_cost_center_id    IS NULL OR f.cost_center_id    = p_cost_center_id)
      AND (p_category_id       IS NULL OR f.category_id       = p_category_id)
      AND (p_account_id        IS NULL OR f.payment_account_id = p_account_id)
      AND (p_empresa_id        IS NULL OR f.empresa_id        = p_empresa_id)
      AND (p_direction         IS NULL OR f.direction         = p_direction)
      AND (p_status            IS NULL OR f.status            = p_status)
      AND (p_business_status   IS NULL OR f.business_status   = p_business_status)
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
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20270216000000_fix_opura_pivot_ambiguous_out_params.sql
-- ────────────────────────────────────────────────────────────
