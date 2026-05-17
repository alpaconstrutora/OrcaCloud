-- Migration: Add negotiation fields to quotation_responses
ALTER TABLE quotation_responses
ADD COLUMN IF NOT EXISTS counter_proposal JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS negotiation_status TEXT DEFAULT 'Original' CHECK (negotiation_status IN ('Original', 'Contraproposta', 'Aceita', 'Recusada'));
