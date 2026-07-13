-- ============================================================
-- fn_reconciliation_dashboard / fn_reconciliation_consolidated
-- suportam "Todas as Organizações" (p_organization_id NULL)
-- OrçaCloud SaaS · Migration 20270129000002
-- Mesmo padrão de 20270126000000/20270127000000/20270128000000/20270129000001.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reconciliation_dashboard(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH accts AS (
    SELECT pa.id,
           pa.name,
           pa.bank,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
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
    WHERE it.organization_id = ANY(v_targets)
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
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_reconciliation_consolidated(
  p_organization_id uuid,
  p_as_of           date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
  v_result  JSONB;
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

  WITH accts AS (
    SELECT pa.id,
           pa.empresa_id,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
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
    WHERE it.organization_id = ANY(v_targets)
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
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) TO authenticated;

-- FIM: 20270129000002_reconciliation_dashboard_todas_organizacoes.sql
