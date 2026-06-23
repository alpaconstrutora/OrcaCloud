-- ============================================================
-- ÒPURA Financial Analytics — Dimensão "Contraparte"
-- OrçaCloud SaaS · Migration 20261221000009
-- Idempotente (Regra de Ouro 10).
--
-- Rótulo genérico de contraparte (party_label) que captura quem
-- não cabe em supplier_id/client_id: corretores (comissões),
-- payees por nome, fornecedores/clientes legados sem FK.
--   • Backfill: party_name = broker_name nas comissões
--     (reference_id 'commission-<deal_id>' → commercial_deals)
--   • View: coluna party_label = COALESCE(party_name, entity_name,
--     supplier_name, client_name)
--   • fn_opura_pivot: dimensão 'contraparte'
--   • fn_opura_entries: filtro p_party_label (drill-down)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Backfill — nome do corretor nas comissões
-- ────────────────────────────────────────────────────────────
UPDATE public.internal_transactions it
SET party_name = d.broker_name
FROM public.commercial_deals d
WHERE (it.party_name IS NULL OR it.party_name = '')
  AND it.source_system = 'COMMERCIAL'
  AND it.reference_id LIKE 'commission-%'
  AND d.broker_name IS NOT NULL
  AND d.id::text = substring(it.reference_id from 'commission-(.*)');

-- ────────────────────────────────────────────────────────────
-- 2. View — adiciona party_label ao FINAL (CREATE OR REPLACE
--    permite apenas acrescentar colunas no fim).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fact_financial_tx AS
SELECT
  it.id,
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
  fc.parent_id                                    AS category_parent_id,
  it.project_id,
  it.cost_center_id,
  it.supplier_id,
  it.contract_id,
  it.purchase_order_id,
  it.payment_account_id,
  it.party_id                                     AS client_id,
  it.created_by,
  p.empresa_id,
  COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
  COALESCE(fc.nature,    'EXPENSE')               AS nature,
  COALESCE(fc.name, it.category, 'Sem categoria') AS category_name,
  COALESCE(fc.sort_order, 99)                     AS sort_order,
  s.name                                          AS supplier_name,
  COALESCE(it.party_name, cl.name)                AS client_name,
  p.name                                          AS project_name,
  pa.name                                         AS account_name,
  it.source_system,
  it.reference_id,
  it.description,
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS credit_realizado,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END AS debit_realizado,
  CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS credit_previsto,
  CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING'     THEN it.amount ELSE 0 END AS debit_previsto,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount
    ELSE 0
  END AS net_realizado,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN -it.amount
    ELSE 0
  END AS net_previsto,
  -- NOVO: rótulo genérico de contraparte
  COALESCE(NULLIF(it.party_name, ''), NULLIF(it.entity_name, ''), s.name, cl.name) AS party_label
FROM public.internal_transactions it
LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
LEFT JOIN public.suppliers           s  ON s.id  = it.supplier_id
LEFT JOIN public.clients             cl ON cl.id = it.party_id
LEFT JOIN public.projects            p  ON p.id  = it.project_id
LEFT JOIN public.payment_accounts    pa ON pa.id = it.payment_account_id
WHERE it.status <> 'CANCELLED';

-- ────────────────────────────────────────────────────────────
-- 3. fn_opura_pivot — adiciona dimensão 'contraparte'
-- ────────────────────────────────────────────────────────────
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
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      f.*,
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
        WHEN 'contraparte'     THEN f.party_label
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

-- ────────────────────────────────────────────────────────────
-- 4. fn_opura_entries — adiciona filtro p_party_label (drill)
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_opura_entries(
  uuid, text, date, date,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text, text, uuid, uuid, int, int);

CREATE OR REPLACE FUNCTION public.fn_opura_entries(
  p_organization_id   UUID,
  p_date_field        TEXT DEFAULT 'transaction',
  p_date_from         DATE DEFAULT NULL,
  p_date_to           DATE DEFAULT NULL,
  p_project_id        UUID DEFAULT NULL,
  p_supplier_id       UUID DEFAULT NULL,
  p_client_id         UUID DEFAULT NULL,
  p_contract_id       UUID DEFAULT NULL,
  p_purchase_order_id UUID DEFAULT NULL,
  p_cost_center_id    UUID DEFAULT NULL,
  p_category_id       UUID DEFAULT NULL,
  p_account_id        UUID DEFAULT NULL,
  p_empresa_id        UUID DEFAULT NULL,
  p_direction         TEXT DEFAULT NULL,
  p_status            TEXT DEFAULT NULL,
  p_business_status   TEXT DEFAULT NULL,
  p_dre_group         TEXT DEFAULT NULL,
  p_category_parent_id UUID DEFAULT NULL,
  p_created_by        UUID DEFAULT NULL,
  p_party_label       TEXT DEFAULT NULL,
  p_limit             INT  DEFAULT 100,
  p_offset            INT  DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  transaction_date DATE,
  due_date        DATE,
  payment_date    DATE,
  direction       TEXT,
  status          TEXT,
  amount          NUMERIC,
  category_name   TEXT,
  dre_group       TEXT,
  supplier_name   TEXT,
  client_name     TEXT,
  project_name    TEXT,
  account_name    TEXT,
  description     TEXT,
  total_count     BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH filtered AS (
    SELECT
      f.id, f.transaction_date, f.due_date, f.payment_date,
      f.direction, f.status, f.amount, f.category_name, f.dre_group,
      f.supplier_name, f.client_name, f.project_name, f.account_name,
      f.description,
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
      AND (p_dre_group         IS NULL OR f.dre_group         = p_dre_group)
      AND (p_category_parent_id IS NULL OR f.category_parent_id = p_category_parent_id)
      AND (p_created_by        IS NULL OR f.created_by        = p_created_by)
      AND (p_party_label       IS NULL OR f.party_label       = p_party_label)
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
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000009_opura_dim_contraparte.sql
-- ────────────────────────────────────────────────────────────
