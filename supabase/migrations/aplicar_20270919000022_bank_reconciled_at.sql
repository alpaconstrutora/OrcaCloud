-- ==========================================================================
-- bank_reconciled_at — "pago" deixa de ser confundido com "conferido no banco"
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 3.1)
-- ==========================================================================
-- O PROBLEMA
-- `internal_transactions.status = 'CONCILIATED'` significa "baixado", e cinco
-- produtores diferentes o escrevem: webhook do Asaas, boleto, sync comercial,
-- contrato e a própria conciliação bancária. Em 06/09/2026 havia 634 títulos assim
-- e só 32 tinham vindo do extrato.
--
-- O Dashboard somava TODOS no "saldo do sistema" e chamava a diferença contra o
-- extrato de "gap de integridade". Só que estava comparando coisas diferentes: de
-- um lado o que o banco mostra, do outro tudo que alguém deu baixa, inclusive o que
-- nunca passou por extrato nenhum. A diferença nunca fecharia, e um indicador que
-- não pode fechar não informa nada — vira ruído que se aprende a ignorar.
--
-- `bank_reconciled_at` responde a pergunta certa: "este título foi conferido contra
-- o extrato, e quando?". Só a conciliação bancária escreve nele.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS bank_reconciled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.internal_transactions.bank_reconciled_at IS
  'Quando este título foi conferido contra o extrato bancário. Escrito SÓ por fn_reconcile_match e limpo por fn_reconcile_unmatch. Diferente de status=CONCILIATED, que significa apenas "baixado" e tem cinco produtores.';

CREATE INDEX IF NOT EXISTS idx_internal_tx_bank_reconciled
  ON public.internal_transactions (organization_id, bank_reconciled_at)
  WHERE bank_reconciled_at IS NOT NULL;

-- ── Backfill: quem já tem vínculo já foi conferido ─────────────────────────
DO $$
DECLARE n int;
BEGIN
    UPDATE public.internal_transactions i
       SET bank_reconciled_at = d.quando
      FROM (SELECT m.internal_transaction_id, min(m.created_at) AS quando
              FROM public.reconciliation_matches m
             GROUP BY m.internal_transaction_id) d
     WHERE i.id = d.internal_transaction_id
       AND i.bank_reconciled_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Backfill: % títulos marcados como conferidos no extrato', n;
END $$;

-- ── fn_reconcile_match passa a carimbar ────────────────────────────────────
-- Recriada inteira (base: aplicar_20270919000014) com a única diferença sendo o
-- carimbo. Repetir a função por completo é mais seguro que um patch cirúrgico:
-- deixa o arquivo autossuficiente para quem a ler depois.
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

    SELECT max(bt.transaction_date) INTO v_pay_date
      FROM public.reconciliation_matches m
      JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
     WHERE m.internal_transaction_id = p_internal_id;

    UPDATE public.bank_transactions SET status = 'MATCHED' WHERE id = p_bank_id;
    UPDATE public.internal_transactions
       SET status = 'CONCILIATED',
           payment_date = v_pay_date,
           bank_reconciled_at = COALESCE(bank_reconciled_at, now())   -- ← o carimbo
     WHERE id = p_internal_id;

    IF i.source_system = 'BOLETO' AND i.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        UPDATE public.boletos SET status = 'pago'
         WHERE id = i.reference_id::uuid AND organization_id = i.organization_id
        RETURNING invoice_id INTO v_invoice_id;
        IF v_invoice_id IS NOT NULL THEN
            UPDATE public.invoices SET status = 'paid' WHERE id = v_invoice_id;
        END IF;
    END IF;

    IF p_adjustment_category IS NOT NULL AND btrim(p_adjustment_category) <> '' THEN
        v_residual := (CASE WHEN b.direction = 'CREDIT' THEN 1 ELSE -1 END) * (b.amount - i.amount);
        IF abs(v_residual) >= 0.01 THEN
            INSERT INTO public.internal_transactions
                (organization_id, source_system, transaction_date, amount, direction, description,
                 category, status, payment_date, bank_reconciled_at, project_id, cost_center_id)
            VALUES
                (i.organization_id, 'MANUAL', b.transaction_date, abs(v_residual),
                 CASE WHEN v_residual > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
                 'Ajuste de conciliação (' || p_adjustment_category || ')',
                 p_adjustment_category, 'CONCILIATED', b.transaction_date, now(), i.project_id, i.cost_center_id)
            RETURNING id INTO v_adjust_id;

            INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
            VALUES (p_bank_id, v_adjust_id, 'MANUAL', 100, auth.uid());
        END IF;
    END IF;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (b.organization_id, auth.uid(), 'MATCH', p_bank_id, jsonb_build_object(
        'action', 'RECONCILE', 'match_id', v_match_id, 'internal_id', p_internal_id,
        'match_type', p_match_type, 'confidence', p_confidence, 'payment_date', v_pay_date,
        'adjustment_id', v_adjust_id, 'adjustment_category', p_adjustment_category));

    RETURN jsonb_build_object('match_id', v_match_id, 'payment_date', v_pay_date, 'adjustment_id', v_adjust_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) TO authenticated;

-- ── fn_reconcile_unmatch limpa o carimbo quando não resta vínculo ──────────
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

    SELECT count(*) INTO v_remaining FROM public.reconciliation_matches WHERE bank_transaction_id = b.id;
    IF v_remaining = 0 AND b.status = 'MATCHED' THEN
        v_bank_status := CASE WHEN COALESCE(b.category, '') <> '' THEN 'RULE_APPLIED' ELSE 'NORMALIZED' END;
        UPDATE public.bank_transactions SET status = v_bank_status WHERE id = b.id;
    END IF;

    SELECT count(*) INTO v_remaining FROM public.reconciliation_matches WHERE internal_transaction_id = i.id;
    IF v_remaining = 0 THEN
        -- Sem vínculo, o título deixa de estar conferido contra o extrato.
        UPDATE public.internal_transactions
           SET status = 'PENDING', payment_date = NULL, bank_reconciled_at = NULL
         WHERE id = i.id;
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
        'action', 'UNRECONCILE', 'match_id', p_match_id, 'internal_id', i.id,
        'bank_status_after', v_bank_status,
        'internal_status_after', CASE WHEN v_remaining = 0 THEN 'PENDING' ELSE i.status END));

    RETURN jsonb_build_object('bank_id', b.id, 'internal_id', i.id, 'bank_status', v_bank_status);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_unmatch(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_unmatch(uuid) TO authenticated;

-- ── O Dashboard passa a separar "baixado" de "conferido no extrato" ────────
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
    -- DOIS números, não um. `baixado` é qualquer origem (webhook, boleto, sync);
    -- `conferido` é só o que passou pelo extrato. Comparar o extrato com o primeiro
    -- era comparar coisas diferentes, e a diferença nunca fechava.
    SELECT COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.status = 'CONCILIATED'), 0)                        AS baixado_net,
           COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END)
                    FILTER (WHERE it.bank_reconciled_at IS NOT NULL), 0)                AS conferido_net,
           COUNT(*) FILTER (WHERE it.status = 'CONCILIATED')                            AS baixado_count,
           COUNT(*) FILTER (WHERE it.bank_reconciled_at IS NOT NULL)                    AS conferido_count
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
        SELECT (SELECT COALESCE(SUM(opening_balance), 0) FROM per_account) + l.baixado_net FROM ledger l),
    'ledger', (
        SELECT jsonb_build_object(
            'baixado_net',      l.baixado_net,
            'baixado_count',    l.baixado_count,
            'conferido_net',    l.conferido_net,
            'conferido_count',  l.conferido_count,
            'so_baixado_count', l.baixado_count - l.conferido_count
          ) FROM ledger l),
    'fees', (SELECT jsonb_build_object('value', fees_value, 'count', fees_count) FROM fees)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_dashboard(uuid, date) TO authenticated;
