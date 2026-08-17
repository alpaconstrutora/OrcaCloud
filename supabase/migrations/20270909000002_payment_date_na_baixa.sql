-- ==========================================================================
-- payment_date nasce junto com a baixa
-- Date: 2026-08-15
-- ==========================================================================
-- CONTEXTO
-- Oito lugares gravam status='CONCILIATED' em internal_transactions. SÓ DOIS
-- preenchem payment_date:
--
--   bankReconciliationService.ts:727  ✅
--   boletoService.ts:520              ✅
--   divergenceService.ts:167          ❌
--   financialService.ts:81            ❌
--   financialSyncService.ts:80,105    ❌
--   payableService.ts:66              ❌   <- "Marcar como pago" do Contas a Pagar
--   receivableService.ts:58           ❌
--   taxPayableService.ts:302          ❌
--
-- O pior é o payableService: virou o caminho PRINCIPAL de baixa depois de
-- 20270909000000, e é um dos que não gravam a data. Resultado encontrado em
-- produção: título liquidado, sem data de pagamento — qualquer relatório por
-- data de pagamento perde a linha.
--
-- POR QUE TRIGGER
-- Mesmo formato de 20270909000000 e 20270909000001: muitos produtores, e a
-- correção certa é no ponto por onde todos passam. Consertar seis chamadores é
-- o que faz o sétimo nascer errado.
--
-- SÓ PREENCHE QUANDO ESTÁ VAZIO. Quem sabe a data certa (a conciliação
-- bancária sabe: é a data do extrato) continua mandando, e a trigger não
-- encosta. Isto é uma rede de segurança, não uma política de datas.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_payment_date_na_baixa()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- BEFORE UPDATE: mexe em NEW antes de gravar, sem um segundo UPDATE.
    IF NEW.payment_date IS NULL THEN
        NEW.payment_date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_payment_date_na_baixa() IS
'Preenche payment_date na baixa quando o produtor nao mandou. Ver 20270909000002.';

DROP TRIGGER IF EXISTS trg_payment_date_na_baixa ON public.internal_transactions;

-- A condição WHEN cobre as duas formas de dar baixa no sistema: `status`
-- (CONCILIATED) e `business_status` (PAGO no lado DEBIT, RECEBIDO no CREDIT).
-- O `IS DISTINCT FROM` garante que a trigger só roda na TRANSIÇÃO — um update
-- qualquer numa linha que já estava conciliada não mexe na data original.
CREATE TRIGGER trg_payment_date_na_baixa
BEFORE UPDATE ON public.internal_transactions
FOR EACH ROW
WHEN (
    NEW.payment_date IS NULL
    AND (
        (NEW.status = 'CONCILIATED' AND OLD.status IS DISTINCT FROM NEW.status)
        OR (NEW.business_status IN ('PAGO','RECEBIDO')
            AND OLD.business_status IS DISTINCT FROM NEW.business_status)
    )
)
EXECUTE FUNCTION public.fn_payment_date_na_baixa();

NOTIFY pgrst, 'reload schema';

-- ── Conferência ──────────────────────────────────────────────────────────────
-- 1. A trigger existe:
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_payment_date_na_baixa';
--
-- 2. Quantos títulos liquidados ainda estão sem data (o passivo herdado):
-- SELECT direction, count(*) FROM public.internal_transactions
--  WHERE (status = 'CONCILIATED' OR business_status IN ('PAGO','RECEBIDO'))
--    AND payment_date IS NULL
--  GROUP BY 1;
--
-- 3. Daqui pra frente, nenhuma baixa NOVA pode aparecer nessa lista. Rodar a
--    query 2 de novo depois de dar uma baixa pela tela de Contas a Pagar.
--
-- ── Backfill dos herdados: PROPOSITALMENTE NÃO ESCRITO ───────────────────────
-- Não existe de onde tirar a data real desses registros. `updated_at` é
-- aproximação, não fato — e uma data de pagamento inventada é PIOR que o nulo,
-- porque o nulo é honesto sobre não saber, e a aproximação entra em relatório
-- financeiro como se fosse verdade. Se a decisão for aceitar a aproximação, ela
-- é do usuário e deve ser registrada:
--
-- UPDATE public.internal_transactions
--    SET payment_date = updated_at::date   -- APROXIMAÇÃO, não a data real
--  WHERE (status = 'CONCILIATED' OR business_status IN ('PAGO','RECEBIDO'))
--    AND payment_date IS NULL;
-- ==========================================================================
