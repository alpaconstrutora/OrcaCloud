-- Consolidates missing imovib_studies columns from sprints 6–10
-- Safe to run: all statements use IF NOT EXISTS

ALTER TABLE public.imovib_studies
    -- Module 0: Identification extended
    ADD COLUMN IF NOT EXISTS spe_cnpj text,
    ADD COLUMN IF NOT EXISTS developer_name text,
    ADD COLUMN IF NOT EXISTS project_manager text,
    ADD COLUMN IF NOT EXISTS base_date date,
    ADD COLUMN IF NOT EXISTS zoning_info text,
    ADD COLUMN IF NOT EXISTS occupancy_rate_max numeric,

    -- Module 1: Extended site inputs
    ADD COLUMN IF NOT EXISTS land_frontage numeric,
    ADD COLUMN IF NOT EXISTS land_shape_raw text,
    ADD COLUMN IF NOT EXISTS efficiency_percent numeric DEFAULT 100,
    ADD COLUMN IF NOT EXISTS opportunity_cost_percent numeric,
    ADD COLUMN IF NOT EXISTS inflation_index_obra text,
    ADD COLUMN IF NOT EXISTS inflation_index_vendas text,

    -- Module 2: Market analysis
    ADD COLUMN IF NOT EXISTS location_macro text,
    ADD COLUMN IF NOT EXISTS location_micro text,
    ADD COLUMN IF NOT EXISTS location_score numeric,
    ADD COLUMN IF NOT EXISTS demand_deficit text,
    ADD COLUMN IF NOT EXISTS competitors_analysis text,
    ADD COLUMN IF NOT EXISTS vso_regional_percent numeric,
    ADD COLUMN IF NOT EXISTS swot_analysis jsonb,
    ADD COLUMN IF NOT EXISTS target_audience text,

    -- Module 4: Revenue profile
    ADD COLUMN IF NOT EXISTS revenue_downpayment_percent numeric DEFAULT 10,
    ADD COLUMN IF NOT EXISTS revenue_construction_percent numeric DEFAULT 20,
    ADD COLUMN IF NOT EXISTS revenue_handover_percent numeric DEFAULT 70,
    ADD COLUMN IF NOT EXISTS default_rate_percent numeric DEFAULT 3,
    ADD COLUMN IF NOT EXISTS cancellation_rate_percent numeric DEFAULT 5,

    -- Module 8: Funding structure
    ADD COLUMN IF NOT EXISTS funding_equity_percent numeric DEFAULT 100,
    ADD COLUMN IF NOT EXISTS funding_debt_percent numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS swap_financial_percent numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS swap_physical_percent numeric DEFAULT 0,

    -- Module 9: ESG parameters
    ADD COLUMN IF NOT EXISTS esg_environmental_score integer DEFAULT 3,
    ADD COLUMN IF NOT EXISTS esg_social_score integer DEFAULT 3,
    ADD COLUMN IF NOT EXISTS esg_governance_score integer DEFAULT 3,
    ADD COLUMN IF NOT EXISTS esg_certifications jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS esg_notes text,
    ADD COLUMN IF NOT EXISTS esg_initiatives jsonb DEFAULT '[]'::jsonb,

    -- Module 10: Committee & final status
    ADD COLUMN IF NOT EXISTS committee_decision varchar(50) DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS committee_notes text;
