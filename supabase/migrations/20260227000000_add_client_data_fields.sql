-- Add individual management fields to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS client_documents JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS financial_info JSONB,
ADD COLUMN IF NOT EXISTS diary_entries JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS schedule_info JSONB,
ADD COLUMN IF NOT EXISTS ai_insight JSONB;

-- For comments/documentation purposes, default values might be complex JSON objects depending on the component
-- The financial_info should have { installments: [], transactions: [], totalValue: 0 } structure if populated.
