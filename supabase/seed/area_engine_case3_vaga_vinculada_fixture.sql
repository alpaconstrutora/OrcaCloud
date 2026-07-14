-- ============================================================
-- Fixture Caso 3 - Unidade com vaga acessoria vinculada
-- Motor Areas NBR 12721 MVP
-- ============================================================

BEGIN;
DO $
BEGIN
    IF current_setting('app.allow_area_engine_fixture', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Fixture de QA bloqueado. Execute SET app.allow_area_engine_fixture = ''on'' apenas em banco de teste antes de rodar este arquivo.'
            USING ERRCODE = 'P0001';
    END IF;
END $;
DELETE FROM public.organizations
WHERE id = '13131313-1313-1313-1313-131313131313';

INSERT INTO public.organizations (id, name, email)
VALUES ('13131313-1313-1313-1313-131313131313', 'Fixture Areas Caso 3', 'fixture-areas-case3@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222233', '13131313-1313-1313-1313-131313131313', 'Caso 3 - Vaga acessoria vinculada', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222233', 1, 'Fixture caso 3', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444443', '33333333-3333-3333-3333-333333333303', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('55555555-5555-5555-5555-555555555553', '33333333-3333-3333-3333-333333333303', '44444444-4444-4444-4444-444444444443', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1),
('55555555-5555-5555-5555-555555555554', '33333333-3333-3333-3333-333333333303', '44444444-4444-4444-4444-444444444443', 'SUB', 'Subsolo', 'basement', 0, false, true, 'Subsolo', 0);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES (
    '66666666-6666-6666-6666-666666666631',
    '33333333-3333-3333-3333-333333333303',
    '44444444-4444-4444-4444-444444444443',
    '55555555-5555-5555-5555-555555555553',
    'Apto 101',
    'apartment',
    'Tipo A',
    true,
    true,
    false,
    true,
    'Apto 101',
    1
);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
(
    '77777777-7777-7777-7777-777777777731',
    '33333333-3333-3333-3333-333333333303',
    '44444444-4444-4444-4444-444444444443',
    '55555555-5555-5555-5555-555555555553',
    '66666666-6666-6666-6666-666666666631',
    'U101-PRIV',
    'Area principal Apto 101',
    'private',
    'main',
    'covered_standard',
    'not_applicable',
    'direct_unit',
    80.000000,
    1.00000000,
    'manual',
    false,
    true,
    'Area principal Apto 101',
    1
),
(
    '77777777-7777-7777-7777-777777777732',
    '33333333-3333-3333-3333-333333333303',
    '44444444-4444-4444-4444-444444444443',
    '55555555-5555-5555-5555-555555555554',
    NULL,
    'VAGA-12',
    'Vaga 12 vinculada',
    'private',
    'accessory',
    'covered_different',
    'not_applicable',
    'linked_accessory',
    12.000000,
    0.50000000,
    'manual',
    false,
    true,
    'Vaga 12 vinculada',
    2
),
(
    '77777777-7777-7777-7777-777777777733',
    '33333333-3333-3333-3333-333333333303',
    '44444444-4444-4444-4444-444444444443',
    '55555555-5555-5555-5555-555555555553',
    NULL,
    'HALL-COMUM',
    'Hall comum',
    'common',
    'not_applicable',
    'covered_standard',
    'proportional',
    'common_area',
    8.000000,
    1.00000000,
    'manual',
    false,
    true,
    'Hall comum',
    3
);

INSERT INTO public.area_version_unit_accessory_links (id, area_version_id, parent_unit_id, accessory_space_id, accessory_unit_id, link_type, affects_private_area, affects_coefficient, legal_note)
VALUES (
    '99999999-9999-9999-9999-999999999993',
    '33333333-3333-3333-3333-333333333303',
    '66666666-6666-6666-6666-666666666631',
    '77777777-7777-7777-7777-777777777732',
    NULL,
    'parking',
    true,
    true,
    'Vaga vinculada ao Apto 101 para fixture do motor'
);

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES ('88888888-8888-8888-8888-888888888883', '33333333-3333-3333-3333-333333333303', '77777777-7777-7777-7777-777777777733', 'global', NULL, 'Fixture caso 3: hall distribuido globalmente');

SELECT public.validate_area_version('33333333-3333-3333-3333-333333333303') AS validation_before;
SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333303') AS calculation_result;

SELECT
    unit_label,
    qii_20_private_covered_standard_raw AS actual_qii_20,
    80.000000::numeric AS expected_qii_20,
    qii_21_private_nonstandard_or_uncovered_raw AS actual_qii_21,
    12.000000::numeric AS expected_qii_21,
    qii_22_private_equivalent_raw AS actual_qii_22,
    6.000000::numeric AS expected_qii_22,
    qii_23_private_real_total_raw AS actual_qii_23,
    92.000000::numeric AS expected_qii_23,
    qii_24_private_equivalent_total_raw AS actual_qii_24,
    86.000000::numeric AS expected_qii_24,
    qii_31_proportionality_coefficient_raw AS actual_qii_31,
    1.000000000000::numeric AS expected_qii_31,
    qii_32_common_prop_covered_standard_raw AS actual_qii_32,
    8.000000::numeric AS expected_qii_32,
    qii_37_unit_real_total_raw AS actual_qii_37,
    100.000000::numeric AS expected_qii_37,
    qii_38_unit_equivalent_total_raw AS actual_qii_38,
    94.000000::numeric AS expected_qii_38
FROM public.area_version_quadro_ii_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333303'
ORDER BY unit_label;

SELECT
    unit_label,
    qivb_b_private_main_area_raw AS actual_private_main,
    80.000000::numeric AS expected_private_main,
    qivb_c_private_accessory_area_raw AS actual_private_accessory,
    12.000000::numeric AS expected_private_accessory,
    qivb_d_private_total_area_raw AS actual_private_total,
    92.000000::numeric AS expected_private_total,
    qivb_e_common_area_raw AS actual_common_area,
    8.000000::numeric AS expected_common_area,
    qivb_f_real_total_area_raw AS actual_total_area,
    100.000000::numeric AS expected_total_area
FROM public.area_version_quadro_ivb_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333303'
ORDER BY unit_label;

SELECT status, version_payload_hash IS NOT NULL AS has_payload_hash, version_identity_hash IS NULL AS identity_hash_is_null_before_lock
FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333303';

COMMIT;

