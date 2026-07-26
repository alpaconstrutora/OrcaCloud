-- ============================================================
-- Locação: vigência / periodicidade / índice capturados na negociação.
--
-- Até aqui o DealModal de Locação só enviava `payment_due_date`. Como
-- `commercialService.saveDeal` faz spread do objeto inteiro no payload,
-- QUALQUER campo novo em `PropertyDeal` vira coluna no INSERT/UPDATE — e o
-- PostgREST rejeita se a coluna não existir. Por isso estas 3 colunas são
-- pré-requisito duro da captura no formulário.
--
-- Consequência de não ter isso: `createFromDeal` recebia `end_date: undefined`,
-- todo contrato de locação nascia sem fim de vigência, `syncRecurringToFinance`
-- caía no fallback de 12 ciclos e nenhum alerta de vencimento era possível.
--
-- Arquivo separado da 20270827000001 de propósito: `lock_timeout` vale por
-- transação e são duas tabelas quentes distintas.
-- ============================================================

SET lock_timeout = '3s';

ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS end_date       date,
    ADD COLUMN IF NOT EXISTS billing_cycle  text,
    ADD COLUMN IF NOT EXISTS reajuste_index text;

COMMENT ON COLUMN public.commercial_deals.end_date IS
 'Locação: fim da vigência. Vira contracts.end_date em createFromDeal e delimita a geração de parcelas.';
COMMENT ON COLUMN public.commercial_deals.billing_cycle IS
 'Locação: Mensal | Bimestral | Semestral | Anual. Default Mensal em createFromDeal.';
COMMENT ON COLUMN public.commercial_deals.reajuste_index IS
 'Locação: INCC | INCC-M | IPCA | IGP-M | CUB | OUTROS — MESMOS nomes de contract_index_values.index_name (o antigo default IGPM, sem hífen, não casava com nada).';

RESET lock_timeout;

-- Correção do legado: contratos gerados com o default antigo 'IGPM' nunca
-- casavam com contract_index_values ('IGP-M') → a fila de reajuste falhava com
-- "índice não encontrado".
UPDATE public.contracts
   SET reajuste_index = 'IGP-M'
 WHERE domain = 'LOCACAO'
   AND reajuste_index = 'IGPM';
