-- Add is_vendavel flag to imovib_units
-- Only units marked as vendável will appear in the espelho de vendas

ALTER TABLE public.imovib_units
    ADD COLUMN IF NOT EXISTS is_vendavel BOOLEAN NOT NULL DEFAULT true;
