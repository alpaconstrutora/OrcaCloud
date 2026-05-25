-- Add project_id and category columns to bank_transactions table
-- Safe migration that checks for existence before adding

BEGIN;

-- Add category column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'category'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN category TEXT;
  END IF;
END $$;

-- Add project_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_bank_transactions_project_id ON bank_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);

COMMIT;
