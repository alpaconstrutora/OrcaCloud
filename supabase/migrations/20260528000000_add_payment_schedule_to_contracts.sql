ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS payment_schedule JSONB;

COMMENT ON COLUMN contracts.payment_schedule IS 'Cronograma de parcelas: [{date, value}] para pagamento_term_type=Parcelado';
