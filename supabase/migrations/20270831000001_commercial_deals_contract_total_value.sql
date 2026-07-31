-- Locações › Gerenciar Negociação › Forma de Pagamento.
-- O total do contrato de aluguel é normalmente "valor mensal × nº de parcelas",
-- mas o usuário precisa poder digitar um valor diferente (desconto, carência,
-- mês proporcional). Não dá para reaproveitar `value`: essa coluna é a SOMA das
-- unidades (commercial_deal_units) e é reescrita a cada saveDeal — no aluguel
-- ela passa a ser o valor mensal SUGERIDO, não o total. Daí a coluna própria.
ALTER TABLE commercial_deals
    ADD COLUMN IF NOT EXISTS contract_total_value NUMERIC(15,2);

COMMENT ON COLUMN commercial_deals.contract_total_value IS
    'Locação: valor total do contrato. Default = installment_value * installments, mas editável (desconto etc.). NULL = nunca preenchido.';
