-- Plano de Pagamento (Gerenciar Negociação) sumia ao sair e voltar quando o
-- negócio ainda estava em IN_NEGOTIATION (Proposta): custom_installments nunca
-- foi coluna de commercial_deals, e a única persistência era via
-- commercialFinanceService.syncDealToFinance, gateado por FINANCIAL_STATUSES
-- (que exclui IN_NEGOTIATION de propósito — não pode lançar em Contas a Receber
-- uma proposta ainda não aprovada). O cronograma editado ficava só em estado
-- local do modal e se perdia ao fechar.
--
-- Espelha o padrão já usado em contracts.payment_schedule (migration
-- 20260528000001): coluna JSONB direta na tabela, sem depender de status para
-- sobreviver. A materialização em Contas a Receber continua exclusiva dos
-- status financeiros — esta coluna só garante que o rascunho do Plano de
-- Pagamento não seja perdido.
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS custom_installments JSONB;

COMMENT ON COLUMN commercial_deals.custom_installments IS
    'Plano de Pagamento (parcelas customizadas) da negociação — rascunho persistido independente do status. Materializa em Contas a Receber via commercialFinanceService quando o status entra em FINANCIAL_STATUSES.';
