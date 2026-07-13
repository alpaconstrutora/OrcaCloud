-- ============================================================
-- fn_calendar_events — suporta "Todas as Organizações" (NULL)
-- OrçaCloud SaaS · Migration 20270129000006
-- Mesmo padrão de 20270126000000 e seguintes.
-- ============================================================

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
  WITH txs AS (
    SELECT
      COALESCE(due_date, transaction_date) AS ev_date,
      direction,
      status,
      amount
    FROM public.internal_transactions
    WHERE organization_id = ANY(v_targets)
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
END;
$$;

-- FIM: 20270129000006_calendar_events_todas_organizacoes.sql
