-- ============================================================
-- Fixture Caso 4 - Area comum nao proporcional atribuida
-- Motor Areas NBR 12721 MVP
-- ============================================================

BEGIN;

DELETE FROM public.area_version_blocks
WHERE id = '44444444-4444-4444-4444-444444444444';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333304';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222234';

DELETE FROM public.organizations
WHERE id = '14141414-1414-1414-1414-141414141414';

INSERT INTO public.organizations (id, name, email)
VALUES ('14141414-1414-1414-1414-141414141414', 'Fixture Areas Caso 4', 'fixture-areas-case4@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222234', '14141414-1414-1414-1414-141414141414', 'Caso 4 - Area comum nao proporcional', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'mixed', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222234', 1, 'Fixture caso 4', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333304', 'B1', 'Bloco Comercial', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('66666666-6666-6666-6666-666666666641', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'Loja 01', 'store', 'Loja', true, true, false, true, 'Loja 01', 1),
('66666666-6666-6666-6666-666666666642', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'Loja 02', 'store', 'Loja', true, true, false, true, 'Loja 02', 2);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777741', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666641', 'L01-PRIV', 'Area privativa Loja 01', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 100.000000, 1.00000000, 'manual', false, true, 'Area privativa Loja 01', 1),
('77777777-7777-7777-7777-777777777742', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666642', 'L02-PRIV', 'Area privativa Loja 02', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 100.000000, 1.00000000, 'manual', false, true, 'Area privativa Loja 02', 2),
('77777777-7777-7777-7777-777777777743', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', NULL, 'DEP-L01', 'Deposito comum de uso exclusivo Loja 01', 'common', 'not_applicable', 'covered_standard', 'non_proportional', 'common_area', 20.000000, 1.00000000, 'manual', false, true, 'Deposito Loja 01', 3),
('77777777-7777-7777-7777-777777777744', '33333333-3333-3333-3333-333333333304', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', NULL, 'HALL-COMUM', 'Hall comum proporcional', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 40.000000, 1.00000000, 'manual', false, true, 'Hall comum proporcional', 4);

INSERT INTO public.area_version_common_allocations (id, area_version_id, common_space_id, target_unit_id, allocation_method, allocated_real_area_m2_raw, justification)
VALUES ('88888888-8888-8888-8888-888888888841', '33333333-3333-3333-3333-333333333304', '77777777-7777-7777-7777-777777777743', '66666666-6666-6666-6666-666666666641', 'fixed_area', 20.000000, 'Deposito comum atribuido integralmente a Loja 01');

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES ('88888888-8888-8888-8888-888888888842', '33333333-3333-3333-3333-333333333304', '77777777-7777-7777-7777-777777777744', 'global', NULL, 'Hall proporcional distribuido sobre q30');

SELECT public.validate_area_version('33333333-3333-3333-3333-333333333304') AS validation_before;
SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333304') AS calculation_result;

SELECT
    unit_label,
    qii_20_private_covered_standard_raw AS actual_qii_20,
    100.000000::numeric AS expected_qii_20,
    qii_25_common_nonprop_covered_standard_raw AS actual_qii_25,
    CASE WHEN unit_label = 'Loja 01' THEN 20.000000 ELSE 0.000000 END::numeric AS expected_qii_25,
    qii_28_common_nonprop_real_total_raw AS actual_qii_28,
    CASE WHEN unit_label = 'Loja 01' THEN 20.000000 ELSE 0.000000 END::numeric AS expected_qii_28,
    qii_29_common_nonprop_equivalent_total_raw AS actual_qii_29,
    CASE WHEN unit_label = 'Loja 01' THEN 20.000000 ELSE 0.000000 END::numeric AS expected_qii_29,
    qii_30_nonprop_equivalent_total_raw AS actual_qii_30,
    CASE WHEN unit_label = 'Loja 01' THEN 120.000000 ELSE 100.000000 END::numeric AS expected_qii_30,
    qii_31_proportionality_coefficient_raw AS actual_qii_31,
    CASE WHEN unit_label = 'Loja 01' THEN 0.545454545455 ELSE 0.454545454545 END::numeric AS expected_qii_31,
    qii_32_common_prop_covered_standard_raw AS actual_qii_32,
    CASE WHEN unit_label = 'Loja 01' THEN 21.818182 ELSE 18.181818 END::numeric AS expected_qii_32,
    qii_37_unit_real_total_raw AS actual_qii_37,
    CASE WHEN unit_label = 'Loja 01' THEN 141.818182 ELSE 118.181818 END::numeric AS expected_qii_37
FROM public.area_version_quadro_ii_rows
WHERE area_version_id = '33333333-3333-3333-3333-333333333304'
ORDER BY unit_label;

SELECT status, version_payload_hash IS NOT NULL AS has_payload_hash, version_identity_hash IS NULL AS identity_hash_is_null_before_lock
FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333304';

COMMIT;



