-- Migração para adicionar opções de pagamento do corretor na negociação comercial
ALTER TABLE commercial_deals
  ADD COLUMN IF NOT EXISTS broker_payment_due_date date,
  ADD COLUMN IF NOT EXISTS broker_payment_method text;

-- Comentários para documentação
COMMENT ON COLUMN commercial_deals.broker_payment_due_date IS 'Data de vencimento combinada para o pagamento da comissão do corretor.';
COMMENT ON COLUMN commercial_deals.broker_payment_method IS 'Forma de pagamento da comissão do corretor (ex: PIX, Boleto, Transferência).';
