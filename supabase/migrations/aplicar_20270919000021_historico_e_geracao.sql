-- ==========================================================================
-- Modo "extrato histórico" e geração de lançamentos a partir do extrato
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 2.5)
-- ==========================================================================
-- O PROBLEMA DE PRODUTO
-- A tela foi desenhada para casar extrato com título, mas está sendo usada para
-- CLASSIFICAR extrato antigo. O extrato importado começa em 2019; os títulos
-- internos pendentes se concentram de 2025 em diante. Para milhares de linhas do
-- Itaú e do Sicredi antigo não existe, e nunca existirá, título para casar.
--
-- Consequência: a aba Pendentes nunca esvazia, e o Dashboard reporta 98,8% do
-- extrato como "pendente" — como se fosse trabalho por fazer, quando na verdade
-- aquele período já foi tratado. O número mente sobre o esforço restante.
--
-- Duas peças resolvem:
--   1. `reconciliation_historic_until` marca até quando aquela conta é histórico.
--      Antes dessa data, "classificado" é o estado final: o KPI passa a medir
--      classificação, não casamento.
--   2. `fn_generate_internal_from_bank` transforma extrato classificado em
--      lançamento de verdade, já conciliado. É o que permite DRE retroativa: sem
--      isso a classificação fica presa no extrato e não vira contabilidade.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS reconciliation_historic_until DATE;

COMMENT ON COLUMN public.payment_accounts.reconciliation_historic_until IS
  'Até esta data o extrato desta conta é histórico: classificar é o estado final, não há título a casar. Nulo = a conta inteira é corrente.';

-- ──────────────────────────────────────────────────────────────────────────
-- fn_generate_internal_from_bank — extrato classificado vira lançamento
-- ──────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS e a trava de período fechado continuam valendo. Tudo numa
-- transação: ou o lançamento nasce vinculado ao movimento, ou nada acontece.
--
-- Recusa movimento SEM CATEGORIA de propósito. Gerar lançamento "Geral" em massa
-- só transfere o problema de classificação do extrato para a contabilidade.
CREATE OR REPLACE FUNCTION public.fn_generate_internal_from_bank(p_bank_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    b            public.bank_transactions%ROWTYPE;
    v_internal   uuid;
    v_gerados    int := 0;
    v_sem_cat    int := 0;
    v_ja_feitos  int := 0;
    v_ignorados  int := 0;
BEGIN
    FOR b IN
        SELECT * FROM public.bank_transactions
         WHERE id = ANY(p_bank_ids)
         ORDER BY transaction_date, id
         FOR UPDATE
    LOOP
        IF b.status IN ('MATCHED', 'TRANSFER') THEN
            v_ja_feitos := v_ja_feitos + 1;
            CONTINUE;
        END IF;
        IF b.status = 'IGNORED' THEN
            v_ignorados := v_ignorados + 1;
            CONTINUE;
        END IF;
        IF COALESCE(b.category, '') = '' THEN
            v_sem_cat := v_sem_cat + 1;
            CONTINUE;
        END IF;

        INSERT INTO public.internal_transactions
            (organization_id, source_system, reference_id, transaction_date, due_date,
             amount, direction, description, category, status, payment_date,
             project_id, cost_center_id, party_name, entity_name)
        VALUES
            (b.organization_id, 'MANUAL', 'bank-' || b.id::text, b.transaction_date, b.transaction_date,
             b.amount, b.direction,
             COALESCE(NULLIF(btrim(b.counterparty_name), ''), NULLIF(btrim(b.description_normalized), ''),
                      NULLIF(btrim(b.description_raw), ''), 'Lançamento gerado do extrato'),
             b.category, 'CONCILIATED', b.transaction_date,
             b.project_id, b.cost_center_id, b.counterparty_name, b.counterparty_name)
        RETURNING id INTO v_internal;

        INSERT INTO public.reconciliation_matches
            (bank_transaction_id, internal_transaction_id, match_type, confidence_score, created_by)
        VALUES (b.id, v_internal, 'MANUAL', 100, auth.uid());

        UPDATE public.bank_transactions SET status = 'MATCHED' WHERE id = b.id;

        v_gerados := v_gerados + 1;
    END LOOP;

    IF v_gerados > 0 THEN
        INSERT INTO public.reconciliation_audit_log (organization_id, user_id, event_type, target_id, payload)
        VALUES ((SELECT organization_id FROM public.bank_transactions WHERE id = p_bank_ids[1]),
                auth.uid(), 'MANUAL_CREATE', p_bank_ids[1],
                jsonb_build_object('action', 'GENERATE_FROM_BANK', 'gerados', v_gerados,
                                   'sem_categoria', v_sem_cat, 'ja_conciliados', v_ja_feitos));
    END IF;

    RETURN jsonb_build_object(
        'gerados', v_gerados,
        'sem_categoria', v_sem_cat,
        'ja_conciliados', v_ja_feitos,
        'ignorados', v_ignorados
    );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_internal_from_bank(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_generate_internal_from_bank(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_generate_internal_from_bank(uuid[]) IS
  'Transforma movimentos de extrato JÁ CLASSIFICADOS em lançamentos internos conciliados. Recusa quem não tem categoria: gerar "Geral" em massa só muda o problema de lugar.';

-- ──────────────────────────────────────────────────────────────────────────
-- KPI separado: histórico mede CLASSIFICAÇÃO, corrente mede CONCILIAÇÃO
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconciliation_progress(p_bank_account_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
WITH conta AS (
  SELECT pa.id, pa.reconciliation_historic_until AS corte
    FROM public.payment_accounts pa WHERE pa.id = p_bank_account_id
),
tx AS (
  SELECT bt.status, bt.category,
         (c.corte IS NOT NULL AND bt.transaction_date <= c.corte) AS eh_historico
    FROM public.bank_transactions bt, conta c
   WHERE bt.bank_account_id = p_bank_account_id AND bt.status <> 'IGNORED'
)
SELECT jsonb_build_object(
  'historic_until', (SELECT corte FROM conta),
  'historico', jsonb_build_object(
      'total',        count(*) FILTER (WHERE eh_historico),
      'classificado', count(*) FILTER (WHERE eh_historico AND COALESCE(category,'') <> ''),
      'pendente',     count(*) FILTER (WHERE eh_historico AND COALESCE(category,'') = '')),
  'corrente', jsonb_build_object(
      'total',      count(*) FILTER (WHERE NOT eh_historico),
      'conciliado', count(*) FILTER (WHERE NOT eh_historico AND status IN ('MATCHED','CONFIRMED','LOCKED','TRANSFER')),
      'pendente',   count(*) FILTER (WHERE NOT eh_historico AND status IN ('IMPORTED','NORMALIZED','RULE_APPLIED')))
) FROM tx;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliation_progress(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliation_progress(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_reconciliation_progress(uuid) IS
  'Progresso separado: no histórico o alvo é classificar, no corrente é conciliar. Um número só faria o histórico parecer trabalho pendente para sempre.';
