-- ============================================================
-- Fixture Caso 2 - Edificio com varanda de coeficiente diferente
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
WHERE id = '12121212-1212-1212-1212-121212121212';

INSERT INTO public.organizations (id, name, email)
VALUES ('12121212-1212-1212-1212-121212121212', 'Fixture Areas Caso 2', 'fixture-areas-case2@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222232', '12121212-1212-1212-1212-121212121212', 'Caso 2 - Varanda coeficiente 0.75', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222232', 1, 'Fixture caso 2', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333332', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('66666666-6666-6666-6666-666666666621', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1),
('66666666-6666-6666-6666-666666666622', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', 'Apto 102', 'apartment', 'Tipo A', true, true, false, true, 'Apto 102', 2);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777721', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666621', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777722', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666621', 'U101-VAR', 'Varanda Apto 101', 'private', 'main', 'uncovered', 'not_applicable', 'direct_unit', 10.000000, 0.75000000, 'manual', false, true, 'Varanda Apto 101', 2),
('77777777-7777-7777-7777-777777777723', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666622', 'U102-PRIV', 'Area privativa Apto 102', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 102', 3),
('77777777-7777-7777-7777-777777777724', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666622', 'U102-VAR', 'Varanda Apto 102', 'private', 'main', 'uncovered', 'not_applicable', 'direct_unit', 10.000000, 0.75000000, 'manual', false, true, 'Varanda Apto 102', 4),
('77777777-7777-7777-7777-777777777725', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', '55555555-5555-5555-5555-555555555552', NULL, 'HALL-COMUM', 'Hall comum', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 20.000000, 1.00000000, 'manual', false, true, 'Hall comum', 5);

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES ('88888888-8888-8888-8888-888888888882', '33333333-3333-3333-3333-333333333332', '77777777-7777-7777-7777-777777777725', 'global', NULL, 'Fixture caso 2: hall distribuido globalmente');

SELECT public.validate_area_version('33333333-3333-3333-3333-333333333332') AS validation_before;
SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333332') AS calculation_result;

SELECT
    unit_label,
    qii_20_private_covered_standard_raw AS actual_qii_20,
    50.000000::numeric AS expected_qii_20,
    qii_21_private_nonstandard_or_uncovered_raw AS actual_qii_21,
    10.000000::numeric AS expected_qii_21,
    qii_22_private_equivalent_raw AS actual_qii_22,
    7.500000::numeric AS expected_qii_22,
    qii_23_private_real_total_raw AS actual_qii_23,
    60.000000::numeric AS expected_qii_23,
    qii_24_private_equivalent_total_raw AS actual_qii_24,
    57.500000::numeric AS expected_qii_24,
    qii_31_proportionality_coefficient_raw AS actual_qii_31,
    0.500000000000::numeric AS expected_qii_31,
    qii_32_common_prop_covered_standard_raw AS actual_qii_32,
    10.000000::numeric AS expected_qii_32,
    qii_37_unit_real_total_raw AS actual_qii_37,
    70.000000::numeric AS expected_qii_37,
    qii_38_unit_equivalent_total_raw AS actual_qii_38,
    67.500000::numeric AS expected_qii_38
FROM public.area_version_quadro_ii_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333332'
ORDER BY unit_label;

SELECT
    unit_label,
    qivb_b_private_main_area_raw AS actual_private_main,
    60.000000::numeric AS expected_private_main,
    qivb_e_common_area_raw AS actual_common_area,
    10.000000::numeric AS expected_common_area,
    qivb_f_real_total_area_raw AS actual_total_area,
    70.000000::numeric AS expected_total_area
FROM public.area_version_quadro_ivb_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333332'
ORDER BY unit_label;

SELECT status, version_payload_hash IS NOT NULL AS has_payload_hash, version_identity_hash IS NULL AS identity_hash_is_null_before_lock
FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333332';

COMMIT;
