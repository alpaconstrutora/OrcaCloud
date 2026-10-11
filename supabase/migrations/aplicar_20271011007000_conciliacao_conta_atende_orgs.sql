-- ════════════════════════════════════════════════════════════════════════════
-- Conciliação: conta que ATENDE outras organizações vale para o motor e para o vínculo.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- Plano: docs/planos/2026-10-11-conciliacao-conta-atende-todas-organizacoes.md
--
-- O caso (11/10/2026): conta Banco Itaú (org "Altair Pereira da Rosa") marcada
-- "atende todas as organizações"; aluguel da Igreja Universal é título da Alpa. A tela
-- Pendentes mostrava os dois lados, mas o motor só buscava título da org DONA da conta
-- (0 títulos → title_rows_scanned = 0 em toda execução) e fn_reconcile_match recusava
-- "organizações diferentes". Regra do usuário: "Se está marcado todas organizações é
-- porque todas as organizações deve ser aceita pelo sistema."
--
-- E, na mesma conversa: "Tudo deve ser como realmente foi a transação. Se um título da
-- Alpa foi pago no Garden, o app deve registrar no Garden. O app não pode inventar."
-- → o título continua na org dele; o vínculo grava no título a conta REAL do extrato.
--
-- Corpos de fn_reconcile_match/unmatch (aplicar_20270919000022), fn_reconcile_group
-- (aplicar_20271010005001) e fn_reconciliation_divergences (aplicar_20271001000070) vêm
-- dos ARQUIVOS, conferidos idênticos ao banco em 11/10/2026 (prosrc normalizado).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Quais organizações uma conta atende ──────────────────────────────────
--
-- Dona + lista explícita (payment_account_organizations) + "todas", quando marcada.
-- "Todas" NÃO é "todas as linhas de organizations": o banco é multi-tenant, e "todas"
-- alcançaria título de outro cliente do SaaS. É "todas as organizações de quem cuida
-- desta conta": as que têm algum membro em comum com a dona. Na tela, "todas" é a lista
-- de orgs do usuário logado; aqui não há usuário (o cron chama sem um), então a fronteira
-- é a da dona.
--
-- SECURITY DEFINER porque lê organization_members de outras orgs (a RLS de quem chama
-- não enxerga membro alheio). Por isso a autorização vai DENTRO (REGRA #7): pessoa só
-- recebe resposta se for membro da org dona; service_role (Edge) e postgres passam.
CREATE OR REPLACE FUNCTION public.fn_orgs_atendidas_pela_conta(p_conta uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_dona  uuid;
    v_todas boolean;
BEGIN
    SELECT organization_id, COALESCE(serves_all_organizations, false)
      INTO v_dona, v_todas
      FROM public.payment_accounts WHERE id = p_conta;
    IF v_dona IS NULL THEN
        RETURN;
    END IF;
    IF auth.role() IN ('authenticated', 'anon') AND NOT public.is_org_member(v_dona) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT v_dona
    UNION
    SELECT pao.organization_id
      FROM public.payment_account_organizations pao
     WHERE pao.payment_account_id = p_conta
    UNION
    SELECT outra.organization_id
      FROM public.organization_members dona
      JOIN public.organization_members outra
        ON COALESCE(outra.user_id::text, lower(outra.email)) = COALESCE(dona.user_id::text, lower(dona.email))
     WHERE v_todas
       AND dona.organization_id = v_dona
       AND COALESCE(dona.user_id::text, lower(dona.email)) IS NOT NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_orgs_atendidas_pela_conta(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_orgs_atendidas_pela_conta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_orgs_atendidas_pela_conta(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_conta_atende_org(p_conta uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
    SELECT p_org IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.fn_orgs_atendidas_pela_conta(p_conta) o WHERE o = p_org);
$fn$;

REVOKE ALL ON FUNCTION public.fn_conta_atende_org(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_conta_atende_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_conta_atende_org(uuid, uuid) TO authenticated, service_role;

-- ── 2. A conta do título ANTES do vínculo, para o desfazer devolver ────────
ALTER TABLE public.reconciliation_matches
    ADD COLUMN IF NOT EXISTS conta_do_titulo_antes uuid;

COMMENT ON COLUMN public.reconciliation_matches.conta_do_titulo_antes IS
    'internal_transactions.payment_account_id antes do PRIMEIRO vínculo do título. fn_reconcile_unmatch devolve este valor quando o último vínculo sai.';

-- Vínculos anteriores: o título ainda não tinha recebido a conta real, então o valor de
-- "antes" é o atual. Feito ANTES do backfill do item 3.
UPDATE public.reconciliation_matches m
   SET conta_do_titulo_antes = it.payment_account_id
  FROM public.internal_transactions it
 WHERE it.id = m.internal_transaction_id
   AND m.conta_do_titulo_antes IS NULL;

-- ── 3. Títulos já vinculados recebem a conta real do extrato ────────────────
--
-- Só quando todos os vínculos do título são de UMA conta e o título não tem conta.
-- Reversão guardada (NÃO apagar): restaurar é
--   UPDATE internal_transactions it SET payment_account_id = r.payment_account_id_antes
--     FROM conciliacao_conta_real_reversao_20261011 r WHERE r.id = it.id;
CREATE TABLE IF NOT EXISTS public.conciliacao_conta_real_reversao_20261011 (
    id                       uuid PRIMARY KEY,
    payment_account_id_antes uuid,
    payment_account_id_depois uuid,
    gravado_em               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conciliacao_conta_real_reversao_20261011 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conciliacao_conta_real_reversao_20261011 FROM anon, authenticated;

WITH conta_real AS (
    SELECT m.internal_transaction_id AS id, min(bt.bank_account_id::text)::uuid AS conta
      FROM public.reconciliation_matches m
      JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
     GROUP BY m.internal_transaction_id
    HAVING count(DISTINCT bt.bank_account_id) = 1
), alvo AS (
    SELECT it.id, it.payment_account_id AS antes, cr.conta AS depois
      FROM public.internal_transactions it
      JOIN conta_real cr ON cr.id = it.id
     WHERE it.payment_account_id IS NULL
), gravado AS (
    INSERT INTO public.conciliacao_conta_real_reversao_20261011 (id, payment_account_id_antes, payment_account_id_depois)
    SELECT id, antes, depois FROM alvo
    ON CONFLICT (id) DO NOTHING
    RETURNING id, payment_account_id_depois
)
UPDATE public.internal_transactions it
   SET payment_account_id = g.payment_account_id_depois
  FROM gravado g
 WHERE it.id = g.id;

-- ── 4. fn_reconcile_match ───────────────────────────────────────────────────
--
-- Três mudanças sobre aplicar_20270919000022:
--  a) org diferente passa quando a conta do extrato ATENDE a org do título;
--  b) título já vinculado a OUTRO movimento (em transação anterior) é recusado —
--     pagamento em mais de um movimento é o "Vincular em grupo". Vínculo criado na
--     MESMA transação passa: é o laço do fn_reconcile_group (2 movimentos × 1 título).
--     `created_at` tem DEFAULT now(), que é o início da transação: igual = esta;
--     menor = outra, já gravada;
--  c) o título recebe a conta REAL do extrato (payment_account_id).
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
    v_outro      record;
    v_conta_antes uuid;
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
    IF b.organization_id <> i.organization_id
       AND NOT public.fn_conta_atende_org(b.bank_account_id, i.organization_id) THEN
        RAISE EXCEPTION 'A conta bancária deste movimento não atende a organização do lançamento. Para aceitar, marque a organização em Minha Organização › Contas › "Atende também".' USING ERRCODE = 'check_violation';
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

    SELECT bt.transaction_date, bt.amount, m.conta_do_titulo_antes INTO v_outro
      FROM public.reconciliation_matches m
      JOIN public.bank_transactions bt ON bt.id = m.bank_transaction_id
     WHERE m.internal_transaction_id = p_internal_id
       AND m.bank_transaction_id <> p_bank_id
       AND m.created_at < now()
     ORDER BY m.created_at
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Este lançamento já está conciliado com outro movimento do extrato (% · R$ %). Para pagamento em mais de um movimento, use "Vincular em grupo"; para trocar, desfaça o vínculo atual.',
            to_char(v_outro.transaction_date, 'DD/MM/YYYY'), replace(to_char(v_outro.amount, 'FM999999999990.00'), '.', ',')
            USING ERRCODE = 'check_violation';
    END IF;

    -- A conta do título antes do PRIMEIRO vínculo: se já há vínculo (mesma transação,
    -- ou o mesmo par regravado), herda o "antes" dele — o título já foi alterado.
    SELECT m.conta_do_titulo_antes INTO v_conta_antes
      FROM public.reconciliation_matches m
     WHERE m.internal_transaction_id = p_internal_id
     ORDER BY m.created_at
     LIMIT 1;
    IF NOT FOUND THEN
        v_conta_antes := i.payment_account_id;
    END IF;

    INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by, conta_do_titulo_antes)
    VALUES (p_bank_id, p_internal_id, p_match_type, LEAST(COALESCE(p_confidence, 100), 100), auth.uid(), v_conta_antes)
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
           payment_account_id = b.bank_account_id,                     -- ← a conta REAL
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
                 category, status, payment_date, bank_reconciled_at, project_id, cost_center_id, payment_account_id)
            VALUES
                (i.organization_id, 'MANUAL', b.transaction_date, abs(v_residual),
                 CASE WHEN v_residual > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
                 'Ajuste de conciliação (' || p_adjustment_category || ')',
                 p_adjustment_category, 'CONCILIATED', b.transaction_date, now(), i.project_id, i.cost_center_id, b.bank_account_id)
            RETURNING id INTO v_adjust_id;

            INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
            VALUES (p_bank_id, v_adjust_id, 'MANUAL', 100, auth.uid());
        END IF;
    END IF;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (b.organization_id, auth.uid(), 'MATCH', p_bank_id, jsonb_build_object(
        'action', 'RECONCILE', 'match_id', v_match_id, 'internal_id', p_internal_id,
        'match_type', p_match_type, 'confidence', p_confidence, 'payment_date', v_pay_date,
        'adjustment_id', v_adjust_id, 'adjustment_category', p_adjustment_category,
        'internal_org', i.organization_id, 'payment_account_id', b.bank_account_id));

    RETURN jsonb_build_object('match_id', v_match_id, 'payment_date', v_pay_date, 'adjustment_id', v_adjust_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_match(uuid, uuid, text, numeric, text) TO authenticated;

-- ── 5. fn_reconcile_unmatch devolve a conta do título ───────────────────────
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
        -- Sem vínculo, o título deixa de estar conferido contra o extrato — e volta a
        -- ter a conta que tinha antes do primeiro vínculo.
        UPDATE public.internal_transactions
           SET status = 'PENDING', payment_date = NULL, bank_reconciled_at = NULL,
               payment_account_id = m.conta_do_titulo_antes
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
                                WHERE mm.internal_transaction_id = i.id),
               -- Sobrou vínculo: a conta é a do movimento mais recente que restou.
               payment_account_id = (SELECT bt.bank_account_id
                                       FROM public.reconciliation_matches mm
                                       JOIN public.bank_transactions bt ON bt.id = mm.bank_transaction_id
                                      WHERE mm.internal_transaction_id = i.id
                                      ORDER BY bt.transaction_date DESC, bt.id
                                      LIMIT 1)
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

-- ── 6. fn_reconcile_group ───────────────────────────────────────────────────
--
-- Sobre aplicar_20271010005001, só a trava de organização e a org/conta do que nasce:
--  • os LANÇAMENTOS precisam ser de uma org só (ajuste/excedente nascem nela, a mesma
--    convenção do resíduo de fn_reconcile_match);
--  • cada MOVIMENTO é da mesma org ou de conta que atende a org dos lançamentos;
--  • ajuste/excedente recebem a conta real quando o extrato do grupo é de UMA conta.
CREATE OR REPLACE FUNCTION public.fn_reconcile_group(p_bank_ids uuid[], p_internal_ids uuid[], p_mode text, p_params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- Origens cujo `amount` a sincronização regrava (upsert/delete+insert pela
    -- origem, SEM poupar título pago — levantamento de 29/09/2026 no plano):
    -- mudar o valor aqui seria desfeito em silêncio. Mesma lista de
    -- ORIGENS_VALOR_SINCRONIZADO (utils/reconciliationSelection.ts).
    c_origens_sync  constant text[] := ARRAY['PROJECT', 'COMMERCIAL', 'PURCHASE_ORDER', 'CONTRACT_PARCELADO', 'CONTRACT_MEASUREMENT', 'CONTRACT_AVISTA', 'CONTRACT_RECURRING', 'LABOR', 'DEBT_INSTALLMENT', 'BOLETO'];

    v_org           uuid;
    v_org_extrato   uuid;
    v_conta         uuid;
    v_dir           text;
    v_n_bank        int;
    v_n_int         int;
    v_n_dir         int;
    v_sum_bank      numeric;
    v_sum_int       numeric;
    v_diff          numeric;
    v_tol           numeric;
    v_max_date      date;
    v_params        jsonb := COALESCE(p_params, '{}'::jsonb);
    v_cat           text;
    v_new_id        uuid;
    v_created       uuid[] := ARRAY[]::uuid[];
    v_saldo_id      uuid;
    v_match_ids     uuid[] := ARRAY[]::uuid[];
    v_ret           jsonb;
    v_split         public.internal_transactions%ROWTYPE;
    v_first         public.internal_transactions%ROWTYPE;
    v_antes         jsonb;
    v_bid           uuid;
    v_iid           uuid;
    v_residual      numeric;
BEGIN
    IF p_mode NOT IN ('EXACT', 'ADJUSTMENT', 'EXCESS', 'PARTIAL', 'ADJUST_VALUE') THEN
        RAISE EXCEPTION 'Modo de conciliação inválido: %', p_mode USING ERRCODE = 'check_violation';
    END IF;

    SELECT array_agg(DISTINCT x) INTO p_bank_ids FROM unnest(p_bank_ids) x WHERE x IS NOT NULL;
    SELECT array_agg(DISTINCT x) INTO p_internal_ids FROM unnest(p_internal_ids) x WHERE x IS NOT NULL;
    IF COALESCE(array_length(p_bank_ids, 1), 0) = 0 OR COALESCE(array_length(p_internal_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Selecione ao menos 1 movimento do extrato e 1 lançamento.' USING ERRCODE = 'check_violation';
    END IF;

    -- Trava tudo antes de decidir (ordem por id evita deadlock entre duas abas).
    PERFORM 1 FROM public.bank_transactions WHERE id = ANY(p_bank_ids) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.internal_transactions WHERE id = ANY(p_internal_ids) ORDER BY id FOR UPDATE;

    SELECT count(*), sum(abs(amount)), min(organization_id::text)::uuid, max(transaction_date),
           CASE WHEN count(DISTINCT bank_account_id) = 1 THEN min(bank_account_id::text)::uuid END
      INTO v_n_bank, v_sum_bank, v_org_extrato, v_max_date, v_conta
      FROM public.bank_transactions WHERE id = ANY(p_bank_ids);
    -- valor_esperado = bruto menos os tributos retidos pelo cliente (o que o
    -- banco de fato credita). Sem retenção é igual ao amount.
    SELECT count(*), sum(abs(public.valor_esperado(it))), min(it.organization_id::text)::uuid
      INTO v_n_int, v_sum_int, v_org
      FROM public.internal_transactions it WHERE it.id = ANY(p_internal_ids);

    IF v_n_bank <> array_length(p_bank_ids, 1) THEN
        RAISE EXCEPTION 'Movimento bancário não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_n_int <> array_length(p_internal_ids, 1) THEN
        RAISE EXCEPTION 'Lançamento interno não encontrado (ou sem acesso).' USING ERRCODE = 'no_data_found';
    END IF;

    IF (SELECT count(DISTINCT organization_id) FROM public.internal_transactions WHERE id = ANY(p_internal_ids)) > 1 THEN
        RAISE EXCEPTION 'Os lançamentos selecionados são de organizações diferentes — concilie cada organização separadamente.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bank_transactions bt
                WHERE bt.id = ANY(p_bank_ids)
                  AND bt.organization_id <> v_org
                  AND NOT public.fn_conta_atende_org(bt.bank_account_id, v_org)) THEN
        RAISE EXCEPTION 'Há movimento de conta bancária que não atende a organização dos lançamentos. Para aceitar, marque a organização em Minha Organização › Contas › "Atende também".' USING ERRCODE = 'check_violation';
    END IF;

    SELECT min(direction), count(DISTINCT direction) INTO v_dir, v_n_dir FROM (
        SELECT direction FROM public.bank_transactions WHERE id = ANY(p_bank_ids)
        UNION ALL
        SELECT direction FROM public.internal_transactions WHERE id = ANY(p_internal_ids)) d;
    IF v_n_dir > 1 THEN
        RAISE EXCEPTION 'A seleção mistura entradas e saídas — concilie cada direção separadamente.' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (SELECT 1 FROM public.bank_transactions
                WHERE id = ANY(p_bank_ids) AND status IN ('MATCHED', 'IGNORED', 'TRANSFER', 'LOCKED')) THEN
        RAISE EXCEPTION 'Há movimento do extrato já conciliado, ignorado, transferência ou bloqueado na seleção.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_transactions
                WHERE id = ANY(p_internal_ids) AND status IN ('CONCILIATED', 'CANCELLED')) THEN
        RAISE EXCEPTION 'Há lançamento já conciliado ou cancelado na seleção.' USING ERRCODE = 'check_violation';
    END IF;

    v_diff := round(v_sum_bank - v_sum_int, 2);

    -- ── Resolve a diferença conforme o modo ─────────────────────────────────
    IF p_mode = 'EXACT' THEN
        v_tol := GREATEST(
            0.01,
            COALESCE((v_params->>'tolerance_abs')::numeric, 0),
            COALESCE((v_params->>'tolerance_pct')::numeric, 0) / 100 * GREATEST(v_sum_bank, v_sum_int));
        IF abs(v_diff) >= v_tol THEN
            RAISE EXCEPTION 'Extrato (%) e lançamentos (%) têm diferença de % — use um ajuste.',
                v_sum_bank, v_sum_int, v_diff USING ERRCODE = 'check_violation';
        END IF;

    ELSIF abs(v_diff) < 0.01 THEN
        RAISE EXCEPTION 'Não há diferença a ajustar — use Conciliar.' USING ERRCODE = 'check_violation';

    ELSIF p_mode = 'ADJUSTMENT' THEN
        v_cat := NULLIF(btrim(v_params->>'category'), '');
        IF v_cat IS NULL THEN
            RAISE EXCEPTION 'Escolha a categoria do ajuste.' USING ERRCODE = 'check_violation';
        END IF;
        SELECT * INTO v_first FROM public.internal_transactions WHERE id = ANY(p_internal_ids) ORDER BY amount DESC, id LIMIT 1;
        -- Mesma convenção de fn_reconcile_match: resíduo em "sinal de caixa".
        v_residual := (CASE WHEN v_dir = 'CREDIT' THEN 1 ELSE -1 END) * v_diff;
        INSERT INTO public.internal_transactions
            (organization_id, source_system, transaction_date, amount, direction, description,
             category, status, payment_date, bank_reconciled_at, project_id, cost_center_id, created_by, payment_account_id)
        VALUES
            (v_org, 'MANUAL', v_max_date, abs(v_residual),
             CASE WHEN v_residual > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
             'Ajuste de conciliação (' || v_cat || ')',
             v_cat, 'CONCILIATED', v_max_date, now(), v_first.project_id, v_first.cost_center_id, auth.uid(), v_conta)
        RETURNING id INTO v_new_id;
        v_created := v_created || v_new_id;

    ELSIF p_mode = 'EXCESS' THEN
        IF v_diff < 0 THEN
            RAISE EXCEPTION 'O extrato é menor que os lançamentos — não há excedente para lançar.' USING ERRCODE = 'check_violation';
        END IF;
        INSERT INTO public.internal_transactions
            (organization_id, source_system, transaction_date, due_date, amount, direction, description,
             category, status, payment_date, bank_reconciled_at, supplier_id, party_id,
             entity_name, party_name, party_type, project_id, cost_center_id, created_by)
        VALUES
            (v_org, 'MANUAL', v_max_date, v_max_date, v_diff, v_dir,
             COALESCE(NULLIF(btrim(v_params->>'description'), ''), 'Excedente de conciliação'),
             NULLIF(btrim(v_params->>'category'), ''), 'CONCILIATED', v_max_date, now(),
             NULLIF(v_params->>'supplier_id', '')::uuid, NULLIF(v_params->>'party_id', '')::uuid,
             -- O credor pode ser colaborador (sem FK possível): o nome sempre vai.
             NULLIF(btrim(v_params->>'entity_name'), ''), NULLIF(btrim(v_params->>'entity_name'), ''),
             CASE WHEN NULLIF(btrim(v_params->>'entity_name'), '') IS NULL THEN NULL
                  WHEN v_dir = 'CREDIT' THEN 'CLIENT' ELSE 'SUPPLIER' END,
             NULLIF(v_params->>'project_id', '')::uuid, NULLIF(v_params->>'cost_center_id', '')::uuid, auth.uid())
        RETURNING id INTO v_new_id;
        -- Entra no grupo como um lançamento a mais: vinculado a todo o extrato
        -- (fn_reconcile_match grava nele a conta real).
        p_internal_ids := p_internal_ids || v_new_id;
        v_created := v_created || v_new_id;

    ELSIF p_mode = 'PARTIAL' THEN
        IF v_diff > 0 THEN
            RAISE EXCEPTION 'O extrato é maior que os lançamentos — não há saldo a deixar em aberto.' USING ERRCODE = 'check_violation';
        END IF;
        SELECT * INTO v_split FROM public.internal_transactions
         WHERE id = NULLIF(v_params->>'split_internal_id', '')::uuid AND id = ANY(p_internal_ids);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Escolha, entre os lançamentos selecionados, qual fica com o saldo em aberto.' USING ERRCODE = 'check_violation';
        END IF;
        IF v_split.source_system = ANY(c_origens_sync) THEN
            RAISE EXCEPTION 'O valor de lançamentos de origem % é regravado pela sincronização — não dá para desmembrar aqui.', v_split.source_system USING ERRCODE = 'check_violation';
        END IF;
        IF abs(v_split.amount) <= abs(v_diff) THEN
            RAISE EXCEPTION 'O lançamento escolhido (%) não é maior que a diferença (%).', v_split.amount, abs(v_diff) USING ERRCODE = 'check_violation';
        END IF;

        v_antes := jsonb_build_object('id', v_split.id, 'amount', v_split.amount);
        UPDATE public.internal_transactions
           SET amount = abs(v_split.amount) - abs(v_diff),
               updated_at = now()
         WHERE id = v_split.id;

        -- O saldo é um CLONE do título (credor, categoria, obra, CC, vencimento,
        -- aprovação…) só com o que precisa mudar. reference_id vai NULL: o índice
        -- único é (organization_id, reference_id, entry_type).
        INSERT INTO public.internal_transactions
        SELECT (jsonb_populate_record(v_split, jsonb_build_object(
                    'id', gen_random_uuid(),
                    'amount', abs(v_diff),
                    'original_amount', NULL,
                    'discount_type', NULL,
                    'discount_amount', NULL,
                    'source_system', 'MANUAL',
                    'reference_id', NULL,
                    'description', 'Saldo de ' || COALESCE(v_split.description, 'lançamento'),
                    'status', 'PENDING',
                    'business_status', CASE WHEN v_split.business_status IN ('PAGO', 'RECEBIDO', 'PARCIAL')
                                            THEN NULL ELSE v_split.business_status END,
                    'payment_date', NULL,
                    'bank_reconciled_at', NULL,
                    'journal_entry_id', NULL,
                    'created_by', auth.uid(),
                    'created_at', now(),
                    'updated_at', now()))).*
        RETURNING id INTO v_saldo_id;

    ELSIF p_mode = 'ADJUST_VALUE' THEN
        IF array_length(p_internal_ids, 1) <> 1 THEN
            RAISE EXCEPTION 'Ajustar valor exige exatamente 1 lançamento selecionado.' USING ERRCODE = 'check_violation';
        END IF;
        SELECT * INTO v_first FROM public.internal_transactions WHERE id = p_internal_ids[1];
        IF v_first.source_system = ANY(c_origens_sync) THEN
            RAISE EXCEPTION 'O valor de lançamentos de origem % é regravado pela sincronização — não dá para ajustar aqui.', v_first.source_system USING ERRCODE = 'check_violation';
        END IF;
        v_antes := jsonb_build_object('id', v_first.id, 'amount', v_first.amount);
        UPDATE public.internal_transactions
           SET amount = v_sum_bank,
               updated_at = now()
         WHERE id = v_first.id;
    END IF;

    -- ── Vínculos: todo extrato × todo lançamento do grupo ───────────────────
    FOREACH v_bid IN ARRAY p_bank_ids LOOP
        FOREACH v_iid IN ARRAY p_internal_ids LOOP
            v_ret := public.fn_reconcile_match(v_bid, v_iid, 'MANUAL', 100, NULL);
            v_match_ids := v_match_ids || (v_ret->>'match_id')::uuid;
        END LOOP;
    END LOOP;

    -- O ajuste pode ter direção OPOSTA ao grupo (desconto num recebimento, por
    -- exemplo): fn_reconcile_match recusaria. Vínculo direto, como o ajuste por par.
    IF p_mode = 'ADJUSTMENT' THEN
        INSERT INTO public.reconciliation_matches (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
        SELECT b, v_created[1], 'MANUAL', 100, auth.uid() FROM unnest(p_bank_ids) b
        ON CONFLICT (bank_transaction_id, internal_transaction_id) DO NOTHING;
    END IF;

    INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
    VALUES (v_org_extrato, auth.uid(), 'MATCH', p_bank_ids[1], jsonb_build_object(
        'action', 'RECONCILE_GROUP', 'mode', p_mode,
        'bank_ids', to_jsonb(p_bank_ids), 'internal_ids', to_jsonb(p_internal_ids),
        'sum_bank', v_sum_bank, 'sum_internal', v_sum_int, 'diff', v_diff,
        'created_ids', to_jsonb(v_created), 'split_saldo_id', v_saldo_id,
        'antes', v_antes, 'params', v_params, 'internal_org', v_org));

    RETURN jsonb_build_object(
        'match_ids', to_jsonb(v_match_ids),
        'created_ids', to_jsonb(v_created),
        'split_saldo_id', v_saldo_id,
        'diff', v_diff);
END;
$function$;

-- ── 7. fn_reconciliation_divergences ────────────────────────────────────────
--
-- Sobre aplicar_20271001000070, só o par de valor divergente: o extrato casa título
-- da org dele OU de org que a conta dele atende. Os títulos candidatos não passam pelo
-- filtro de org do topo (a conta selecionada decide quem é candidato; a RLS recorta o
-- que a pessoa enxerga). A lista "título sem extrato" segue o filtro do topo.
CREATE OR REPLACE FUNCTION public.fn_reconciliation_divergences(
    p_organization_id uuid,
    p_as_of           date    DEFAULT CURRENT_DATE,
    p_aging_days      integer DEFAULT 5,
    p_value_tolerance numeric DEFAULT 50,
    p_limit           integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH
-- Categorias que cada organização tirou da conciliação (painel Regras da Central),
-- já normalizadas: sem acento, sem caixa, sem espaço nas pontas.
excluded AS (
  SELECT rs.organization_id, lower(public.unaccent(btrim(c))) AS cat
  FROM public.reconciliation_settings rs
  CROSS JOIN LATERAL unnest(rs.excluded_categories) AS c
),
-- Organizações que desligaram "Incluir lançamentos do extrato sem credor/cliente definido".
sem_contraparte_fora AS (
  SELECT rs.organization_id FROM public.reconciliation_settings rs
  WHERE NOT rs.include_without_counterparty
),
bank_pending AS (
  SELECT bt.id, bt.organization_id, bt.bank_account_id, bt.transaction_date, bt.amount, bt.direction,
         COALESCE(bt.description_normalized, bt.description_raw) AS description,
         bt.category, pa.name AS account_name
  FROM public.bank_transactions bt
  JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id
  WHERE (p_organization_id IS NULL OR bt.organization_id = p_organization_id)
    AND bt.status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')
    AND bt.transaction_date <= p_as_of
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.bank_transaction_id = bt.id)
    -- Extrato de categoria excluída não é divergência. Sem categoria nunca é excluído.
    AND NOT EXISTS (SELECT 1 FROM excluded e
                    WHERE e.organization_id = bt.organization_id
                      AND e.cat = lower(public.unaccent(btrim(bt.category))))
    -- Extrato sem credor/cliente, quando a organização desligou a inclusão.
    AND NOT (NULLIF(btrim(bt.counterparty_name), '') IS NULL
             AND EXISTS (SELECT 1 FROM sem_contraparte_fora s WHERE s.organization_id = bt.organization_id))
),
internal_pending AS (
  SELECT it.id, it.organization_id, it.transaction_date, it.due_date, it.amount, it.direction,
         it.description, it.category, it.party_name, it.business_status, it.project_id
  FROM public.internal_transactions it
  WHERE (p_organization_id IS NULL OR it.organization_id = p_organization_id)
    AND it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
-- Candidatos do par divergente: qualquer título pendente que a pessoa enxerga. Quem
-- decide se ele vale para um extrato é a CONTA do extrato (bank_orgs, abaixo).
internal_candidates AS (
  SELECT it.id, it.organization_id, it.transaction_date, it.amount, it.direction, it.description
  FROM public.internal_transactions it
  WHERE it.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = it.id)
),
-- Organizações que cada conta do extrato atende (dona + lista + "todas").
conta_orgs AS (
  SELECT c.bank_account_id, o AS organization_id
  FROM (SELECT DISTINCT bank_account_id FROM bank_pending) c
  CROSS JOIN LATERAL public.fn_orgs_atendidas_pela_conta(c.bank_account_id) AS o
),
-- Cada extrato × as orgs cujos títulos ele pode casar: a dele, e as da conta.
bank_orgs AS (
  SELECT b.id AS bank_id, b.organization_id FROM bank_pending b
  UNION
  SELECT b.id, co.organization_id FROM bank_pending b JOIN conta_orgs co ON co.bank_account_id = b.bank_account_id
),
-- Cada extrato vira 7 linhas (uma por dia da janela ±3) por org: o join abaixo é por
-- IGUALDADE de (org, direção, data), que o hash join resolve sem varrer todos os pares.
bank_window AS (
  SELECT b.*, bo.organization_id AS match_org, b.transaction_date + k AS match_date
  FROM bank_pending b
  JOIN bank_orgs bo ON bo.bank_id = b.id
  CROSS JOIN generate_series(-3, 3) AS k
),
mismatch AS (
  SELECT DISTINCT ON (b.id)
         b.id AS bank_id, i.id AS internal_id, b.amount AS bank_amount, i.amount AS internal_amount,
         b.amount - i.amount AS difference, b.transaction_date AS bank_date, i.transaction_date AS internal_date,
         b.description AS bank_description, i.description AS internal_description, b.direction, b.account_name
  FROM bank_window b
  JOIN internal_candidates i
    ON i.organization_id = b.match_org   -- org do extrato, ou org que a conta atende
   AND i.direction = b.direction
   AND i.transaction_date = b.match_date
   AND abs(b.amount - i.amount) > 0
   AND abs(b.amount - i.amount) <= p_value_tolerance
  -- `i.id` desempata (+50 × −50 do mesmo extrato): antes a escolha era arbitrária e
  -- mudava de uma chamada para outra.
  ORDER BY b.id, abs(b.amount - i.amount) ASC, i.id
)
SELECT jsonb_build_object(
  'as_of', p_as_of,
  'counts', jsonb_build_object(
      'bank_without_internal', (SELECT COUNT(*) FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)),
      'internal_without_bank', (SELECT COUNT(*) FROM internal_pending i WHERE COALESCE(i.due_date, i.transaction_date) <= p_as_of - p_aging_days),
      'value_mismatch',        (SELECT COUNT(*) FROM mismatch)
  ),
  'bank_without_internal', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.transaction_date DESC) FROM (
        SELECT b.id, b.bank_account_id, b.account_name, b.transaction_date, b.amount, b.direction, b.description, b.category
        FROM bank_pending b WHERE NOT EXISTS (SELECT 1 FROM mismatch x WHERE x.bank_id = b.id)
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
$function$;

-- REGRA #7: mesma ACL de aplicar_20270919000015 (sem PUBLIC, sem anon).
REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_divergences(uuid, date, integer, numeric, integer) TO authenticated;
