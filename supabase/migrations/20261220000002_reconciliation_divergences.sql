-- ============================================================
-- Gestão de Divergências de Conciliação
-- OrçaCloud SaaS · Migration 20261220000002
-- Idempotente (Regra de Ouro 10).
--
-- fn_reconciliation_divergences() classifica em três tipos:
--   1. bank_without_internal — movimento no extrato sem lançamento no sistema
--   2. internal_without_bank — título (lançamento) sem movimento bancário
--   3. value_mismatch        — mesmo título com diferença de valor (tarifa/juros/desconto)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
  p_organization_id uuid,
  p_as_of           date    DEFAULT current_date,
  p_aging_days      integer DEFAULT 5,
  p_value_tolerance numeric DEFAULT 50,
  p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
WITH
-- Extrato pendente (não conciliado) e sem vínculo
bank_pending AS (
  SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
         COALESCE(bt.description_normalized, bt.description_raw) AS description,
         bt.category,
         pa.name AS account_name
  FROM public.bank_transactions bt
  JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
  WHERE bt.organization_id = p_organization_id
    AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND bt.transaction_date <= p_as_of
    AND NOT EXISTS (
      SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id
    )
),
-- Lançamentos internos pendentes e sem vínculo
internal_pending AS (
  SELECT it.id, it.transaction_date, it.due_date, it.amount, it.direction,
         it.description, it.category, it.party_name, it.business_status, it.project_id
  FROM public.internal_transactions it
  WHERE it.organization_id = p_organization_id
    AND it.status = 'PENDING'
    AND NOT EXISTS (
      SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id
    )
),
-- Tipo 3: par extrato × título com mesma direção, data próxima e diferença pequena (> 0)
mismatch AS (
  SELECT DISTINCT ON (b.id)
         b.id            AS bank_id,
         i.id            AS internal_id,
         b.amount        AS bank_amount,
         i.amount        AS internal_amount,
         b.amount - i.amount AS difference,
         b.transaction_date  AS bank_date,
         i.transaction_date  AS internal_date,
         b.description       AS bank_description,
         i.description       AS internal_description,
         b.direction,
         b.account_name
  FROM bank_pending b
  JOIN internal_pending i
    ON i.direction = b.direction
   AND i.transaction_date BETWEEN b.transaction_date - 3 AND b.transaction_date + 3
   AND abs(b.amount - i.amount) > 0
   AND abs(b.amount - i.amount) <= p_value_tolerance
  ORDER BY b.id, abs(b.amount - i.amount) ASC
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'counts', jsonb_build_object(
      'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b
                                 WHERE b.id NOT IN (SELECT bank_id FROM mismatch)),
      'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i
                                 WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
      'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
  ),
  'bank_without_internal', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
        SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date,
               b.amount, b.direction, b.description, b.category
        FROM bank_pending b
        WHERE b.id NOT IN (SELECT bank_id FROM mismatch)
        ORDER BY b.transaction_date DESC
        LIMIT p_limit
      ) t), '[]'::jsonb),
  'internal_without_bank', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
        SELECT i.id, i.transaction_date, i.due_date,
               COALESCE(i.due_date, i.transaction_date) AS ref_date,
               (p_as_of - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
               i.amount, i.direction, i.description, i.category,
               i.party_name, i.business_status, i.project_id
        FROM internal_pending i
        WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days
        ORDER BY ref_date ASC
        LIMIT p_limit
      ) t), '[]'::jsonb),
  'value_mismatch', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
        SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT p_limit
      ) t), '[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;

-- FIM: 20261220000002_reconciliation_divergences.sql
