-- migration: 20240224_contract_ged.sql

-- Add signed contract document to contracts
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS signed_contract_url TEXT;

-- Add invoice document to measurements
ALTER TABLE contract_measurements 
ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- Update RLS policies to ensure these columns are accessible (they should be by default if public)
-- No changes needed if the table already has inclusive policies
