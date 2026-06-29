-- Linkar oportunidades de investimento com estudos de viabilidade do IMOVIB e novos campos de marketing
-- Date: 2026-06-29

ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS imovib_study_id UUID REFERENCES public.imovib_studies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_funding_value numeric,
    ADD COLUMN IF NOT EXISTS current_funding_value numeric,
    ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS distances_json jsonb DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS risks_json jsonb DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS team_json jsonb DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS simulation_params_json jsonb DEFAULT '{}';
