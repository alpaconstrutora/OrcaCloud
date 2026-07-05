-- ============================================================
-- Modulo: Areas NBR 12721 / Quadros I, II e IV-B
-- OrcaCloud SaaS - MVP v1.2.1
--
-- Principios:
-- - calculo oficial somente com pavimentos, unidades e espacos materializados;
-- - blocos sao sempre registros reais/versionados;
-- - snapshots explicitos por versao;
-- - resultados persistidos em tabelas tipadas;
-- - version_payload_hash tecnico separado do version_identity_hash documental;
-- - exportacao e auditoria como eventos/documentos, nao como status terminal.
-- ============================================================

-- ============================================================
-- 1. Helpers e enums
-- ============================================================

CREATE OR REPLACE FUNCTION public.area_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_project_status AS ENUM ('draft','active','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_version_status AS ENUM (
        'draft',
        'calculated',
        'pending_technical_approval',
        'technically_approved',
        'pending_legal_approval',
        'legally_approved',
        'locked',
        'superseded',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_project_type AS ENUM ('vertical','mixed','commercial','residential','horizontal','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_floor_type AS ENUM ('basement','ground','type','roof','technical','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_unit_type AS ENUM ('apartment','store','office','parking','storage','technical','house','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_use_class AS ENUM ('private','common');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_private_nature AS ENUM ('main','accessory','not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_coverage_class AS ENUM ('covered_standard','covered_different','uncovered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_common_division_class AS ENUM ('proportional','non_proportional','not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_source_type AS ENUM ('manual','excel','api');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_ownership_accounting_mode AS ENUM (
        'direct_unit',
        'linked_accessory',
        'autonomous_unit',
        'common_area'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_accessory_link_type AS ENUM ('parking','storage','box','exclusive_area','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_common_allocation_method AS ENUM ('fixed_area','percentage');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_coefficient_source AS ENUM ('system','company','custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_distribution_scope AS ENUM ('global','block');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_fraction_derivation_method AS ENUM ('derived_from_coefficient','manual_legal_adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_audit_action AS ENUM ('create','update','delete','calculate','approve','reject','lock','export');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_approval_type AS ENUM ('technical','legal','product_owner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_approval_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_export_type AS ENUM ('pdf','xlsx');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_export_scope AS ENUM ('quadro_i','quadro_ii','quadro_ivb','full_package');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.area_materialization_source_entity AS ENUM ('floor','unit','space','full_floor_template');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Tabelas raiz
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    empreendimento_id UUID REFERENCES public.empreendimentos(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    normative_reference TEXT NOT NULL DEFAULT 'ABNT NBR 12721:2006',
    normative_valid_from DATE NOT NULL DEFAULT DATE '2007-01-21',
    project_type public.area_project_type NOT NULL DEFAULT 'vertical',
    address TEXT,
    city TEXT,
    state TEXT,
    registry_number TEXT,
    registry_office TEXT,
    technical_responsible_id UUID,
    status public.area_project_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.area_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_project_id UUID NOT NULL REFERENCES public.area_projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    version_label TEXT NOT NULL,
    source_version_id UUID REFERENCES public.area_versions(id) ON DELETE SET NULL,
    status public.area_version_status NOT NULL DEFAULT 'draft',
    calculation_engine_version TEXT NOT NULL DEFAULT 'area-engine-mvp-1.2.1',
    normative_reference TEXT NOT NULL DEFAULT 'ABNT NBR 12721:2006',
    normative_valid_from DATE NOT NULL DEFAULT DATE '2007-01-21',
    rounding_profile JSONB NOT NULL DEFAULT '{
        "area_internal_scale": 6,
        "area_display_scale": 2,
        "equivalence_coefficient_internal_scale": 8,
        "equivalence_coefficient_display_scale": 6,
        "proportionality_coefficient_internal_scale": 12,
        "proportionality_coefficient_display_scale": 8,
        "percent_display_scale": 6,
        "rounding_mode": "half_up"
    }'::jsonb,
    version_payload_hash TEXT,
    version_identity_hash TEXT,
    canonical_payload_json JSONB,
    locked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_versions_unique_number UNIQUE (area_project_id, version_number),
    CONSTRAINT area_versions_identity_hash_locked_chk CHECK (
        (status = 'locked' AND version_payload_hash IS NOT NULL AND version_identity_hash IS NOT NULL AND locked_at IS NOT NULL)
        OR (status <> 'locked')
    ),
    CONSTRAINT area_versions_calculated_payload_chk CHECK (
        status IN ('draft','cancelled')
        OR version_payload_hash IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS public.area_version_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    code TEXT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_version_blocks_version_id_unique UNIQUE (area_version_id, id),
    CONSTRAINT area_version_blocks_code_unique UNIQUE (area_version_id, code)
);

-- ============================================================
-- 3. Tabelas materializaveis
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_materialization_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    source_entity_type public.area_materialization_source_entity NOT NULL,
    source_entity_id UUID,
    quantity_generated INTEGER NOT NULL CHECK (quantity_generated > 0),
    generation_rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    generated_by UUID REFERENCES auth.users(id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.area_version_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES public.area_version_blocks(id) ON DELETE CASCADE,
    code TEXT,
    name TEXT NOT NULL,
    floor_type public.area_floor_type NOT NULL DEFAULT 'other',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_template BOOLEAN NOT NULL DEFAULT false,
    is_materialized BOOLEAN NOT NULL DEFAULT true,
    template_source_id UUID REFERENCES public.area_version_floors(id) ON DELETE SET NULL,
    materialization_batch_id UUID REFERENCES public.area_materialization_batches(id) ON DELETE SET NULL,
    materialized_label TEXT,
    materialized_index INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_version_floors_version_id_unique UNIQUE (area_version_id, id),
    CONSTRAINT area_version_floors_template_materialized_chk CHECK (NOT (is_template AND is_materialized)),
    CONSTRAINT area_version_floors_materialized_chk CHECK (is_template OR is_materialized),
    CONSTRAINT area_version_floors_generated_source_chk CHECK (
        materialization_batch_id IS NULL OR template_source_id IS NOT NULL
    ),
    CONSTRAINT area_version_floors_code_unique UNIQUE (area_version_id, block_id, code)
);

CREATE TABLE IF NOT EXISTS public.area_version_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES public.area_version_blocks(id) ON DELETE CASCADE,
    primary_floor_id UUID REFERENCES public.area_version_floors(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT,
    unit_type public.area_unit_type NOT NULL DEFAULT 'other',
    typology_code TEXT,
    is_autonomous BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_template BOOLEAN NOT NULL DEFAULT false,
    is_materialized BOOLEAN NOT NULL DEFAULT true,
    template_source_id UUID REFERENCES public.area_version_units(id) ON DELETE SET NULL,
    materialization_batch_id UUID REFERENCES public.area_materialization_batches(id) ON DELETE SET NULL,
    materialized_label TEXT,
    materialized_index INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_version_units_version_id_unique UNIQUE (area_version_id, id),
    CONSTRAINT area_version_units_template_materialized_chk CHECK (NOT (is_template AND is_materialized)),
    CONSTRAINT area_version_units_materialized_chk CHECK (is_template OR is_materialized),
    CONSTRAINT area_version_units_generated_source_chk CHECK (
        materialization_batch_id IS NULL OR template_source_id IS NOT NULL
    ),
    CONSTRAINT area_version_units_code_unique UNIQUE (area_version_id, code)
);

CREATE TABLE IF NOT EXISTS public.area_version_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES public.area_version_blocks(id) ON DELETE CASCADE,
    floor_id UUID REFERENCES public.area_version_floors(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES public.area_version_units(id) ON DELETE SET NULL,
    code TEXT,
    name TEXT NOT NULL,
    use_class public.area_use_class NOT NULL,
    private_nature public.area_private_nature NOT NULL DEFAULT 'not_applicable',
    coverage_class public.area_coverage_class NOT NULL DEFAULT 'covered_standard',
    common_division_class public.area_common_division_class NOT NULL DEFAULT 'not_applicable',
    ownership_accounting_mode public.area_ownership_accounting_mode NOT NULL,
    real_area_m2_raw NUMERIC(18,6) NOT NULL CHECK (real_area_m2_raw > 0),
    coefficient_id UUID,
    coefficient_value NUMERIC(18,8),
    equivalent_area_m2_raw NUMERIC(18,6),
    source_type public.area_source_type NOT NULL DEFAULT 'manual',
    source_reference TEXT,
    technical_justification TEXT,
    is_template BOOLEAN NOT NULL DEFAULT false,
    is_materialized BOOLEAN NOT NULL DEFAULT true,
    template_source_id UUID REFERENCES public.area_version_spaces(id) ON DELETE SET NULL,
    materialization_batch_id UUID REFERENCES public.area_materialization_batches(id) ON DELETE SET NULL,
    materialized_label TEXT,
    materialized_index INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_version_spaces_version_id_unique UNIQUE (area_version_id, id),
    CONSTRAINT area_version_spaces_template_materialized_chk CHECK (NOT (is_template AND is_materialized)),
    CONSTRAINT area_version_spaces_materialized_chk CHECK (is_template OR is_materialized),
    CONSTRAINT area_version_spaces_generated_source_chk CHECK (
        materialization_batch_id IS NULL OR template_source_id IS NOT NULL
    ),
    CONSTRAINT area_version_spaces_private_common_chk CHECK (
        (use_class = 'private' AND private_nature <> 'not_applicable' AND common_division_class = 'not_applicable')
        OR
        (use_class = 'common' AND private_nature = 'not_applicable' AND common_division_class <> 'not_applicable')
    ),
    CONSTRAINT area_version_spaces_unit_by_use_chk CHECK (
        (use_class = 'private' AND ownership_accounting_mode IN ('direct_unit','autonomous_unit') AND unit_id IS NOT NULL)
        OR
        (ownership_accounting_mode = 'linked_accessory' AND unit_id IS NULL)
        OR
        (ownership_accounting_mode = 'common_area' AND use_class = 'common' AND unit_id IS NULL)
    ),
    CONSTRAINT area_version_spaces_nonstandard_coefficient_chk CHECK (
        coverage_class = 'covered_standard'
        OR coefficient_value IS NOT NULL
    )
);

-- ============================================================
-- 4. Relacoes sensiveis
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_version_unit_accessory_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    parent_unit_id UUID NOT NULL REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    accessory_space_id UUID REFERENCES public.area_version_spaces(id) ON DELETE CASCADE,
    accessory_unit_id UUID REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    link_type public.area_accessory_link_type NOT NULL,
    affects_private_area BOOLEAN NOT NULL DEFAULT true,
    affects_coefficient BOOLEAN NOT NULL DEFAULT true,
    legal_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_accessory_one_target_chk CHECK (
        (accessory_space_id IS NOT NULL AND accessory_unit_id IS NULL)
        OR
        (accessory_space_id IS NULL AND accessory_unit_id IS NOT NULL)
    ),
    CONSTRAINT area_accessory_no_self_unit_chk CHECK (parent_unit_id IS DISTINCT FROM accessory_unit_id)
);

CREATE TABLE IF NOT EXISTS public.area_version_common_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    common_space_id UUID NOT NULL REFERENCES public.area_version_spaces(id) ON DELETE CASCADE,
    target_unit_id UUID NOT NULL REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    allocation_method public.area_common_allocation_method NOT NULL,
    allocated_real_area_m2_raw NUMERIC(18,6),
    allocated_equivalent_area_m2_raw NUMERIC(18,6),
    percentage NUMERIC(18,12),
    justification TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_common_alloc_method_values_chk CHECK (
        (allocation_method = 'fixed_area' AND allocated_real_area_m2_raw IS NOT NULL AND allocated_real_area_m2_raw > 0)
        OR
        (allocation_method = 'percentage' AND percentage IS NOT NULL AND percentage > 0 AND percentage <= 1)
    )
);

CREATE TABLE IF NOT EXISTS public.area_version_common_distribution_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    common_space_id UUID NOT NULL REFERENCES public.area_version_spaces(id) ON DELETE CASCADE,
    distribution_scope public.area_distribution_scope NOT NULL,
    block_id UUID REFERENCES public.area_version_blocks(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_common_dist_scope_block_chk CHECK (
        (distribution_scope = 'global' AND block_id IS NULL)
        OR
        (distribution_scope = 'block' AND block_id IS NOT NULL)
    ),
    CONSTRAINT area_common_dist_scope_unique UNIQUE (area_version_id, common_space_id)
);

CREATE TABLE IF NOT EXISTS public.area_version_coefficients_used (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    coefficient_name TEXT NOT NULL,
    coefficient_min NUMERIC(18,8),
    coefficient_default NUMERIC(18,8),
    coefficient_max NUMERIC(18,8),
    coefficient_used NUMERIC(18,8) NOT NULL CHECK (coefficient_used >= 0),
    source public.area_coefficient_source NOT NULL DEFAULT 'system',
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    justification TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_coefficients_approval_chk CHECK (
        requires_approval = false
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND justification IS NOT NULL)
    )
);

-- ============================================================
-- 5. Resultados tipados
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_version_quadro_i_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES public.area_version_blocks(id) ON DELETE CASCADE,
    floor_id UUID NOT NULL REFERENCES public.area_version_floors(id) ON DELETE CASCADE,
    row_order INTEGER NOT NULL DEFAULT 0,
    floor_label TEXT NOT NULL,
    qi_02_private_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_03_private_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_04_private_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_05_private_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_06_private_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_07_common_nonprop_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_08_common_nonprop_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_09_common_nonprop_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_10_common_nonprop_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_11_common_nonprop_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_12_common_prop_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_13_common_prop_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_14_common_prop_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_15_common_prop_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_16_common_prop_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_17_floor_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qi_18_floor_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    display_adjustment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT area_quadro_i_unique_floor UNIQUE (area_version_id, floor_id)
);

CREATE TABLE IF NOT EXISTS public.area_version_quadro_ii_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    row_order INTEGER NOT NULL DEFAULT 0,
    unit_label TEXT NOT NULL,
    qii_20_private_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_21_private_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_22_private_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_23_private_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_24_private_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_25_common_nonprop_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_26_common_nonprop_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_27_common_nonprop_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_28_common_nonprop_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_29_common_nonprop_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_30_nonprop_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_31_proportionality_coefficient_raw NUMERIC(24,12) NOT NULL DEFAULT 0,
    qii_32_common_prop_covered_standard_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_33_common_prop_nonstandard_or_uncovered_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_34_common_prop_equivalent_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_35_common_prop_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_36_common_prop_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_37_unit_real_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qii_38_unit_equivalent_total_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    display_adjustment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT area_quadro_ii_unique_unit UNIQUE (area_version_id, unit_id)
);

CREATE TABLE IF NOT EXISTS public.area_version_fraction_ideals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    source_coefficient NUMERIC(24,12) NOT NULL,
    fraction_decimal_raw NUMERIC(24,12) NOT NULL,
    fraction_percent_raw NUMERIC(24,10) NOT NULL,
    fraction_thousandths_raw NUMERIC(24,8) NOT NULL,
    derivation_method public.area_fraction_derivation_method NOT NULL DEFAULT 'derived_from_coefficient',
    legal_approved_by UUID REFERENCES auth.users(id),
    legal_approved_at TIMESTAMPTZ,
    technical_note TEXT,
    legal_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT area_fraction_unique_unit UNIQUE (area_version_id, unit_id),
    CONSTRAINT area_fraction_manual_approval_chk CHECK (
        derivation_method = 'derived_from_coefficient'
        OR (legal_approved_by IS NOT NULL AND legal_approved_at IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.area_version_quadro_ivb_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.area_version_units(id) ON DELETE CASCADE,
    row_order INTEGER NOT NULL DEFAULT 0,
    unit_label TEXT NOT NULL,
    qivb_b_private_main_area_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qivb_c_private_accessory_area_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qivb_d_private_total_area_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qivb_e_common_area_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qivb_f_real_total_area_raw NUMERIC(18,6) NOT NULL DEFAULT 0,
    qivb_g_proportionality_coefficient_raw NUMERIC(24,12) NOT NULL DEFAULT 0,
    fraction_decimal_raw NUMERIC(24,12) NOT NULL DEFAULT 0,
    fraction_percent_raw NUMERIC(24,10) NOT NULL DEFAULT 0,
    fraction_thousandths_raw NUMERIC(24,8) NOT NULL DEFAULT 0,
    display_adjustment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT area_quadro_ivb_unique_unit UNIQUE (area_version_id, unit_id)
);

-- ============================================================
-- 6. Auditoria, aprovacoes e exportacoes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.area_version_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action public.area_audit_action NOT NULL,
    field_name TEXT,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    performed_by UUID REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.area_version_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    approval_type public.area_approval_type NOT NULL,
    status public.area_approval_status NOT NULL DEFAULT 'pending',
    requested_by UUID REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    comments TEXT,
    approval_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT area_approvals_unique_type UNIQUE (area_version_id, approval_type)
);

CREATE TABLE IF NOT EXISTS public.area_version_export_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_version_id UUID NOT NULL REFERENCES public.area_versions(id) ON DELETE CASCADE,
    export_type public.area_export_type NOT NULL,
    export_scope public.area_export_scope NOT NULL,
    file_id UUID,
    file_hash TEXT,
    version_payload_hash TEXT NOT NULL,
    version_identity_hash TEXT,
    exported_by UUID REFERENCES auth.users(id),
    exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_official BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT area_export_official_identity_chk CHECK (
        is_official = false OR version_identity_hash IS NOT NULL
    )
);

-- ============================================================
-- 7. Integridade entre snapshots por versao
-- ============================================================

ALTER TABLE public.area_version_floors
    DROP CONSTRAINT IF EXISTS area_floors_block_same_version_fk;
ALTER TABLE public.area_version_floors
    ADD CONSTRAINT area_floors_block_same_version_fk
    FOREIGN KEY (area_version_id, block_id)
    REFERENCES public.area_version_blocks(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_units
    DROP CONSTRAINT IF EXISTS area_units_block_same_version_fk;
ALTER TABLE public.area_version_units
    ADD CONSTRAINT area_units_block_same_version_fk
    FOREIGN KEY (area_version_id, block_id)
    REFERENCES public.area_version_blocks(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_units
    DROP CONSTRAINT IF EXISTS area_units_floor_same_version_fk;
ALTER TABLE public.area_version_units
    ADD CONSTRAINT area_units_floor_same_version_fk
    FOREIGN KEY (area_version_id, primary_floor_id)
    REFERENCES public.area_version_floors(area_version_id, id);

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_spaces_block_same_version_fk;
ALTER TABLE public.area_version_spaces
    ADD CONSTRAINT area_spaces_block_same_version_fk
    FOREIGN KEY (area_version_id, block_id)
    REFERENCES public.area_version_blocks(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_spaces_floor_same_version_fk;
ALTER TABLE public.area_version_spaces
    ADD CONSTRAINT area_spaces_floor_same_version_fk
    FOREIGN KEY (area_version_id, floor_id)
    REFERENCES public.area_version_floors(area_version_id, id);

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_spaces_unit_same_version_fk;
ALTER TABLE public.area_version_spaces
    ADD CONSTRAINT area_spaces_unit_same_version_fk
    FOREIGN KEY (area_version_id, unit_id)
    REFERENCES public.area_version_units(area_version_id, id);

ALTER TABLE public.area_version_unit_accessory_links
    DROP CONSTRAINT IF EXISTS area_accessory_parent_same_version_fk;
ALTER TABLE public.area_version_unit_accessory_links
    ADD CONSTRAINT area_accessory_parent_same_version_fk
    FOREIGN KEY (area_version_id, parent_unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_unit_accessory_links
    DROP CONSTRAINT IF EXISTS area_accessory_space_same_version_fk;
ALTER TABLE public.area_version_unit_accessory_links
    ADD CONSTRAINT area_accessory_space_same_version_fk
    FOREIGN KEY (area_version_id, accessory_space_id)
    REFERENCES public.area_version_spaces(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_unit_accessory_links
    DROP CONSTRAINT IF EXISTS area_accessory_unit_same_version_fk;
ALTER TABLE public.area_version_unit_accessory_links
    ADD CONSTRAINT area_accessory_unit_same_version_fk
    FOREIGN KEY (area_version_id, accessory_unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_common_allocations
    DROP CONSTRAINT IF EXISTS area_common_alloc_space_same_version_fk;
ALTER TABLE public.area_version_common_allocations
    ADD CONSTRAINT area_common_alloc_space_same_version_fk
    FOREIGN KEY (area_version_id, common_space_id)
    REFERENCES public.area_version_spaces(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_common_allocations
    DROP CONSTRAINT IF EXISTS area_common_alloc_unit_same_version_fk;
ALTER TABLE public.area_version_common_allocations
    ADD CONSTRAINT area_common_alloc_unit_same_version_fk
    FOREIGN KEY (area_version_id, target_unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_common_distribution_scopes
    DROP CONSTRAINT IF EXISTS area_common_scope_space_same_version_fk;
ALTER TABLE public.area_version_common_distribution_scopes
    ADD CONSTRAINT area_common_scope_space_same_version_fk
    FOREIGN KEY (area_version_id, common_space_id)
    REFERENCES public.area_version_spaces(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_common_distribution_scopes
    DROP CONSTRAINT IF EXISTS area_common_scope_block_same_version_fk;
ALTER TABLE public.area_version_common_distribution_scopes
    ADD CONSTRAINT area_common_scope_block_same_version_fk
    FOREIGN KEY (area_version_id, block_id)
    REFERENCES public.area_version_blocks(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_quadro_i_rows
    DROP CONSTRAINT IF EXISTS area_qi_block_same_version_fk;
ALTER TABLE public.area_version_quadro_i_rows
    ADD CONSTRAINT area_qi_block_same_version_fk
    FOREIGN KEY (area_version_id, block_id)
    REFERENCES public.area_version_blocks(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_quadro_i_rows
    DROP CONSTRAINT IF EXISTS area_qi_floor_same_version_fk;
ALTER TABLE public.area_version_quadro_i_rows
    ADD CONSTRAINT area_qi_floor_same_version_fk
    FOREIGN KEY (area_version_id, floor_id)
    REFERENCES public.area_version_floors(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_quadro_ii_rows
    DROP CONSTRAINT IF EXISTS area_qii_unit_same_version_fk;
ALTER TABLE public.area_version_quadro_ii_rows
    ADD CONSTRAINT area_qii_unit_same_version_fk
    FOREIGN KEY (area_version_id, unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_fraction_ideals
    DROP CONSTRAINT IF EXISTS area_fraction_unit_same_version_fk;
ALTER TABLE public.area_version_fraction_ideals
    ADD CONSTRAINT area_fraction_unit_same_version_fk
    FOREIGN KEY (area_version_id, unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;

ALTER TABLE public.area_version_quadro_ivb_rows
    DROP CONSTRAINT IF EXISTS area_qivb_unit_same_version_fk;
ALTER TABLE public.area_version_quadro_ivb_rows
    ADD CONSTRAINT area_qivb_unit_same_version_fk
    FOREIGN KEY (area_version_id, unit_id)
    REFERENCES public.area_version_units(area_version_id, id) ON DELETE CASCADE;
-- ============================================================
-- 8. Indices
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_area_projects_org ON public.area_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_area_projects_empreendimento ON public.area_projects(empreendimento_id);
CREATE INDEX IF NOT EXISTS idx_area_versions_project ON public.area_versions(area_project_id);
CREATE INDEX IF NOT EXISTS idx_area_versions_status ON public.area_versions(status);
CREATE INDEX IF NOT EXISTS idx_area_blocks_version ON public.area_version_blocks(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_floors_version ON public.area_version_floors(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_floors_block ON public.area_version_floors(block_id);
CREATE INDEX IF NOT EXISTS idx_area_units_version ON public.area_version_units(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_units_block ON public.area_version_units(block_id);
CREATE INDEX IF NOT EXISTS idx_area_spaces_version ON public.area_version_spaces(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_spaces_floor ON public.area_version_spaces(floor_id);
CREATE INDEX IF NOT EXISTS idx_area_spaces_unit ON public.area_version_spaces(unit_id);
CREATE INDEX IF NOT EXISTS idx_area_spaces_use_division ON public.area_version_spaces(use_class, common_division_class);
CREATE INDEX IF NOT EXISTS idx_area_accessory_links_version ON public.area_version_unit_accessory_links(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_common_alloc_version ON public.area_version_common_allocations(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_common_scopes_version ON public.area_version_common_distribution_scopes(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_coefficients_version ON public.area_version_coefficients_used(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_qi_version ON public.area_version_quadro_i_rows(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_qii_version ON public.area_version_quadro_ii_rows(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_qivb_version ON public.area_version_quadro_ivb_rows(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_fraction_version ON public.area_version_fraction_ideals(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_audit_version ON public.area_version_audit_logs(area_version_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_area_approvals_version ON public.area_version_approvals(area_version_id);
CREATE INDEX IF NOT EXISTS idx_area_exports_version ON public.area_version_export_files(area_version_id, exported_at DESC);

-- ============================================================
-- 9. Triggers updated_at
-- ============================================================

DROP TRIGGER IF EXISTS trg_area_projects_touch ON public.area_projects;
CREATE TRIGGER trg_area_projects_touch BEFORE UPDATE ON public.area_projects
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_versions_touch ON public.area_versions;
CREATE TRIGGER trg_area_versions_touch BEFORE UPDATE ON public.area_versions
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_blocks_touch ON public.area_version_blocks;
CREATE TRIGGER trg_area_blocks_touch BEFORE UPDATE ON public.area_version_blocks
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_floors_touch ON public.area_version_floors;
CREATE TRIGGER trg_area_floors_touch BEFORE UPDATE ON public.area_version_floors
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_units_touch ON public.area_version_units;
CREATE TRIGGER trg_area_units_touch BEFORE UPDATE ON public.area_version_units
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_spaces_touch ON public.area_version_spaces;
CREATE TRIGGER trg_area_spaces_touch BEFORE UPDATE ON public.area_version_spaces
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_accessory_links_touch ON public.area_version_unit_accessory_links;
CREATE TRIGGER trg_area_accessory_links_touch BEFORE UPDATE ON public.area_version_unit_accessory_links
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_common_alloc_touch ON public.area_version_common_allocations;
CREATE TRIGGER trg_area_common_alloc_touch BEFORE UPDATE ON public.area_version_common_allocations
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_common_scopes_touch ON public.area_version_common_distribution_scopes;
CREATE TRIGGER trg_area_common_scopes_touch BEFORE UPDATE ON public.area_version_common_distribution_scopes
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_coefficients_touch ON public.area_version_coefficients_used;
CREATE TRIGGER trg_area_coefficients_touch BEFORE UPDATE ON public.area_version_coefficients_used
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_fraction_touch ON public.area_version_fraction_ideals;
CREATE TRIGGER trg_area_fraction_touch BEFORE UPDATE ON public.area_version_fraction_ideals
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

DROP TRIGGER IF EXISTS trg_area_approvals_touch ON public.area_version_approvals;
CREATE TRIGGER trg_area_approvals_touch BEFORE UPDATE ON public.area_version_approvals
    FOR EACH ROW EXECUTE FUNCTION public.area_touch_updated_at();

-- ============================================================
-- 10. Bloqueio de mutacao em versoes travadas
-- ============================================================

CREATE OR REPLACE FUNCTION public.area_prevent_locked_version_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_area_version_id UUID;
    v_status public.area_version_status;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_area_version_id := OLD.area_version_id;
    ELSE
        v_area_version_id := NEW.area_version_id;
    END IF;

    SELECT status INTO v_status
    FROM public.area_versions
    WHERE id = v_area_version_id;

    IF v_status IN ('locked','superseded') THEN
        RAISE EXCEPTION 'Area version % is locked and cannot be mutated', v_area_version_id
            USING ERRCODE = '45000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END $$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'area_version_blocks',
        'area_version_floors',
        'area_version_units',
        'area_version_spaces',
        'area_version_unit_accessory_links',
        'area_version_common_allocations',
        'area_version_common_distribution_scopes',
        'area_version_coefficients_used',
        'area_version_quadro_i_rows',
        'area_version_quadro_ii_rows',
        'area_version_fraction_ideals',
        'area_version_quadro_ivb_rows'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_area_lock_' || substr(md5(t), 1, 10), t);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.area_prevent_locked_version_mutation()',
            'trg_area_lock_' || substr(md5(t), 1, 10),
            t
        );
    END LOOP;
END $$;

-- ============================================================
-- 11. RLS
-- ============================================================

ALTER TABLE public.area_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_materialization_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_unit_accessory_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_common_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_common_distribution_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_coefficients_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_quadro_i_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_quadro_ii_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_fraction_ideals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_quadro_ivb_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_version_export_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS area_projects_org_access ON public.area_projects;
CREATE POLICY area_projects_org_access ON public.area_projects
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS area_versions_org_access ON public.area_versions;
CREATE POLICY area_versions_org_access ON public.area_versions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.area_projects ap
            WHERE ap.id = area_versions.area_project_id
              AND public.is_org_member(ap.organization_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.area_projects ap
            WHERE ap.id = area_versions.area_project_id
              AND public.is_org_member(ap.organization_id)
        )
    );

CREATE OR REPLACE FUNCTION public.area_rls_can_access_version(p_area_version_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.area_versions av
        JOIN public.area_projects ap ON ap.id = av.area_project_id
        WHERE av.id = p_area_version_id
          AND public.is_org_member(ap.organization_id)
    );
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'area_version_blocks',
        'area_materialization_batches',
        'area_version_floors',
        'area_version_units',
        'area_version_spaces',
        'area_version_unit_accessory_links',
        'area_version_common_allocations',
        'area_version_common_distribution_scopes',
        'area_version_coefficients_used',
        'area_version_quadro_i_rows',
        'area_version_quadro_ii_rows',
        'area_version_fraction_ideals',
        'area_version_quadro_ivb_rows',
        'area_version_audit_logs',
        'area_version_approvals',
        'area_version_export_files'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %s_org_access ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY %s_org_access ON public.%I FOR ALL TO authenticated USING (public.area_rls_can_access_version(area_version_id)) WITH CHECK (public.area_rls_can_access_version(area_version_id))',
            t,
            t
        );
    END LOOP;
END $$;






