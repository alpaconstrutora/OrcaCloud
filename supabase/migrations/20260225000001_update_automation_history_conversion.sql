-- Migration: Add Conversion Tracking to Automation History
-- Date: 2026-02-25

ALTER TABLE public.automation_history 
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS converted_value NUMERIC(15,2);

-- Index for scanning unconverted triggers
CREATE INDEX IF NOT EXISTS automation_history_conv_idx ON public.automation_history(event_type, status, converted_at) 
WHERE event_type = 'billing_triggered' AND status = 'success' AND converted_at IS NULL;
