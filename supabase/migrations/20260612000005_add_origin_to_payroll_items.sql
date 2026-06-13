ALTER TABLE public.payroll_items
ADD COLUMN IF NOT EXISTS origin TEXT;
