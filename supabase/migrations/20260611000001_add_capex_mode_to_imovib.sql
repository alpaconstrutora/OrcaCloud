-- Add capex mode fields to imovib_studies
ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS capex_mode varchar(20) DEFAULT 'detailed',
    ADD COLUMN IF NOT EXISTS capex_simplified_cost_sqm numeric,
    ADD COLUMN IF NOT EXISTS capex_simplified_area_sqm numeric;
