-- ============================================================
-- Fixture Caso 1 - Edificio simples sem garagem
-- Motor Areas NBR 12721 MVP
--
-- Uso: rodar manualmente no SQL editor/Supabase depois das migrations
-- 20261231000000_area_engine_nbr12721_mvp.sql
-- 20261231000001_area_engine_nbr12721_functions.sql
-- ============================================================

BEGIN;

-- UUIDs fixos para permitir reexecucao limpa.
DELETE FROM public.organizations
WHERE id = '11111111-1111-1111-1111-111111111111';

INSERT INTO public.organizations (id, name, email)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Fixture Areas NBR 12721',
    'fixture-areas@example.test'
);

INSERT INTO public.area_projects (
    id,
    organization_id,
    name,
    normative_reference,
    normative_valid_from,
    project_type,
    status
) VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Caso 1 - Edificio simples sem garagem',
    'ABNT NBR 12721:2006',
    DATE '2007-01-21',
    'vertical',
    'active'
);

INSERT INTO public.area_versions (
    id,
    area_project_id,
    version_number,
    version_label,
    status,
    calculation_engine_version,
    normative_reference,
    normative_valid_from
) VALUES (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    1,
    'Fixture caso 1',
    'draft',
    'area-engine-mvp-1.2.1',
    'ABNT NBR 12721:2006',
    DATE '2007-01-21'
);

INSERT INTO public.area_version_blocks (
    id,
    area_version_id,
    code,
    name,
    sort_order
) VALUES (
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333',
    'T1',
    'Torre Unica',
    1
);

INSERT INTO public.area_version_floors (
    id,
    area_version_id,
    block_id,
    code,
    name,
    floor_type,
    sort_order,
    is_template,
    is_materialized,
    materialized_label,
    materialized_index
) VALUES (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    'TER',
    'Terreo',
    'ground',
    1,
    false,
    true,
    'Terreo',
    1
);

INSERT INTO public.area_version_units (
    id,
    area_version_id,
    block_id,
    primary_floor_id,
    code,
    unit_type,
    typology_code,
    is_autonomous,
    is_active,
    is_template,
    is_materialized,
    materialized_label,
    materialized_index
) VALUES
(
    '66666666-6666-6666-6666-666666666661',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    'Apto 101',
    'apartment',
    'Tipo A',
    true,
    true,
    false,
    true,
    'Apto 101',
    1
),
(
    '66666666-6666-6666-6666-666666666662',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    'Apto 102',
    'apartment',
    'Tipo A',
    true,
    true,
    false,
    true,
    'Apto 102',
    2
);

INSERT INTO public.area_version_spaces (
    id,
    area_version_id,
    block_id,
    floor_id,
    unit_id,
    code,
    name,
    use_class,
    private_nature,
    coverage_class,
    common_division_class,
    ownership_accounting_mode,
    real_area_m2_raw,
    coefficient_value,
    source_type,
    is_template,
    is_materialized,
    materialized_label,
    materialized_index
) VALUES
(
    '77777777-7777-7777-7777-777777777771',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666661',
    'U101-PRIV',
    'Area privativa Apto 101',
    'private',
    'main',
    'covered_standard',
    'not_applicable',
    'direct_unit',
    50.000000,
    1.00000000,
    'manual',
    false,
    true,
    'Area privativa Apto 101',
    1
),
(
    '77777777-7777-7777-7777-777777777772',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666662',
    'U102-PRIV',
    'Area privativa Apto 102',
    'private',
    'main',
    'covered_standard',
    'not_applicable',
    'direct_unit',
    50.000000,
    1.00000000,
    'manual',
    false,
    true,
    'Area privativa Apto 102',
    2
),
(
    '77777777-7777-7777-7777-777777777773',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    NULL,
    'HALL-COMUM',
    'Hall comum',
    'common',
    'not_applicable',
    'covered_standard',
    'proportional',
    'common_area',
    20.000000,
    1.00000000,
    'manual',
    false,
    true,
    'Hall comum',
    3
);

INSERT INTO public.area_version_common_distribution_scopes (
    id,
    area_version_id,
    common_space_id,
    distribution_scope,
    block_id,
    notes
) VALUES (
    '88888888-8888-8888-8888-888888888888',
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-7777-7777-777777777773',
    'global',
    NULL,
    'Fixture caso 1: hall distribuido globalmente'
);

-- Executa validacao e calculo.
SELECT public.validate_area_version('33333333-3333-3333-3333-333333333333') AS validation_before;
SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333333') AS calculation_result;

-- Resultados esperados:
-- QI: area real global = 120, area equivalente global = 120.
-- QII por unidade: QII_20 = 50, QII_31 = 0.5, QII_32 = 10, QII_37 = 60, QII_38 = 60.
-- IV-B por unidade: privativa principal = 50, comum = 10, total = 60, fracao = 50%.
SELECT
    'QI_GLOBAL' AS check_name,
    SUM(qi_17_floor_real_total_raw) AS actual_real_area,
    120.000000::numeric AS expected_real_area,
    SUM(qi_18_floor_equivalent_total_raw) AS actual_equivalent_area,
    120.000000::numeric AS expected_equivalent_area
FROM public.area_version_quadro_i_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333333';

SELECT
    unit_label,
    qii_20_private_covered_standard_raw AS actual_qii_20,
    50.000000::numeric AS expected_qii_20,
    qii_31_proportionality_coefficient_raw AS actual_qii_31,
    0.500000000000::numeric AS expected_qii_31,
    qii_32_common_prop_covered_standard_raw AS actual_qii_32,
    10.000000::numeric AS expected_qii_32,
    qii_37_unit_real_total_raw AS actual_qii_37,
    60.000000::numeric AS expected_qii_37,
    qii_38_unit_equivalent_total_raw AS actual_qii_38,
    60.000000::numeric AS expected_qii_38
FROM public.area_version_quadro_ii_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333333'
ORDER BY unit_label;

SELECT
    unit_label,
    qivb_b_private_main_area_raw AS actual_private_main,
    50.000000::numeric AS expected_private_main,
    qivb_e_common_area_raw AS actual_common_area,
    10.000000::numeric AS expected_common_area,
    qivb_f_real_total_area_raw AS actual_total_area,
    60.000000::numeric AS expected_total_area,
    fraction_percent_raw AS actual_fraction_percent,
    50.0000000000::numeric AS expected_fraction_percent
FROM public.area_version_quadro_ivb_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333333'
ORDER BY unit_label;

SELECT
    status,
    version_payload_hash IS NOT NULL AS has_payload_hash,
    version_identity_hash IS NULL AS identity_hash_is_null_before_lock
FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333333';

COMMIT;
