-- ==========================================================================
-- A volta da baixa também chega ao boleto (estorno)
-- Date: 2026-08-15
-- Substitui a função de 20270909000001 (que só tratava a ida).
-- ==========================================================================
-- CONTEXTO
-- `20270909000001` fez a IDA: título baixado -> boleto 'pago'. Faltava a VOLTA.
--
-- A tela de Conciliação Bancária já desfazia certo — `handleUndoMatch`
-- (`components/BankReconciliation.tsx`) devolve `status='PENDING'`,
-- `payment_date=NULL` e reverte boleto+invoice para 'aprovado'/'approved'.
-- Mas desmarcar "Pago" pelo **Contas a Pagar** (`payableService.updateStatus`)
-- não revertia o boleto: ele ficava 'pago' com o título reaberto.
--
-- Mesmo argumento das anteriores: o estorno nasce de mais de uma tela, então a
-- volta mora no banco, não em cada chamador.
--
-- SEM RISCO DE RECURSÃO: escreve em `boletos`/`invoices`, nunca de volta em
-- `internal_transactions`.
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
    v_baixado    boolean;
BEGIN
    -- `reference_id` é TEXT e, em outras origens, é COMPOSTO
    -- ('{origem}-p{vencimento}'). Para source_system='BOLETO' é o uuid puro,
    -- mas o cast só acontece se o formato bater.
    IF NEW.reference_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RETURN NEW;
    END IF;

    v_boleto_id := NEW.reference_id::uuid;
    v_baixado   := (NEW.status = 'CONCILIATED' OR NEW.business_status = 'PAGO');

    IF v_baixado THEN
        -- IDA. 'cancelado' é terminal: boleto cancelado não vira pago.
        UPDATE public.boletos
           SET status = 'pago'
         WHERE id = v_boleto_id
           AND status NOT IN ('pago', 'cancelado')
        RETURNING invoice_id INTO v_invoice_id;

        IF v_invoice_id IS NOT NULL THEN
            UPDATE public.invoices
               SET status = 'paid'
             WHERE id = v_invoice_id
               AND status <> 'paid';
        END IF;
    ELSE
        -- VOLTA. Só desfaz o que ESTA regra tinha feito: boleto em 'pago'
        -- retorna a 'aprovado'. Não encosta em 'cancelado', 'rascunho' nem
        -- 'revisao' — estorno de título não é o dono desses estados.
        UPDATE public.boletos
           SET status = 'aprovado'
         WHERE id = v_boleto_id
           AND status = 'pago'
        RETURNING invoice_id INTO v_invoice_id;

        IF v_invoice_id IS NOT NULL THEN
            UPDATE public.invoices
               SET status = 'approved'
             WHERE id = v_invoice_id
               AND status = 'paid';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_boleto_baixa() IS
'Propaga baixa E estorno de um titulo (internal_transactions) para boletos/invoices. Ver 20270909000003.';

DROP TRIGGER IF EXISTS trg_sync_boleto_baixa ON public.internal_transactions;

-- A condição WHEN não pode mais exigir "está baixado": precisa disparar também
-- na TRANSIÇÃO DE VOLTA. O filtro agora é só "é boleto e um dos dois campos de
-- baixa mudou" — a função decide a direção.
CREATE TRIGGER trg_sync_boleto_baixa
AFTER UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    NEW.source_system = 'BOLETO'
    AND NEW.reference_id IS NOT NULL
    AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.business_status IS DISTINCT FROM NEW.business_status
    )
)
EXECUTE FUNCTION public.fn_sync_boleto_baixa();

NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. A trigger existe e a função fala em estorno:
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_boleto_baixa';
-- SELECT obj_description('public.fn_sync_boleto_baixa()'::regprocedure);
--
-- 2. Divergências nos DOIS sentidos (esperado: zero linhas):
-- SELECT b.id, b.status AS boleto, it.status AS titulo, it.business_status
--   FROM public.boletos b
--   JOIN public.internal_transactions it
--     ON it.source_system = 'BOLETO' AND it.reference_id = b.id::text
--  WHERE (it.status = 'CONCILIATED' AND b.status NOT IN ('pago','cancelado'))
--     OR (it.status <> 'CONCILIATED' AND COALESCE(it.business_status,'') <> 'PAGO'
--         AND b.status = 'pago');
-- ==========================================================================
