-- Sprint 6: Add Modules 0, 1, 2 cols (Identification, Extended Inputs, Market Analysis)

ALTER TABLE public.imovib_studies
-- Module 0
ADD COLUMN spe_cnpj text,
ADD COLUMN developer_name text,
ADD COLUMN project_manager text,
ADD COLUMN base_date date,
ADD COLUMN development_modality text,
ADD COLUMN zoning_info text,
ADD COLUMN ca_basic numeric,
ADD COLUMN ca_max numeric,
ADD COLUMN occupancy_rate_max numeric,

-- Module 1 (Extended)
ADD COLUMN land_frontage numeric,
ADD COLUMN land_shape_raw text,
ADD COLUMN efficiency_percent numeric DEFAULT 100,
ADD COLUMN opportunity_cost_percent numeric,
ADD COLUMN inflation_index_obra text,
ADD COLUMN inflation_index_vendas text,

-- Module 2 (Market Analysis)
ADD COLUMN location_macro text,
ADD COLUMN location_micro text,
ADD COLUMN location_score numeric,
ADD COLUMN demand_deficit text,
ADD COLUMN competitors_analysis text,
ADD COLUMN vso_regional_percent numeric,
ADD COLUMN swot_analysis jsonb,
ADD COLUMN target_audience text;
