-- ============================================================
-- Dashboard Executivo Financeiro — RPCs de visão gerencial
-- OrçaCloud SaaS · Migration 20261118000001
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_financial_kpis — KPIs do período para o dashboard
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_financial_kpis(uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.fn_financial_kpis(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_project_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  a_pagar                  NUMERIC,
  pago                     NUMERIC,
  a_receber                NUMERIC,
  recebido                 NUMERIC,
  resultado_periodo        NUMERIC,
  boletos_vencidos_count   BIGINT,
  boletos_vencidos_valor   NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH kpis AS (
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'DEBIT'  AND status = 'PENDING'     THEN amount ELSE 0 END), 0) AS a_pagar,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT'  AND status = 'CONCILIATED' THEN amount ELSE 0 END), 0) AS pago,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' AND status = 'PENDING'     THEN amount ELSE 0 END), 0) AS a_receber,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' AND status = 'CONCILIATED' THEN amount ELSE 0 END), 0) AS recebido
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND transaction_date BETWEEN p_date_from AND p_date_to
      AND status <> 'CANCELLED'
      AND (p_project_id IS NULL OR project_id = p_project_id)
  ),
  vencidos AS (
    SELECT
      COUNT(*)      AS cnt,
      COALESCE(SUM(valor), 0) AS total
    FROM public.boletos
    WHERE organization_id = p_organization_id
      AND status NOT IN ('pago', 'cancelado')
      AND vencimento < CURRENT_DATE
  )
  SELECT
    k.a_pagar,
    k.pago,
    k.a_receber,
    k.recebido,
    (k.recebido - k.pago)  AS resultado_periodo,
    v.cnt                  AS boletos_vencidos_count,
    v.total                AS boletos_vencidos_valor
  FROM kpis k, vencidos v;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_top_suppliers_ap — maiores fornecedores por valor pago
--    Fonte: boletos (captura real de AP)
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_top_suppliers_ap(uuid, date, date, int);

CREATE OR REPLACE FUNCTION public.fn_top_suppliers_ap(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_limit           INT DEFAULT 10
)
RETURNS TABLE (
  supplier_id   UUID,
  supplier_name TEXT,
  total_valor   NUMERIC,
  count_boletos BIGINT,
  pct           NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      b.supplier_id,
      COALESCE(s.name, b.beneficiario_nome, 'Sem nome') AS supplier_name,
      SUM(b.valor)  AS total_valor,
      COUNT(*)      AS count_boletos
    FROM public.boletos b
    LEFT JOIN public.suppliers s ON s.id = b.supplier_id
    WHERE b.organization_id = p_organization_id
      AND b.vencimento BETWEEN p_date_from AND p_date_to
      AND b.status NOT IN ('cancelado', 'rascunho')
      AND b.valor IS NOT NULL
    GROUP BY b.supplier_id, supplier_name
  ),
  total AS (SELECT SUM(total_valor) AS grand FROM base)
  SELECT
    b.supplier_id,
    b.supplier_name,
    b.total_valor,
    b.count_boletos,
    ROUND(CASE WHEN t.grand > 0 THEN b.total_valor / t.grand * 100 ELSE 0 END, 1) AS pct
  FROM base b, total t
  ORDER BY b.total_valor DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000001_fn_financial_overview.sql
-- ────────────────────────────────────────────────────────────
