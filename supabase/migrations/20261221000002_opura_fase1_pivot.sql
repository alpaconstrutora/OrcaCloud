-- ============================================================
-- ÒPURA Financial Analytics — Fase 1: motor de pivot
-- OrçaCloud SaaS · Migration 20261221000002
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_pivot: "qualquer métrica por qualquer dimensão".
-- Lê a camada de fatos vw_fact_financial_tx (estendida na Fase 0)
-- e agrega por UMA dimensão escolhida em runtime (p_dimension),
-- aplicando os Filtros Universais do PRD. Sem SQL dinâmico:
-- a dimensão é resolvida por CASE sobre whitelist (à prova de
-- injeção e STABLE).
--
-- Medidas retornadas (mesma semântica do DRE/fato):
--   • qtd               nº de lançamentos
--   • credit/debit_*    realizado (CONCILIATED) e previsto (PENDING)
--   • net_realizado     crédito − débito conciliado
--   • vencido           PENDING com due_date < hoje
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_pivot(
  uuid, text, text, date, date,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text);

CREATE OR REPLACE FUNCTION public.fn_opura_pivot(
  p_organization_id  UUID,
  -- dimensão principal (whitelist; default 'category')
  p_dimension        TEXT DEFAULT 'category',
  -- campo de data do recorte: 'transaction'|'due'|'payment'|'competencia'
  p_date_field       TEXT DEFAULT 'transaction',
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  -- Filtros Universais (todos opcionais)
  p_project_id       UUID DEFAULT NULL,
  p_supplier_id      UUID DEFAULT NULL,
  p_client_id        UUID DEFAULT NULL,
  p_contract_id      UUID DEFAULT NULL,
  p_purchase_order_id UUID DEFAULT NULL,
  p_cost_center_id   UUID DEFAULT NULL,
  p_category_id      UUID DEFAULT NULL,
  p_account_id       UUID DEFAULT NULL,
  p_empresa_id       UUID DEFAULT NULL,
  p_direction        TEXT DEFAULT NULL,   -- 'CREDIT'|'DEBIT'
  p_status           TEXT DEFAULT NULL,   -- 'CONCILIATED'|'PENDING'
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
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      f.*,
      -- chave/label da dimensão escolhida
      CASE p_dimension
        WHEN 'supplier'        THEN f.supplier_id::text
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
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        WHEN 'dre_group'       THEN f.dre_group
        ELSE f.category_id::text
      END AS dim_key,
      CASE p_dimension
        WHEN 'supplier'        THEN COALESCE(f.supplier_name, '— Sem fornecedor')
        WHEN 'project'         THEN COALESCE(f.project_name,  '— Sem obra')
        WHEN 'category'        THEN COALESCE(f.category_name, '— Sem categoria')
        WHEN 'client'          THEN COALESCE(f.client_name,   '— Sem cliente')
        WHEN 'account'         THEN COALESCE(f.account_name,  '— Sem conta')
        WHEN 'dre_group'       THEN f.dre_group
        WHEN 'tx_month'        THEN to_char(date_trunc('month', f.transaction_date), 'YYYY-MM')
        WHEN 'due_month'       THEN to_char(date_trunc('month', f.due_date),         'YYYY-MM')
        WHEN 'pay_month'       THEN to_char(date_trunc('month', f.payment_date),     'YYYY-MM')
        WHEN 'comp_month'      THEN to_char(date_trunc('month', f.competencia_date), 'YYYY-MM')
        ELSE COALESCE(f.category_name, '—')
      END AS dim_label,
      -- data efetiva do recorte
      CASE p_date_field
        WHEN 'due'         THEN f.due_date
        WHEN 'payment'     THEN f.payment_date
        WHEN 'competencia' THEN f.competencia_date
        ELSE f.transaction_date
      END AS filter_date
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = p_organization_id
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
    dim_key   AS dimension_key,
    dim_label AS dimension_label,
    COUNT(*)  AS qtd,
    COALESCE(SUM(credit_realizado), 0) AS credit_realizado,
    COALESCE(SUM(debit_realizado),  0) AS debit_realizado,
    COALESCE(SUM(credit_previsto),  0) AS credit_previsto,
    COALESCE(SUM(debit_previsto),   0) AS debit_previsto,
    COALESCE(SUM(net_realizado),    0) AS net_realizado,
    COALESCE(SUM(CASE WHEN status = 'PENDING' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
                      THEN amount ELSE 0 END), 0) AS vencido
  FROM base
  WHERE (p_date_from IS NULL OR filter_date >= p_date_from)
    AND (p_date_to   IS NULL OR filter_date <= p_date_to)
  GROUP BY dim_key, dim_label
  ORDER BY net_realizado DESC, qtd DESC;
$$;

COMMENT ON FUNCTION public.fn_opura_pivot IS
  'ÒPURA: agrega vw_fact_financial_tx por dimensão escolhida em runtime, com filtros universais. Fase 1.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000002_opura_fase1_pivot.sql
-- ────────────────────────────────────────────────────────────
