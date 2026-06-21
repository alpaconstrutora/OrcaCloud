-- ============================================================
-- Conciliação Multicontas Consolidada (Tier A+)
-- OrçaCloud SaaS · Migration 20261220000006
-- Idempotente (Regra de Ouro 10).
--
-- fn_reconciliation_consolidated() dá a visão única de caixa:
--   • by_empresa  — saldo consolidado por SPE (companies)
--   • by_project  — caixa realizado por obra (internal_transactions conciliadas)
--   • totals      — caixa bancário/conciliado/pendente do grupo
-- Reaproveita opening_balance de payment_accounts (mig. 20261220000001).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reconciliation_consolidated(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $fn$
WITH accts AS (
  SELECT pa.id,
         pa.empresa_id,
         COALESCE(pa.opening_balance, 0)                      AS opening_balance,
         COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
  FROM public.payment_accounts pa
  WHERE pa.organization_id = p_organization_id
),
tx AS (
  SELECT bt.bank_account_id,
         bt.status,
         bt.amount,
         CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
  FROM public.bank_transactions bt
  JOIN accts a ON a.id = bt.bank_account_id
  WHERE bt.transaction_date <= p_as_of
    AND bt.transaction_date >= a.opening_date
),
per_account AS (
  SELECT a.id,
         a.empresa_id,
         a.opening_balance + COALESCE(SUM(t.signed), 0)                                                  AS bank_balance,
         a.opening_balance + COALESCE(SUM(t.signed) FILTER (WHERE t.status IN ('MATCHED','CONFIRMED','LOCKED')), 0) AS reconciled_balance,
         COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)   AS pending_value,
         COALESCE(COUNT(*)      FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)   AS pending_count
  FROM accts a
  LEFT JOIN tx t ON t.bank_account_id = a.id
  GROUP BY a.id, a.empresa_id, a.opening_balance
),
by_emp AS (
  SELECT pa.empresa_id,
         c.nome_fantasia,
         c.razao_social,
         COUNT(*)                    AS account_count,
         SUM(pa.bank_balance)        AS bank_balance,
         SUM(pa.reconciled_balance)  AS reconciled_balance,
         SUM(pa.pending_value)       AS pending_value,
         SUM(pa.pending_count)       AS pending_count
  FROM per_account pa
  LEFT JOIN public.companies c ON c.id = pa.empresa_id
  GROUP BY pa.empresa_id, c.nome_fantasia, c.razao_social
),
by_proj AS (
  SELECT it.project_id,
         p.name AS project_name,
         COALESCE(SUM(it.amount) FILTER (WHERE it.direction = 'CREDIT'), 0) AS credit,
         COALESCE(SUM(it.amount) FILTER (WHERE it.direction = 'DEBIT'), 0)  AS debit,
         COUNT(*) AS n
  FROM public.internal_transactions it
  LEFT JOIN public.projects p ON p.id = it.project_id
  WHERE it.organization_id = p_organization_id
    AND it.status = 'CONCILIATED'
    AND it.project_id IS NOT NULL
    AND it.transaction_date <= p_as_of
  GROUP BY it.project_id, p.name
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'totals', (
      SELECT jsonb_build_object(
          'bank_balance',       COALESCE(SUM(bank_balance), 0),
          'reconciled_balance', COALESCE(SUM(reconciled_balance), 0),
          'pending_value',      COALESCE(SUM(pending_value), 0),
          'account_count',      COUNT(*),
          'empresa_count',      COUNT(DISTINCT empresa_id)
        )
      FROM per_account),
  'by_empresa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'empresa_id',         empresa_id,
          'empresa_name',       COALESCE(NULLIF(nome_fantasia, ''), NULLIF(razao_social, ''), 'Sem empresa'),
          'account_count',      account_count,
          'bank_balance',       bank_balance,
          'reconciled_balance', reconciled_balance,
          'difference',         bank_balance - reconciled_balance,
          'pending_value',      pending_value,
          'pending_count',      pending_count
        ) ORDER BY bank_balance DESC)
      FROM by_emp), '[]'::jsonb),
  'by_project', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'project_id',   project_id,
          'project_name', COALESCE(project_name, 'Sem obra'),
          'credit',       credit,
          'debit',        debit,
          'net',          credit - debit,
          'n',            n
        ) ORDER BY (credit - debit) DESC)
      FROM by_proj), '[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) TO authenticated;

-- FIM: 20261220000006_reconciliation_consolidated.sql
