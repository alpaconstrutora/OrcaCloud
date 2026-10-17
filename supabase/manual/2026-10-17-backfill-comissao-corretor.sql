-- =====================================================================
-- Backfill: títulos de comissão do corretor dos negócios JÁ existentes.
--
-- Pedido do usuário (17/10/2026): "Crie de todas" — inclusive parcelas de
-- aluguel antigas (2016–2019), que entram vencidas; o usuário baixa no
-- Contas a Pagar as que já foram pagas por fora. Processos "Título a pagar
-- vencido" abrem normalmente (decisão do usuário).
--
-- Depende de: supabase/migrations/20271017600000_comissao_locacao_por_parcela.sql
-- Plano: docs/planos/2026-10-17-comissao-corretor-portal.md (Fase 2)
--
-- Reversão (NUNCA delete — passa pelas travas de competência e recibos):
--   UPDATE public.internal_transactions
--      SET status = 'CANCELLED', business_status = 'CANCELADO_AUTO', updated_at = now()
--    WHERE id IN (SELECT transaction_id FROM public.comissao_corretor_backfill_20261017)
--      AND status = 'PENDING';
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.comissao_corretor_backfill_20261017 (
    transaction_id uuid PRIMARY KEY,
    reference_id   text NOT NULL,
    deal_id        uuid,
    amount         numeric,
    criado_em      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissao_corretor_backfill_20261017 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comissao_corretor_backfill_20261017 FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.comissao_corretor_backfill_20261017 IS
'Títulos de comissão criados pelo backfill de 17/10/2026. NÃO APAGAR. Reversão: UPDATE internal_transactions SET status=''CANCELLED'', business_status=''CANCELADO_AUTO'', updated_at=now() WHERE id IN (SELECT transaction_id FROM public.comissao_corretor_backfill_20261017) AND status=''PENDING'';';

DO $$
DECLARE
    r   record;
    v   text;
BEGIN
    FOR r IN
        SELECT d.id
          FROM public.commercial_deals d
         WHERE d.broker_id IS NOT NULL
           -- comissão legada no formato antigo = já tratada por outro caminho
           AND NOT EXISTS (SELECT 1 FROM public.internal_transactions it
                            WHERE it.reference_id IN ('commission-' || d.id::text, 'tx-comm-' || d.id::text))
         ORDER BY d.id
    LOOP
        BEGIN
            v := public.fn_comissao_corretor_sincronizar(r.id);
            RAISE NOTICE 'backfill % → %', r.id, v;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public.comissao_corretor_pendencias (deal_id, parcela_ref, erro)
            VALUES (r.id, 'backfill-20261017', SQLSTATE || ' ' || SQLERRM);
        END;
    END LOOP;

    INSERT INTO public.comissao_corretor_backfill_20261017 (transaction_id, reference_id, deal_id, amount)
    SELECT it.id, it.reference_id, substring(it.reference_id from 5 for 36)::uuid, it.amount
      FROM public.internal_transactions it
     WHERE it.reference_id LIKE 'brk-%'
    ON CONFLICT (transaction_id) DO NOTHING;
END $$;

SELECT jsonb_build_object(
    'por_negocio', (SELECT jsonb_agg(x ORDER BY x->>'contrato') FROM (
        SELECT jsonb_build_object(
                   'contrato', COALESCE((SELECT c.number FROM public.contracts c WHERE c.deal_id = b.deal_id ORDER BY c.created_at LIMIT 1),
                                        (SELECT COALESCE(d.contract_number, d.code) FROM public.commercial_deals d WHERE d.id = b.deal_id)),
                   'titulos', count(*),
                   'soma', sum(b.amount),
                   'vencidos', count(*) FILTER (WHERE it.due_date < current_date)) AS x
          FROM public.comissao_corretor_backfill_20261017 b
          JOIN public.internal_transactions it ON it.id = b.transaction_id
         GROUP BY b.deal_id) s),
    'total', (SELECT count(*) FROM public.comissao_corretor_backfill_20261017),
    'pendencias', (SELECT jsonb_agg(erro) FROM public.comissao_corretor_pendencias WHERE parcela_ref = 'backfill-20261017')
) AS resultado;
