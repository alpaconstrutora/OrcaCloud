-- ============================================================
-- Dashboard de Conciliação — Saldo Bancário vs. Saldo Contábil
-- OrçaCloud SaaS · Migration 20261220000001
-- Idempotente (Regra de Ouro 10).
--
-- Adiciona saldo inicial às contas bancárias (payment_accounts) e
-- cria fn_reconciliation_dashboard() que consolida, por conta e no
-- total da organização:
--   • Saldo Bancário (Real)     = saldo inicial + Σ(extrato CREDIT − DEBIT)
--   • Saldo Conciliado          = saldo inicial + Σ(extrato já conciliado)
--   • Diferença / Pendente      = bancário − conciliado
--   • Saldo Contábil do Sistema = saldo inicial + Σ(lançamentos internos conciliados)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Saldo inicial por conta bancária
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS opening_balance      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date DATE;

COMMENT ON COLUMN public.payment_accounts.opening_balance      IS 'Saldo inicial da conta na data de abertura do controle (ponto de partida da conciliação).';
COMMENT ON COLUMN public.payment_accounts.opening_balance_date IS 'Data a partir da qual o extrato passa a compor o saldo bancário. NULL = considera todo o histórico.';

-- ─────────────────────────────────────────────────────────────
-- 2. Função consolidadora do dashboard
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconciliation_dashboard(
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
         pa.name,
         pa.bank,
         COALESCE(pa.opening_balance, 0)                      AS opening_balance,
         COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
  FROM public.payment_accounts pa
  WHERE pa.organization_id = p_organization_id
),
tx AS (
  SELECT bt.bank_account_id,
         bt.status,
         bt.category,
         bt.direction,
         bt.amount,
         bt.description_normalized,
         CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
  FROM public.bank_transactions bt
  JOIN accts a ON a.id = bt.bank_account_id
  WHERE bt.transaction_date <= p_as_of
    AND bt.transaction_date >= a.opening_date
),
per_account AS (
  SELECT a.id,
         a.name,
         a.bank,
         a.opening_balance,
         a.opening_balance
           + COALESCE(SUM(t.signed), 0)                                                                    AS bank_balance,
         a.opening_balance
           + COALESCE(SUM(t.signed) FILTER (WHERE t.status IN ('MATCHED','CONFIRMED','LOCKED')), 0)        AS reconciled_balance,
         COALESCE(SUM(t.amount)  FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)    AS pending_value,
         COALESCE(COUNT(*)       FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)    AS pending_count,
         COALESCE(COUNT(*)       FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
                                              AND t.category IS NULL), 0)                                   AS unclassified_count
  FROM accts a
  LEFT JOIN tx t ON t.bank_account_id = a.id
  GROUP BY a.id, a.name, a.bank, a.opening_balance
),
ledger AS (
  SELECT COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                  FILTER (WHERE it.status = 'CONCILIATED'), 0) AS system_reconciled_net
  FROM public.internal_transactions it
  WHERE it.organization_id = p_organization_id
    AND it.transaction_date <= p_as_of
),
fees AS (
  SELECT COALESCE(SUM(t.amount), 0) AS fees_value,
         COUNT(*)                   AS fees_count
  FROM tx t
  WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND t.category IS NULL
    AND t.direction = 'DEBIT'
    AND t.description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'account_id',         pa.id,
          'account_name',       pa.name,
          'bank_name',          pa.bank,
          'opening_balance',    pa.opening_balance,
          'bank_balance',       pa.bank_balance,
          'reconciled_balance', pa.reconciled_balance,
          'difference',         pa.bank_balance - pa.reconciled_balance,
          'pending_value',      pa.pending_value,
          'pending_count',      pa.pending_count,
          'unclassified_count', pa.unclassified_count
        ) ORDER BY pa.name)
      FROM per_account pa), '[]'::jsonb),
  'totals', (
      SELECT jsonb_build_object(
          'opening_balance',    COALESCE(SUM(opening_balance), 0),
          'bank_balance',       COALESCE(SUM(bank_balance), 0),
          'reconciled_balance', COALESCE(SUM(reconciled_balance), 0),
          'difference',         COALESCE(SUM(bank_balance - reconciled_balance), 0),
          'pending_value',      COALESCE(SUM(pending_value), 0),
          'pending_count',      COALESCE(SUM(pending_count), 0),
          'unclassified_count', COALESCE(SUM(unclassified_count), 0)
        )
      FROM per_account),
  'system_balance', (
      SELECT (SELECT COALESCE(SUM(opening_balance), 0) FROM per_account) + l.system_reconciled_net
      FROM ledger l),
  'fees', (SELECT jsonb_build_object('value', fees_value, 'count', fees_count) FROM fees)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

-- FIM: 20261220000001_reconciliation_balances.sql
