-- Add ESG initiatives to imovib_studies (Sprint 10 Enhancement)

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS esg_initiatives jsonb DEFAULT '[]'::jsonb;
