-- =====================================================================
-- Apaga 4 títulos de comissão de corretor no formato ANTIGO
-- ('commission-{deal}' / 'tx-comm-{deal}', R$ 90.000 PENDING) cujos
-- negócios já foram APAGADOS — órfãos no Contas a Pagar.
--
-- Pedido do usuário (17/10/2026): "apagar tambem".
-- Plano: docs/planos/2026-10-17-comissao-corretor-portal.md (Fase 3)
--
-- Conferido antes (17/10): nenhum vínculo em conciliação, processos, cobrança,
-- recibos, rateios ou parcelas-filhas; todos PENDING/RASCUNHO.
--
-- Cópia integral em public.comissoes_orfas_apagadas_20261017 (NÃO apagar).
-- Restaurar:
--   INSERT INTO public.internal_transactions
--   SELECT (jsonb_populate_record(NULL::public.internal_transactions, linha)).*
--     FROM public.comissoes_orfas_apagadas_20261017;
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.comissoes_orfas_apagadas_20261017 (
    id          uuid PRIMARY KEY,
    linha       jsonb NOT NULL,
    apagado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissoes_orfas_apagadas_20261017 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissoes_orfas_apagadas_20261017 FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.comissoes_orfas_apagadas_20261017 IS
'Cópia integral dos 4 títulos de comissão órfãos apagados em 17/10/2026. NÃO APAGAR. Restaurar: INSERT INTO public.internal_transactions SELECT (jsonb_populate_record(NULL::public.internal_transactions, linha)).* FROM public.comissoes_orfas_apagadas_20261017;';

DO $$
DECLARE
    c_ids CONSTANT uuid[] := ARRAY[
        'f1595893-2df5-4dcb-8d9e-6071873f5e12',  -- commission-f492effe… R$ 25.000
        '5a200bd5-137a-4805-93d8-8fc402b1af52',  -- tx-comm-f492effe…    R$ 25.000
        '7d265f9e-f763-4477-94ad-09f183510557',  -- tx-comm-6c58d41a…    R$ 10.000
        '0e103a27-0126-4656-a525-e7baa9d5d625'   -- tx-comm-69908347…    R$ 30.000
    ]::uuid[];
    v_n int;
BEGIN
    -- Travas: só o que foi conferido — pendente, negócio inexistente, sem conciliação.
    SELECT count(*) INTO v_n
      FROM public.internal_transactions t
     WHERE t.id = ANY (c_ids)
       AND t.status = 'PENDING'
       AND (t.reference_id LIKE 'commission-%' OR t.reference_id LIKE 'tx-comm-%')
       AND NOT EXISTS (SELECT 1 FROM public.commercial_deals d WHERE t.reference_id LIKE '%' || d.id::text)
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = t.id);
    IF v_n <> 4 THEN
        RAISE EXCEPTION 'Esperava 4 títulos órfãos pendentes, achei % — nada apagado.', v_n;
    END IF;

    INSERT INTO public.comissoes_orfas_apagadas_20261017 (id, linha)
    SELECT t.id, to_jsonb(t) FROM public.internal_transactions t WHERE t.id = ANY (c_ids)
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM public.internal_transactions WHERE id = ANY (c_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 4 THEN
        RAISE EXCEPTION 'Apagaria % títulos em vez de 4 — desfeito.', v_n;
    END IF;
END $$;

SELECT jsonb_build_object(
    'copia', (SELECT count(*) FROM public.comissoes_orfas_apagadas_20261017),
    'restantes', (SELECT count(*) FROM public.internal_transactions
                   WHERE reference_id LIKE 'commission-%' OR reference_id LIKE 'tx-comm-%')
) AS resultado;
