-- Migration to fix missing category column in bank_transactions
-- Resolved: Bad Request (400) when applying rules

ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Update comment for status to include RULE_APPLIED reference
COMMENT ON COLUMN bank_transactions.status IS 'Status of the transaction: IMPORTED, NORMALIZED, RULE_APPLIED, MATCHED, CONFIRMED, LOCKED';
