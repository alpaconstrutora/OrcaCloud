-- ==========================================================================
-- Transferência entre contas próprias — status TRANSFER e par cruzado
-- Date: 2026-09-05 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 2.2)
-- ==========================================================================
-- CONTEXTO
-- O sistema não sabia reconhecer dinheiro que só troca de bolso. Um débito no
-- Sicredi e um crédito de mesmo valor no Sicredi Garden no mesmo dia ficavam
-- pendentes NAS DUAS contas: poluíam o pool de candidatos do motor e inflavam
-- "receita" e "despesa" no Dashboard. Em 05/09/2026 havia 51 pares assim, e a
-- categoria "Movimentação" (1.905 linhas, aplicada por regra) era o remendo manual.
--
-- TRANSFER = "isto não é receita nem despesa, é a mesma organização mudando o
-- dinheiro de conta". Conta no saldo bancário de cada conta (o dinheiro saiu de
-- uma e entrou na outra, de verdade), mas sai das pendências, das divergências e
-- do pool de conciliação com títulos.
--
-- `transfer_pair_id` é o MESMO uuid nas duas pontas — é o que prova o par e o que
-- permite desfazer sem adivinhação.
--
-- REGRA #7: as duas funções levam REVOKE ... FROM PUBLIC, anon literal.
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id uuid;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_transfer_pair
    ON public.bank_transactions (transfer_pair_id)
    WHERE transfer_pair_id IS NOT NULL;

COMMENT ON COLUMN public.bank_transactions.transfer_pair_id IS
    'Mesmo uuid nas duas pontas de uma transferência entre contas da própria organização (status TRANSFER).';

-- ──────────────────────────────────────────────────────────────────────────
-- fn_reconcile_transfer — marca as duas pontas numa transação
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_transfer(p_debit_id uuid, p_credit_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    d       public.bank_transactions%ROWTYPE;
    c       public.bank_transactions%ROWTYPE;
    v_pair  uuid := gen_random_uuid();
BEGIN
    SELECT * INTO d FROM public.bank_transactions WHERE id = p_debit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Movimento de saída não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found'; END IF;
    SELECT * INTO c FROM public.bank_transactions WHERE id = p_credit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Movimento de entrada não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found'; END IF;

    IF d.organization_id <> c.organization_id THEN
        RAISE EXCEPTION 'As duas pontas precisam ser da mesma organização.' USING ERRCODE = 'check_violation';
    END IF;
    IF d.bank_account_id = c.bank_account_id THEN
        RAISE EXCEPTION 'As duas pontas estão na MESMA conta — não é transferência.' USING ERRCODE = 'check_violation';
    END IF;
    IF d.direction <> 'DEBIT' OR c.direction <> 'CREDIT' THEN
        RAISE EXCEPTION 'Esperado um débito e um crédito (recebido % e %).', d.direction, c.direction USING ERRCODE = 'check_violation';
    END IF;
    IF abs(d.amount - c.amount) >= 0.005 THEN
        RAISE EXCEPTION 'Valores diferentes: % e %.', d.amount, c.amount USING ERRCODE = 'check_violation';
    END IF;
    IF d.status IN ('MATCHED', 'IGNORED', 'TRANSFER') OR c.status IN ('MATCHED', 'IGNORED', 'TRANSFER') THEN
        RAISE EXCEPTION 'Um dos movimentos já está conciliado, ignorado ou pareado.' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.bank_transactions SET status = 'TRANSFER', transfer_pair_id = v_pair
     WHERE id IN (p_debit_id, p_credit_id);

    DELETE FROM public.reconciliation_suggestions WHERE bank_transaction_id IN (p_debit_id, p_credit_id);

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (d.organization_id, auth.uid(), 'TRANSFER', p_debit_id, jsonb_build_object(
        'action', 'PAIR_INTERNAL_TRANSFER', 'pair_id', v_pair,
        'debit_id', p_debit_id, 'credit_id', p_credit_id,
        'amount', d.amount, 'debit_date', d.transaction_date, 'credit_date', c.transaction_date));

    RETURN v_pair;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_transfer(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_transfer(uuid, uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- fn_reconcile_untransfer — desfaz o par (as duas pontas voltam a pendente)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_untransfer(p_pair_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_org   uuid;
    v_count int;
BEGIN
    SELECT organization_id INTO v_org FROM public.bank_transactions WHERE transfer_pair_id = p_pair_id LIMIT 1;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Par de transferência não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE public.bank_transactions
       SET status = CASE WHEN COALESCE(category, '') <> '' THEN 'RULE_APPLIED' ELSE 'NORMALIZED' END,
           transfer_pair_id = NULL
     WHERE transfer_pair_id = p_pair_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (v_org, auth.uid(), 'UNTRANSFER', p_pair_id, jsonb_build_object('action', 'UNPAIR_INTERNAL_TRANSFER', 'rows', v_count));

    RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_untransfer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_untransfer(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Dashboard e consolidado: TRANSFER conta no saldo, mas NÃO é pendência.
-- (mesma função de aplicar_20270919000014; muda só a linha de pending_*)
-- ──────────────────────────────────────────────────────────────────────────
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
    SELECT pa.id, pa.name, pa.bank,
           COALESCE(pa.opening_balance, 0)                      AS opening_balance,
           COALESCE(pa.opening_balance_date, DATE '1900-01-01') AS opening_date
    FROM public.payment_accounts pa
    WHERE pa.organization_id = ANY(v_targets)
  ),
  tx AS (
    SELECT bt.bank_account_id, bt.status, bt.category, bt.direction, bt.amount, bt.description_normalized,
           CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END AS signed
    FROM public.bank_transactions bt
    JOIN accts a ON a.id = bt.bank_account_id
    WHERE bt.transaction_date <= p_as_of
      AND bt.transaction_date >= a.opening_date
      AND bt.status <> 'IGNORED'
  ),
  per_account AS (
    SELECT a.id, a.name, a.bank, a.opening_balance,
           a.opening_balance + COALESCE(SUM(t.signed), 0)                                                    AS bank_balance,
           a.opening_balance
             + COALESCE(SUM(t.signed) FILTER (WHERE t.status IN ('MATCHED','CONFIRMED','LOCKED','TRANSFER')), 0) AS reconciled_balance,
           COALESCE(SUM(t.amount)  FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)    AS pending_value,
           COALESCE(COUNT(*)       FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')), 0)    AS pending_count,
           COALESCE(COUNT(*)       FILTER (WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
                                                AND t.category IS NULL), 0)                                   AS unclassified_count,
           COALESCE(COUNT(*)       FILTER (WHERE t.status = 'TRANSFER'), 0)                                   AS transfer_count
    FROM accts a
    LEFT JOIN tx t ON t.bank_account_id = a.id
    GROUP BY a.id, a.name, a.bank, a.opening_balance
  ),
  ledger AS (
    SELECT COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.status = 'CONCILIATED'), 0) AS system_reconciled_net
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets) AND it.transaction_date <= p_as_of
  ),
  fees AS (
    SELECT COALESCE(SUM(t.amount), 0) AS fees_value, COUNT(*) AS fees_count
    FROM tx t
    WHERE t.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
      AND t.category IS NULL AND t.direction = 'DEBIT'
      AND t.description_normalized ~ '(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)'
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'account_id', pa.id, 'account_name', pa.name, 'bank_name', pa.bank,
            'opening_balance', pa.opening_balance, 'bank_balance', pa.bank_balance,
            'reconciled_balance', pa.reconciled_balance,
            'difference', pa.bank_balance - pa.reconciled_balance,
            'pending_value', pa.pending_value, 'pending_count', pa.pending_count,
            'unclassified_count', pa.unclassified_count, 'transfer_count', pa.transfer_count
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
            'unclassified_count', COALESCE(SUM(unclassified_count), 0),
            'transfer_count',     COALESCE(SUM(transfer_count), 0)
          )
        FROM per_account),
    'system_balance', (
        SELECT (SELECT COALESCE(SUM(opening_balance), 0) FROM per_account) + l.system_reconciled_net FROM ledger l),
    'fees', (SELECT jsonb_build_object('value', fees_value, 'count', fees_count) FROM fees)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

-- Divergências: TRANSFER e IGNORED não são "extrato sem lançamento".
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
SET search_path = public, pg_temp
AS $fn$
WITH
bank_pending AS (
  SELECT bt.id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
         COALESCE(bt.description_normalized, bt.description_raw) AS description,
         bt.category, pa.name AS account_name
  FROM public.bank_transactions bt
  JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
  WHERE bt.organization_id = p_organization_id
    AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND bt.transaction_date <= p_as_of
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id)
),
internal_pending AS (
  SELECT it.id, it.transaction_date, it.due_date, it.amount, it.direction,
         it.description, it.category, it.party_name, it.business_status, it.project_id
  FROM public.internal_transactions it
  WHERE it.organization_id = p_organization_id
    AND it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
mismatch AS (
  SELECT DISTINCT ON (b.id)
         b.id AS bank_id, i.id AS internal_id, b.amount AS bank_amount, i.amount AS internal_amount,
         b.amount - i.amount AS difference, b.transaction_date AS bank_date, i.transaction_date AS internal_date,
         b.description AS bank_description, i.description AS internal_description, b.direction, b.account_name
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
      'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b WHERE b.id NOT IN (SELECT bank_id FROM mismatch)),
      'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
      'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
  ),
  'bank_without_internal', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
        SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date, b.amount, b.direction, b.description, b.category
        FROM bank_pending b WHERE b.id NOT IN (SELECT bank_id FROM mismatch)
        ORDER BY b.transaction_date DESC LIMIT p_limit) t), '[]'::jsonb),
  'internal_without_bank', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.ref_date ASC) FROM (
        SELECT i.id, i.transaction_date, i.due_date, COALESCE(i.due_date, i.transaction_date) AS ref_date,
               (p_as_of - COALESCE(i.due_date, i.transaction_date)) AS days_overdue,
               i.amount, i.direction, i.description, i.category, i.party_name, i.business_status, i.project_id
        FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days
        ORDER BY ref_date ASC LIMIT p_limit) t), '[]'::jsonb),
  'value_mismatch', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY abs(t.difference) DESC) FROM (
        SELECT * FROM mismatch ORDER BY abs(difference) DESC LIMIT p_limit) t), '[]'::jsonb)
);
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;
