-- ════════════════════════════════════════════════════════════════════════════
-- Contrato: valor das parcelas FIXO ou VARIÁVEL (por medição).
-- Plano: docs/planos/2026-10-17-contrato-valor-fixo-ou-por-medicao.md (item 1).
--
-- 1. contracts.installment_value_mode ('FIXO' padrão | 'VARIAVEL'). Vale para contrato
--    recorrente: a parcela nasce com o valor ESTIMADO e o valor real entra na baixa ou
--    na conciliação (o que saiu do banco).
-- 2. valor_variavel(internal_transactions): campo computado (PostgREST o expõe como
--    coluna, igual a valor_esperado). true = parcela CONTRACT_RECURRING de contrato
--    VARIAVEL. Toda CONTRACT_RECURRING tem contract_id (384 de 384 em 17/10/2026).
-- 3. fn_reconcile_group: ADJUST_VALUE passa para parcela variável. Corpo copiado de
--    aplicar_20271011007000 (conferido igual ao banco em 17/10/2026); só muda a checagem
--    de c_origens_sync no ramo ADJUST_VALUE. PARTIAL continua bloqueado.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS installment_value_mode text NOT NULL DEFAULT 'FIXO';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_installment_value_mode_check') THEN
        ALTER TABLE public.contracts
            ADD CONSTRAINT contracts_installment_value_mode_check
            CHECK (installment_value_mode IN ('FIXO', 'VARIAVEL'));
    END IF;
END $$;

COMMENT ON COLUMN public.contracts.installment_value_mode IS
    'FIXO: toda parcela vale o valor do contrato. VARIAVEL (por medição): o valor do contrato é estimativa; a baixa/conciliação grava o valor real da parcela.';

CREATE OR REPLACE FUNCTION public.valor_variavel(it public.internal_transactions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT it.source_system = 'CONTRACT_RECURRING'
       AND it.contract_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.contracts c
                    WHERE c.id = it.contract_id AND c.installment_value_mode = 'VARIAVEL');
$function$;

-- SECURITY INVOKER (padrão): o EXISTS em contracts passa pela RLS de quem chama.
REVOKE EXECUTE ON FUNCTION public.valor_variavel(public.internal_transactions) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.valor_variavel(public.internal_transactions) TO authenticated, service_role;

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
        -- Exceção (17/10/2026): parcela de contrato com valor VARIÁVEL (por medição).
        -- O valor real é o que saiu do banco, e a sincronização do contrato não regrava
        -- parcela baixada (contractService, mesmo plano).
        IF v_first.source_system = ANY(c_origens_sync) AND NOT public.valor_variavel(v_first) THEN
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

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_group(uuid[], uuid[], text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_group(uuid[], uuid[], text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
