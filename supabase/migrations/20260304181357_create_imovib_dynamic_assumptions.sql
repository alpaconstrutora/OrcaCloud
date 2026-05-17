-- Sprint 3 (Dynamic Viability): Add time and macroeconomic columns to imovib_studies

ALTER TABLE public.imovib_studies
ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 36,
ADD COLUMN IF NOT EXISTS construction_start_month INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS sales_start_month INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS inflation_rate NUMERIC DEFAULT 0.4,
ADD COLUMN IF NOT EXISTS discount_rate NUMERIC DEFAULT 12.0,
ADD COLUMN IF NOT EXISTS sales_velocity NUMERIC DEFAULT 5.0;
