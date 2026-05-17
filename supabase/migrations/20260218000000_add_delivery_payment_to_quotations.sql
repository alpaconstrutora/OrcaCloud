-- Migration: Add delivery and payment fields to quotation tables

-- Update quotation_requests
ALTER TABLE quotation_requests 
ADD COLUMN IF NOT EXISTS delivery_date DATE,
ADD COLUMN IF NOT EXISTS delivery_method TEXT,
ADD COLUMN IF NOT EXISTS delivery_location TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS payment_term_type TEXT CHECK (payment_term_type IN ('Vista', 'Parcelado')),
ADD COLUMN IF NOT EXISTS payment_days INTEGER,
ADD COLUMN IF NOT EXISTS payment_installments INTEGER;

-- Update quotation_responses (adding missing fields to match requests and orders)
ALTER TABLE quotation_responses
ADD COLUMN IF NOT EXISTS delivery_method TEXT,
ADD COLUMN IF NOT EXISTS delivery_location TEXT;

-- Update updated_at trigger if needed (assuming standard trigger exists or just updating manually in service)
