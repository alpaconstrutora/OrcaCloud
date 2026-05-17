-- MigraÃ§Ã£o para adicionar opÃ§Ãµes de pagamento na tabela commercial_deals

ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS installments INTEGER;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS installment_value NUMERIC(15,2);
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS down_payment NUMERIC(15,2);
