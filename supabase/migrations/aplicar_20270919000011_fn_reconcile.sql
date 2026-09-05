-- ==========================================================================
-- Conciliação bancária — operações transacionais (RPCs) e status IGNORED
-- Date: 2026-09-05 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (itens 1.4/1.5)
-- ==========================================================================
-- CONTEXTO
-- Conciliar um movimento era, no navegador, CINCO escritas em sequência (match,
-- extrato, título, boleto, fatura); desfazer, o caminho inverso, feito pela tela.
-- Nenhuma etapa era atômica: uma falha no meio (rede, RLS, trigger de período
-- fechado) deixava extrato MATCHED sem vínculo ou título CONCILIATED sem extrato —
-- o banco tinha um caso de cada em 05/09/2026. Além disso:
--   - `payment_date` recebia a data de HOJE, não a do extrato (4 de 4 vínculos errados);
--   - `reconciliation_matches.created_by` nunca era preenchido;
--   - "excluir extrato" apagava a linha de verdade — extrato é evidência bancária.
--
-- Quatro funções SECURITY INVOKER: a RLS e a trigger de período fechado
-- (fn_block_period_*) continuam valendo, e qualquer falha desfaz TUDO.
--
--   fn_reconcile_match(bank, internal, tipo, confiança, categoria_de_ajuste)
--   fn_reconcile_unmatch(match_id)
--   fn_reconcile_confirm(bank, nota)          → CONFIRMED (sem título: tarifa, repasse)
--   fn_reconcile_ignore(bank_ids[], motivo)   → IGNORED  (não é movimento: duplicata, saldo)
--   fn_reconcile_unignore(bank_ids[])
--
-- IGNORED = "isto não é dinheiro que se moveu". Sai do saldo bancário, das
-- pendências e das sugestões; continua visível na aba Extrato com o motivo na
-- auditoria. Por isso fn_reconciliation_dashboard e fn_reconciliation_consolidated
-- são recriadas aqui (base: 20270129000002) com `bt.status <> 'IGNORED'`.
--
-- REGRA #7: toda função leva REVOKE ... FROM PUBLIC, anon literal.
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '5s';

-- ──────────────────────────────────────────────────────────────────────────
-- 1. fn_reconcile_match
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_match(
    p_bank_id             uuid,
    p_internal_id         uuid,
    p_match_type          text    DEFAULT 'MANUAL',
    p_confidence          numeric DEFAULT 100,
    p_adjustment_category text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    b            public.bank_transactions%ROWTYPE;
    i            public.internal_transactions%ROWTYPE;
    v_match_id   uuid;
    v_pay_date   date;
    v_residual   numeric;
    v_adjust_id  uuid;
    v_invoice_id uuid;
BEGIN
    IF p_match_type NOT IN ('RULE', 'HEURISTIC', 'AI', 'MANUAL') THEN
        RAISE EXCEPTION 'Tipo de vínculo inválido: %', p_match_type USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimento bancário não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO i FROM public.internal_transactions WHERE id = p_internal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lançamento interno não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;
    IF b.organization_id <> i.organization_id THEN
        RAISE EXCEPTION 'Movimento e lançamento pertencem a organizações diferentes.' USING ERRCODE = 'check_violation';
    END IF;
    IF b.status = 'IGNORED' THEN
        RAISE EXCEPTION 'Este movimento está marcado como ignorado. Restaure-o antes de conciliar.' USING ERRCODE = 'check_violation';
    END IF;
    IF i.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Lançamento cancelado não pode ser conciliado.' USING ERRCODE = 'check_violation';
    END IF;
    IF b.direction <> i.direction THEN
        RAISE EXCEPTION 'Movimento (%) e lançamento (%) têm direções diferentes.', b.direction, i.direction USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
    VALUES (p_bank_id, p_internal_id, p_match_type, LEAST(COALESCE(p_confidence, 100), 100), auth.uid())
    ON CONFLICT (bank_transaction_id, internal_transaction_id)
    DO UPDATE SET match_type = EXCLUDED.match_type, confidence_score = EXCLUDED.confidence_score
    RETURNING id INTO v_match_id;

    -- Data do pagamento = data em que o banco liquidou. Em N movimentos → 1 título, a última.
    SELECT max(bt.transaction_date) INTO v_pay_date
      FROM public.reconciliation_matches m
      JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
     WHERE m.internal_transaction_id = p_internal_id;

    UPDATE public.bank_transactions SET status = 'MATCHED' WHERE id = p_bank_id;
    UPDATE public.internal_transactions
       SET status = 'CONCILIATED', payment_date = v_pay_date
     WHERE id = p_internal_id;

    -- Título originado de boleto: marca boleto e fatura como pagos (como o cliente fazia).
    IF i.source_system = 'BOLETO' AND i.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        UPDATE public.boletos SET status = 'pago'
         WHERE id = i.reference_id::uuid AND organization_id = i.organization_id
        RETURNING invoice_id INTO v_invoice_id;
        IF v_invoice_id IS NOT NULL THEN
            UPDATE public.invoices SET status = 'paid' WHERE id = v_invoice_id;
        END IF;
    END IF;

    -- Conciliação com diferença: o resíduo vira lançamento de ajuste (tarifa/juros/desconto),
    -- já conciliado e vinculado ao MESMO movimento, para o saldo do razão bater com o do banco.
    IF p_adjustment_category IS NOT NULL AND btrim(p_adjustment_category) <> '' THEN
        v_residual := (CASE WHEN b.direction = 'CREDIT' THEN 1 ELSE -1 END) * (b.amount - i.amount);
        IF abs(v_residual) >= 0.01 THEN
            INSERT INTO public.internal_transactions
                (organization_id, source_system, transaction_date, amount, direction, description,
                 category, status, payment_date, project_id, cost_center_id)
            VALUES
                (i.organization_id, 'MANUAL', b.transaction_date, abs(v_residual),
                 CASE WHEN v_residual > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
                 'Ajuste de conciliação (' || p_adjustment_category || ')',
                 p_adjustment_category, 'CONCILIATED', b.transaction_date, i.project_id, i.cost_center_id)
            RETURNING id INTO v_adjust_id;

            INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
            VALUES (p_bank_id, v_adjust_id, 'MANUAL', 100, auth.uid());
        END IF;
    END IF;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (b.organization_id, auth.uid(), 'MATCH', p_bank_id, jsonb_build_object(
        'action', 'RECONCILE',
        'match_id', v_match_id,
        'internal_id', p_internal_id,
        'match_type', p_match_type,
        'confidence', p_confidence,
        'payment_date', v_pay_date,
        'adjustment_id', v_adjust_id,
        'adjustment_category', p_adjustment_category
    ));

    RETURN jsonb_build_object('match_id', v_match_id, 'payment_date', v_pay_date, 'adjustment_id', v_adjust_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. fn_reconcile_unmatch
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_unmatch(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    m            public.reconciliation_matches%ROWTYPE;
    b            public.bank_transactions%ROWTYPE;
    i            public.internal_transactions%ROWTYPE;
    v_remaining  int;
    v_invoice_id uuid;
    v_bank_status text;
BEGIN
    SELECT * INTO m FROM public.reconciliation_matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vínculo não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO b FROM public.bank_transactions WHERE id = m.bank_transaction_id FOR UPDATE;
    SELECT * INTO i FROM public.internal_transactions WHERE id = m.internal_transaction_id FOR UPDATE;

    DELETE FROM public.reconciliation_matches WHERE id = p_match_id;

    -- Extrato volta a pendente só se não restar outro vínculo (1 movimento → N títulos).
    SELECT count(*) INTO v_remaining FROM public.reconciliation_matches WHERE bank_transaction_id = b.id;
    IF v_remaining = 0 AND b.status = 'MATCHED' THEN
        v_bank_status := CASE WHEN COALESCE(b.category, '') <> '' THEN 'RULE_APPLIED' ELSE 'NORMALIZED' END;
        UPDATE public.bank_transactions SET status = v_bank_status WHERE id = b.id;
    END IF;

    -- Título volta a pendente só se não restar outro vínculo (N movimentos → 1 título).
    SELECT count(*) INTO v_remaining FROM public.reconciliation_matches WHERE internal_transaction_id = i.id;
    IF v_remaining = 0 THEN
        UPDATE public.internal_transactions SET status = 'PENDING', payment_date = NULL WHERE id = i.id;
        IF i.source_system = 'BOLETO' AND i.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            UPDATE public.boletos SET status = 'aprovado'
             WHERE id = i.reference_id::uuid AND organization_id = i.organization_id
            RETURNING invoice_id INTO v_invoice_id;
            IF v_invoice_id IS NOT NULL THEN
                UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice_id;
            END IF;
        END IF;
    ELSE
        UPDATE public.internal_transactions
           SET payment_date = (SELECT max(bt.transaction_date)
                                 FROM public.reconciliation_matches mm
                                 JOIN public.bank_transactions bt ON bt.id = mm.bank_transaction_id
                                WHERE mm.internal_transaction_id = i.id)
         WHERE id = i.id;
    END IF;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (b.organization_id, auth.uid(), 'UNMATCH', b.id, jsonb_build_object(
        'action', 'UNRECONCILE',
        'match_id', p_match_id,
        'internal_id', i.id,
        'bank_status_after', v_bank_status,
        'internal_status_after', CASE WHEN v_remaining = 0 THEN 'PENDING' ELSE i.status END
    ));

    RETURN jsonb_build_object('bank_id', b.id, 'internal_id', i.id, 'bank_status', v_bank_status);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_unmatch(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_unmatch(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. fn_reconcile_confirm — confirma sem título (tarifa, imposto, repasse já contabilizado)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_confirm(p_bank_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    b public.bank_transactions%ROWTYPE;
BEGIN
    SELECT * INTO b FROM public.bank_transactions WHERE id = p_bank_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimento bancário não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;
    IF b.status IN ('MATCHED', 'IGNORED') THEN
        RAISE EXCEPTION 'Movimento já está % — desfaça antes de confirmar.', b.status USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.bank_transactions SET status = 'CONFIRMED' WHERE id = p_bank_id;
    DELETE FROM public.reconciliation_suggestions WHERE bank_transaction_id = p_bank_id;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (b.organization_id, auth.uid(), 'MATCH', p_bank_id,
            jsonb_build_object('action', 'AUTO_CONFIRM_WITHOUT_INTERNAL', 'note', p_note));
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_confirm(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_confirm(uuid, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. fn_reconcile_ignore / fn_reconcile_unignore — substitui o hard delete do extrato
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_ignore(p_bank_ids uuid[], p_reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_matched int;
    v_count   int;
BEGIN
    SELECT count(*) INTO v_matched FROM public.bank_transactions
     WHERE id = ANY(p_bank_ids) AND status = 'MATCHED';
    IF v_matched > 0 THEN
        RAISE EXCEPTION '% movimento(s) já conciliado(s) na seleção — desfaça o vínculo antes de ignorar.', v_matched
              USING ERRCODE = 'check_violation';
    END IF;

    -- A auditoria nasce ANTES do UPDATE para guardar o status de onde a linha saiu.
    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    SELECT bt.organization_id, auth.uid(), 'IGNORE', bt.id,
           jsonb_build_object('action', 'IGNORE_BANK_TX', 'reason', p_reason, 'previous_status', bt.status,
                              'amount', bt.amount, 'direction', bt.direction, 'transaction_date', bt.transaction_date)
      FROM public.bank_transactions bt
     WHERE bt.id = ANY(p_bank_ids) AND bt.status <> 'IGNORED';

    DELETE FROM public.reconciliation_suggestions WHERE bank_transaction_id = ANY(p_bank_ids);

    UPDATE public.bank_transactions SET status = 'IGNORED'
     WHERE id = ANY(p_bank_ids) AND status <> 'IGNORED';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_ignore(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_ignore(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_reconcile_unignore(p_bank_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_count int;
BEGIN
    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    SELECT bt.organization_id, auth.uid(), 'UNIGNORE', bt.id, jsonb_build_object('action', 'RESTORE_BANK_TX')
      FROM public.bank_transactions bt
     WHERE bt.id = ANY(p_bank_ids) AND bt.status = 'IGNORED';

    UPDATE public.bank_transactions
       SET status = CASE WHEN COALESCE(category, '') <> '' THEN 'RULE_APPLIED' ELSE 'NORMALIZED' END
     WHERE id = ANY(p_bank_ids) AND status = 'IGNORED';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_unignore(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_unignore(uuid[]) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Dashboard e consolidado passam a ignorar IGNORED no saldo bancário
--    (base: 20270129000002 — mesma função, só o filtro `bt.status <> 'IGNORED'`)
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
      AND bt.status <> 'IGNORED'
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

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;

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
      AND bt.status <> 'IGNORED'
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

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_consolidated(uuid, date) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Backfill: payment_date dos vínculos existentes = data do extrato
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    UPDATE public.internal_transactions i
       SET payment_date = d.pay_date
      FROM (SELECT m.internal_transaction_id, max(bt.transaction_date) AS pay_date
              FROM public.reconciliation_matches m
              JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
             GROUP BY m.internal_transaction_id) d
     WHERE i.id = d.internal_transaction_id
       AND i.payment_date IS DISTINCT FROM d.pay_date;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 6: % títulos com payment_date corrigido para a data do extrato', n;
END $$;

COMMENT ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) IS
    'Concilia movimento × título numa transação: match (created_by), extrato MATCHED, título CONCILIATED com payment_date = data do extrato, boleto/fatura, ajuste opcional, auditoria.';
COMMENT ON FUNCTION public.fn_reconcile_unmatch(uuid) IS
    'Desfaz um vínculo numa transação, restaurando os dois lados só quando não resta outro vínculo. Auditoria UNMATCH.';
COMMENT ON FUNCTION public.fn_reconcile_ignore(uuid[], text) IS
    'Marca movimentos como IGNORED (não é movimento real: duplicata, linha de saldo). Substitui a exclusão do extrato. Auditoria IGNORE por movimento.';
