-- ============================================================
-- ÒPURA Financial Analytics — Fase 2: extrato / drill-down
-- OrçaCloud SaaS · Migration 20261221000004
-- Idempotente (Regra de Ouro 10).
--
-- fn_opura_entries: linha-a-linha de vw_fact_financial_tx com os
-- mesmos Filtros Universais do fn_opura_pivot + 3 extras p/ drill
-- (dre_group, subcategoria, usuário) e paginação. Alimenta:
--   • Extrato Financeiro (Obra/Fornecedor/Cliente) — Categorias 6/7/8
--   • Drill Down Financeiro — clicar numa linha do pivot e ver os
--     lançamentos que a compõem
-- Sem SQL dinâmico; ordenação fixa por data desc.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_opura_entries(
  uuid, text, date, date,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, text, text, uuid, uuid, int, int);

CREATE OR REPLACE FUNCTION public.fn_opura_entries(
  p_organization_id   UUID,
  p_date_field        TEXT DEFAULT 'transaction',
  p_date_from         DATE DEFAULT NULL,
  p_date_to           DATE DEFAULT NULL,
  -- Filtros Universais (iguais ao pivot)
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
  -- extras p/ drill-down em dimensões sem id próprio de filtro
  p_dre_group         TEXT DEFAULT NULL,
  p_category_parent_id UUID DEFAULT NULL,
  p_created_by        UUID DEFAULT NULL,
  -- paginação
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

COMMENT ON FUNCTION public.fn_opura_entries IS
  'ÒPURA: extrato linha-a-linha de vw_fact_financial_tx (filtros universais + drill + paginação). Fase 2.';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000004_opura_fase2_entries.sql
-- ────────────────────────────────────────────────────────────
