-- ============================================================
-- Calendário Financeiro — RPC por data de vencimento
-- OrçaCloud SaaS · Migration 20261118000004
-- Agrupa internal_transactions por due_date (não transaction_date)
-- para mostrar "o que vence quando" no calendário executivo.
-- Idempotente (Regra de Ouro 10).
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_calendar_events(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_calendar_events(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE
)
RETURNS TABLE (
  event_date        DATE,
  credit_previsto   NUMERIC,
  debit_previsto    NUMERIC,
  credit_realizado  NUMERIC,
  debit_realizado   NUMERIC,
  n_titulos         BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH txs AS (
    SELECT
      -- prioriza due_date; cai em transaction_date quando não existe
      COALESCE(due_date, transaction_date) AS ev_date,
      direction,
      status,
      amount
    FROM public.internal_transactions
    WHERE organization_id = p_organization_id
      AND COALESCE(due_date, transaction_date) BETWEEN p_date_from AND p_date_to
      AND status <> 'CANCELLED'
  )
  SELECT
    ev_date                                                                                           AS event_date,
    COALESCE(SUM(CASE WHEN direction='CREDIT' AND status='PENDING'     THEN amount ELSE 0 END), 0)  AS credit_previsto,
    COALESCE(SUM(CASE WHEN direction='DEBIT'  AND status='PENDING'     THEN amount ELSE 0 END), 0)  AS debit_previsto,
    COALESCE(SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN amount ELSE 0 END), 0)  AS credit_realizado,
    COALESCE(SUM(CASE WHEN direction='DEBIT'  AND status='CONCILIATED' THEN amount ELSE 0 END), 0)  AS debit_realizado,
    COUNT(*)                                                                                          AS n_titulos
  FROM txs
  GROUP BY ev_date
  HAVING SUM(amount) > 0
  ORDER BY ev_date;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000004_fn_calendar_events.sql
-- ────────────────────────────────────────────────────────────
