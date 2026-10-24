-- Parcela de contrato com VENCIMENTO ALTERADO À MÃO (Suprimentos › Contratos › Financeiro › Parcelas).
-- Plano: docs/planos/2026-10-24-contrato-alterar-vencimento-da-parcela.md
--
-- Mesmo desenho do valor alterado à mão (aplicar_20271019610000_internal_tx_valor_manual):
-- os syncs do contrato (services/contractService.ts) refazem as parcelas a partir do
-- cronograma/cadência do contrato e regravariam a data digitada pelo usuário no próximo
-- "Salvar" dos Dados Gerais ou "Lançar Financeiro". Com a marca, o sync preserva a data
-- desta linha (utils/contratoParcelaVariavel.ts › planejarSyncParcelas) e a tela
-- identifica a parcela como alterada.
--
-- Só colunas: nenhuma função nem policy (REGRA #7 não se aplica). Idempotente.

ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS vencimento_manual boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vencimento_manual_anterior date,
    ADD COLUMN IF NOT EXISTS vencimento_manual_em timestamptz,
    ADD COLUMN IF NOT EXISTS vencimento_manual_por uuid;

COMMENT ON COLUMN public.internal_transactions.vencimento_manual IS
    'Vencimento (due_date/transaction_date) alterado à mão na parcela. Os syncs do contrato preservam a data desta linha em vez de regravá-la com a do contrato.';
COMMENT ON COLUMN public.internal_transactions.vencimento_manual_anterior IS
    'Vencimento da parcela ANTES da primeira alteração manual (o que o contrato tinha gerado). Não muda nas alterações seguintes.';
COMMENT ON COLUMN public.internal_transactions.vencimento_manual_em IS
    'Quando o vencimento foi alterado à mão pela última vez.';
COMMENT ON COLUMN public.internal_transactions.vencimento_manual_por IS
    'auth.uid() de quem alterou o vencimento à mão pela última vez.';
