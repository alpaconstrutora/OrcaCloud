-- Migration to add payment fields to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS payment_term_type TEXT CHECK (payment_term_type IN ('Vista', 'Parcelado')),
ADD COLUMN IF NOT EXISTS payment_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_installments INTEGER DEFAULT 1;

-- Add comments for documentation
COMMENT ON COLUMN contracts.payment_method IS 'Forma de pagamento (Boleto, Pix, etc)';
COMMENT ON COLUMN contracts.payment_term_type IS 'CondiÃ§Ã£o de pagamento (Ã€ Vista ou Parcelado)';
COMMENT ON COLUMN contracts.payment_days IS 'Prazo de pagamento em dias';
COMMENT ON COLUMN contracts.payment_installments IS 'Quantidade de parcelas para pagamento';
