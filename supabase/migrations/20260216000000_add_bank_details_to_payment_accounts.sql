-- Migration: Add bank details to payment_accounts
-- Date: 2026-02-16

ALTER TABLE payment_accounts 
ADD COLUMN IF NOT EXISTS bank text,
ADD COLUMN IF NOT EXISTS branch text,
ADD COLUMN IF NOT EXISTS account_number text;

-- Add comment for documentation
COMMENT ON COLUMN payment_accounts.bank IS 'Nome ou cÃ³digo do banco';
COMMENT ON COLUMN payment_accounts.branch IS 'AgÃªncia bancÃ¡ria';
COMMENT ON COLUMN payment_accounts.account_number IS 'NÃºmero da conta corrente';
