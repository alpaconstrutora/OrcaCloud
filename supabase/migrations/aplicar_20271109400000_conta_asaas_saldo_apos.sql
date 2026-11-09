-- Financeiro › Conta Asaas — saldo após cada movimento do extrato
--
-- Plano: docs/planos/2026-11-09-conta-asaas-tela-financeiro.md (PR 1)
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
-- Aplicar ANTES de publicar a Edge Function asaas-conta (ela passa a gravar a coluna).
--
-- A Asaas manda em cada linha de /financialTransactions o `balance` — saldo da
-- conta logo depois daquele movimento. Era descartado; a tela da Conta Asaas
-- mostra o saldo linha a linha a partir dele. Nula para extrato de OFX/planilha.
-- REGRA #7: nenhuma policy nem função criada; a coluna herda as policies da tabela.

ALTER TABLE public.bank_transactions
    ADD COLUMN IF NOT EXISTS saldo_apos numeric(14,2);

COMMENT ON COLUMN public.bank_transactions.saldo_apos IS
    'Saldo da conta logo após o movimento, como o banco/gateway informa (hoje só a Asaas: balance de /financialTransactions). Nulo quando a origem não informa.';
