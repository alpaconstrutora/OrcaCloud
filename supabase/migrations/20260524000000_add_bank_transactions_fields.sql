-- Add project_id and category fields to bank_transactions
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Create index for project_id lookups
CREATE INDEX IF NOT EXISTS idx_bank_transactions_project_id ON bank_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);
