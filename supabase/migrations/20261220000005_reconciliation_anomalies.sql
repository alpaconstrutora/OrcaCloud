-- ============================================================
-- Detecção de Anomalias de Conciliação (Tier A+)
-- OrçaCloud SaaS · Migration 20261220000005
-- Idempotente (Regra de Ouro 10).
--
-- fn_reconciliation_anomalies() detecta:
--   1. duplicates      — mesmo valor+direção+contraparte numa janela curta
--                        (possível pagamento/recebimento em duplicidade)
--   2. value_outliers  — pagamento muito acima do padrão histórico do
--                        fornecedor (z-score sobre média/desvio)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reconciliation_anomalies(
  p_organization_id uuid,
  p_as_of           date    DEFAULT current_date,
  p_lookback_days   integer DEFAULT 180,
  p_dup_window_days integer DEFAULT 7,
  p_min_amount      numeric DEFAULT 100,
  p_z_threshold     numeric DEFAULT 3,
  p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
WITH tx AS (
  SELECT bt.id,
         bt.transaction_date AS dt,
         bt.amount,
         bt.direction,
         UPPER(COALESCE(NULLIF(bt.counterparty_name, ''), bt.description_normalized, bt.description_raw)) AS party,
         'BANK'::text AS source
  FROM public.bank_transactions bt
  WHERE bt.organization_id = p_organization_id
    AND bt.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
  UNION ALL
  SELECT it.id,
         it.transaction_date,
         it.amount,
         it.direction,
         UPPER(COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, ''), it.description)) AS party,
         'INTERNAL'::text
  FROM public.internal_transactions it
  WHERE it.organization_id = p_organization_id
    AND it.status <> 'CANCELLED'
    AND it.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
),
dup AS (
  SELECT t1.source,
         t1.direction,
         t1.amount,
         t1.party,
         t1.id   AS id_a,
         t2.id   AS id_b,
         t1.dt   AS date_a,
         t2.dt   AS date_b,
         abs(t1.dt - t2.dt) AS days_apart
  FROM tx t1
  JOIN tx t2
    ON t1.source    = t2.source
   AND t1.amount    = t2.amount
   AND t1.direction = t2.direction
   AND t1.party     = t2.party
   AND t1.party IS NOT NULL
   AND t1.id < t2.id
   AND abs(t1.dt - t2.dt) <= p_dup_window_days
  WHERE t1.amount >= p_min_amount
),
base AS (
  SELECT it.id, it.transaction_date AS dt, it.amount,
         it.category,
         UPPER(COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, ''))) AS party
  FROM public.internal_transactions it
  WHERE it.organization_id = p_organization_id
    AND it.status <> 'CANCELLED'
    AND it.direction = 'DEBIT'
    AND it.transaction_date BETWEEN p_as_of - p_lookback_days AND p_as_of
    AND COALESCE(NULLIF(it.entity_name, ''), NULLIF(it.party_name, '')) IS NOT NULL
),
stats AS (
  SELECT party, avg(amount) AS avg_a, stddev_pop(amount) AS sd, count(*) AS n
  FROM base
  GROUP BY party
  HAVING count(*) >= 5
),
outliers AS (
  SELECT b.id, b.dt, b.amount, b.party, b.category,
         s.avg_a, s.n,
         round(((b.amount - s.avg_a) / NULLIF(s.sd, 0))::numeric, 2) AS z
  FROM base b
  JOIN stats s ON s.party = b.party
  WHERE s.sd > 0
    AND b.amount > s.avg_a + p_z_threshold * s.sd
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'counts', jsonb_build_object(
      'duplicates',     (SELECT COUNT(*) FROM dup),
      'value_outliers', (SELECT COUNT(*) FROM outliers)
  ),
  'duplicates', COALESCE((
      SELECT jsonb_agg(row_to_json(d) ORDER BY d.amount DESC) FROM (
        SELECT * FROM dup ORDER BY amount DESC LIMIT p_limit
      ) d), '[]'::jsonb),
  'value_outliers', COALESCE((
      SELECT jsonb_agg(row_to_json(o) ORDER BY o.z DESC) FROM (
        SELECT * FROM outliers ORDER BY z DESC LIMIT p_limit
      ) o), '[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_anomalies(uuid, date, integer, integer, numeric, numeric, integer) TO authenticated;

-- FIM: 20261220000005_reconciliation_anomalies.sql
