-- ============================================================
-- Parcela de contrato ganha os mesmos campos da parcela do plano de pagamento.
--
-- A aba Parcelas da negociação mostra duas séries — o plano do negócio
-- (custom_installments, no JSONB do projeto) e as parcelas do contrato
-- (internal_transactions). As duas tabelas têm as MESMAS colunas na tela, mas
-- Desconto, Tipo e Forma de pagamento só existiam no lado do plano: na série do
-- contrato apareciam como "—" porque não havia onde guardar.
--
-- Colunas nullable, sem default e sem FK → alteração metadata-only.
-- `internal_transactions` é tabela quente (Contas a Receber/Pagar, conciliação),
-- por isso o lock_timeout curto.
-- ============================================================

SET lock_timeout = '3s';

ALTER TABLE public.internal_transactions
    -- Valor BRUTO da parcela. `amount` continua sendo o valor efetivamente
    -- cobrado (líquido); sem esta coluna não há como exibir "Valor" e
    -- "Valor final" separados, como o plano de pagamento faz.
    ADD COLUMN IF NOT EXISTS original_amount  numeric(15,2),
    ADD COLUMN IF NOT EXISTS discount_type    text,
    ADD COLUMN IF NOT EXISTS discount_amount  numeric(15,2),
    -- Periodicidade da parcela (MENSAL, SEMESTRAL, AVULSA…) — mesmo vocabulário
    -- de payment_types usado no plano.
    ADD COLUMN IF NOT EXISTS installment_type text,
    -- PIX, TED, DOC, DINHEIRO, CHEQUE, PERMUTA.
    ADD COLUMN IF NOT EXISTS payment_type     text;

ALTER TABLE public.internal_transactions
    DROP CONSTRAINT IF EXISTS internal_tx_discount_type_check;
ALTER TABLE public.internal_transactions
    ADD CONSTRAINT internal_tx_discount_type_check
    CHECK (discount_type IS NULL OR discount_type IN ('VALUE', 'PERCENT'));

COMMENT ON COLUMN public.internal_transactions.original_amount IS
 'Valor bruto da parcela, antes do desconto. `amount` é o líquido — o que de fato será cobrado.';
COMMENT ON COLUMN public.internal_transactions.discount_type IS
 'VALUE = desconto em R$; PERCENT = em %. Mesma semântica do plano de pagamento da negociação.';

RESET lock_timeout;
