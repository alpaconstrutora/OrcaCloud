-- Add specific duration columns to imovib_studies
ALTER TABLE public.imovib_studies 
ADD COLUMN construction_duration_months integer DEFAULT 24,
ADD COLUMN sales_duration_months integer DEFAULT 36;
