-- ==========================================================================
-- Baixa do título volta para o boleto (caminho de volta)
-- Date: 2026-08-15
-- ==========================================================================
-- CONTEXTO
-- `boletoService.marcarPago` faz o caminho de ida: boleto -> pago -> atualiza a
-- internal_transaction e a invoice. Mas o caminho de VOLTA não existia: dar
-- baixa pelo Contas a Pagar (payableService.updateStatus), pela Conciliação
-- Bancária (bankReconciliationService) ou pela resolução de Divergência
-- (divergenceService) deixava o boleto parado em 'aprovado' para sempre. As
-- duas telas divergiam conforme por onde o usuário tivesse fechado.
--
-- POR QUE TRIGGER, E NÃO CÓDIGO DE APLICAÇÃO
-- A baixa nasce de três telas diferentes (e o defeito irmão desta migration,
-- 20270909000000, mostrou que são CINCO os produtores que gravam CONCILIATED).
-- Consertar em cada chamador é exatamente o que fez o bug existir. O banco é o
-- único ponto por onde todos passam. Precedente no projeto:
-- `trg_strip_system_project_from_internal_tx` (20270819000003).
--
-- SEM RISCO DE RECURSÃO: a trigger escreve em `boletos` e `invoices`, nunca de
-- volta em `internal_transactions`.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_sync_boleto_baixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_boleto_id  uuid;
    v_invoice_id uuid;
BEGIN
    -- `reference_id` é TEXT e, em outras origens, é COMPOSTO
    -- ('{origem}-p{vencimento}'). Para source_system='BOLETO' ele é o uuid puro
    -- do boleto, mas o cast só acontece se o formato bater — um reference_id
    -- fora do padrão não pode derrubar a baixa do título.
    IF NEW.reference_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RETURN NEW;
    END IF;

    v_boleto_id := NEW.reference_id::uuid;

    -- 'cancelado' é terminal: um boleto cancelado não vira pago por baixa de
    -- título. 'pago' já está no destino — não reescreve para não disparar
    -- updated_at à toa.
    UPDATE public.boletos
       SET status = 'pago'
     WHERE id = v_boleto_id
       AND status NOT IN ('pago', 'cancelado')
    RETURNING invoice_id INTO v_invoice_id;

    -- A invoice espelha o boleto (criada por boletoService.aprovarECriarInvoice).
    IF v_invoice_id IS NOT NULL THEN
        UPDATE public.invoices
           SET status = 'paid'
         WHERE id = v_invoice_id
           AND status <> 'paid';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_boleto_baixa() IS
'Propaga a baixa de um titulo (internal_transactions) de volta para boletos/invoices. Ver 20270909000001.';

DROP TRIGGER IF EXISTS trg_sync_boleto_baixa ON public.internal_transactions;

-- AFTER UPDATE: a baixa já está gravada quando a trigger roda.
-- A condição WHEN faz o filtro no próprio índice do Postgres — a função só é
-- chamada para linha de boleto que ACABOU de ser baixada, não a cada update.
CREATE TRIGGER trg_sync_boleto_baixa
AFTER UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    NEW.source_system = 'BOLETO'
    AND NEW.reference_id IS NOT NULL
    AND (NEW.status = 'CONCILIATED' OR NEW.business_status = 'PAGO')
    AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.business_status IS DISTINCT FROM NEW.business_status
    )
)
EXECUTE FUNCTION public.fn_sync_boleto_baixa();

NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. A trigger existe:
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_boleto_baixa';
--
-- 2. Divergências ANTES de qualquer baixa nova (boleto aprovado, título pago):
-- SELECT b.id, b.status AS boleto, it.status AS titulo
--   FROM public.boletos b
--   JOIN public.internal_transactions it
--     ON it.source_system = 'BOLETO' AND it.reference_id = b.id::text
--  WHERE it.status = 'CONCILIATED' AND b.status <> 'pago';
--    -> estas são as divergências HERDADAS; a trigger só age em updates
--       futuros. Se a lista importar, rode o backfill do bloco 3.
--
-- 3. Backfill das divergências herdadas (rodar CONFERINDO o bloco 2 antes).
--    ⚠️ CORRIGIDO em 15/08/2026, depois desta migration já ter sido aplicada:
--    a primeira versão mexia SÓ em `boletos` e esquecia as `invoices`, o que
--    deixaria a aba Notas Fiscais divergindo da tela de Boletos. Só o bloco
--    comentado mudou — o DDL acima é o que rodou, e não foi tocado.
--
-- UPDATE public.boletos b
--    SET status = 'pago'
--   FROM public.internal_transactions it
--  WHERE it.source_system = 'BOLETO'
--    AND it.reference_id = b.id::text
--    AND it.status = 'CONCILIATED'
--    AND b.status NOT IN ('pago','cancelado');
--
-- UPDATE public.invoices i
--    SET status = 'paid'
--   FROM public.boletos b
--  WHERE b.invoice_id = i.id
--    AND b.status = 'pago'
--    AND i.status <> 'paid';
-- ==========================================================================
