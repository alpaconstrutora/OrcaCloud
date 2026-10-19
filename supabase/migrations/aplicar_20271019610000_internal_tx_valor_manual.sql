-- Parcela de contrato com VALOR ALTERADO À MÃO (Suprimentos › Contratos › Financeiro › Parcelas).
-- Plano: docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md
--
-- Os syncs do contrato (services/contractService.ts) refazem as parcelas a partir do
-- valor/cronograma do contrato. Sem uma marca na linha, o valor digitado pelo usuário
-- voltava ao do contrato no próximo "Salvar" dos Dados Gerais, "Lançar Financeiro" ou
-- reajuste. Com a marca, o sync preserva o valor (utils/contratoParcelaVariavel.ts ›
-- aplicarParcelasPreservadas) e a tela identifica a parcela como alterada.
--
-- Só colunas: nenhuma função nem policy (REGRA #7 não se aplica). Idempotente.

ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS valor_manual boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS valor_manual_anterior numeric,
    ADD COLUMN IF NOT EXISTS valor_manual_em timestamptz,
    ADD COLUMN IF NOT EXISTS valor_manual_por uuid;

COMMENT ON COLUMN public.internal_transactions.valor_manual IS
    'Valor (amount) alterado à mão na parcela. Os syncs do contrato preservam o valor desta linha em vez de regravá-lo com o do contrato.';
COMMENT ON COLUMN public.internal_transactions.valor_manual_anterior IS
    'Valor da parcela ANTES da primeira alteração manual (o que o contrato tinha gerado). Não muda nas alterações seguintes.';
COMMENT ON COLUMN public.internal_transactions.valor_manual_em IS
    'Quando o valor foi alterado à mão pela última vez.';
COMMENT ON COLUMN public.internal_transactions.valor_manual_por IS
    'auth.uid() de quem alterou o valor à mão pela última vez.';
