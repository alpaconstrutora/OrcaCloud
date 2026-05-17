-- Add ESG and Committee columns to imovib_studies (Sprint 10)

ALTER TABLE public.imovib_studies
    -- Module 9: ESG Parameters
    ADD COLUMN IF NOT EXISTS esg_environmental_score integer DEFAULT 3, -- 1 to 5
    ADD COLUMN IF NOT EXISTS esg_social_score integer DEFAULT 3, -- 1 to 5
    ADD COLUMN IF NOT EXISTS esg_governance_score integer DEFAULT 3, -- 1 to 5
    ADD COLUMN IF NOT EXISTS esg_certifications jsonb DEFAULT '[]'::jsonb, -- Array of strings e.g., ["LEED", "AQUA"]
    ADD COLUMN IF NOT EXISTS esg_notes text,
    
    -- Module 10: Committee & Final Status
    ADD COLUMN IF NOT EXISTS committee_decision varchar(50) DEFAULT 'draft', -- 'draft', 'in_review', 'approved', 'rejected', 'on_hold'
    ADD COLUMN IF NOT EXISTS committee_notes text;
