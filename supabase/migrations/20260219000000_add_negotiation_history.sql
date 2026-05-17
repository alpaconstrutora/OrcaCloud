-- Add negotiation_history column to quotation_responses
ALTER TABLE quotation_responses ADD COLUMN IF NOT EXISTS negotiation_history JSONB DEFAULT '[]'::jsonb;

-- Comment on column for clarity
COMMENT ON COLUMN quotation_responses.negotiation_history IS 'Stores the audit trail of all proposals, counter-proposals, and responses in the negotiation process.';
