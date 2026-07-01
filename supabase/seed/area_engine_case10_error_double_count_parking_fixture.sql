-- ============================================================
-- Fixture Caso 10 - Erro: vaga contada por unit_id e por vinculo
-- Motor Areas NBR 12721 MVP
-- Esperado: ACC_VAL_003 e calculate_area_version retorna status failed
-- ============================================================

BEGIN;

DELETE FROM public.area_version_blocks
WHERE id = '44444444-4444-4444-4444-444444444410';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333310';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222210';

DELETE FROM public.organizations
WHERE id = '10101010-1010-1010-1010-101010101010';

INSERT INTO public.organizations (id, name, email)
VALUES ('10101010-1010-1010-1010-101010101010', 'Fixture Areas Caso 10', 'fixture-areas-case10@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222210', '10101010-1010-1010-1010-101010101010', 'Caso 10 - Erro dupla contagem vaga', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333310', '22222222-2222-2222-2222-222222222210', 1, 'Fixture caso 10', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444410', '33333333-3333-3333-3333-333333333310', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('55555555-5555-5555-5555-555555555510', '33333333-3333-3333-3333-333333333310', '44444444-4444-4444-4444-444444444410', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1),
('55555555-5555-5555-5555-555555555511', '33333333-3333-3333-3333-333333333310', '44444444-4444-4444-4444-444444444410', 'SUB', 'Subsolo', 'basement', 0, false, true, 'Subsolo', 0);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('66666666-6666-6666-6666-666666666610', '33333333-3333-3333-3333-333333333310', '44444444-4444-4444-4444-444444444410', '55555555-5555-5555-5555-555555555510', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777710', '33333333-3333-3333-3333-333333333310', '44444444-4444-4444-4444-444444444410', '55555555-5555-5555-5555-555555555510', '66666666-6666-6666-6666-666666666610', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 80.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777711', '33333333-3333-3333-3333-333333333310', '44444444-4444-4444-4444-444444444410', '55555555-5555-5555-5555-555555555511', '66666666-6666-6666-6666-666666666610', 'VAGA-12', 'Vaga 12 cadastrada na unidade e vinculada', 'private', 'accessory', 'covered_different', 'not_applicable', 'direct_unit', 12.000000, 0.50000000, 'manual', false, true, 'Vaga 12', 2);

INSERT INTO public.area_version_unit_accessory_links (id, area_version_id, parent_unit_id, accessory_space_id, accessory_unit_id, link_type, affects_private_area, affects_coefficient, legal_note)
VALUES ('99999999-9999-9999-9999-999999999910', '33333333-3333-3333-3333-333333333310', '66666666-6666-6666-6666-666666666610', '77777777-7777-7777-7777-777777777711', NULL, 'parking', true, true, 'Fixture invalido: vaga tambem tem unit_id preenchido');

WITH validation AS (
    SELECT public.validate_area_version('33333333-3333-3333-3333-333333333310') AS result
)
SELECT
    result AS validation_expected_acc_val_003,
    result->>'status' AS validation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "ACC_VAL_003")') AS has_acc_val_003
FROM validation;

WITH calculation AS (
    SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333310') AS result
)
SELECT
    result AS calculation_expected_failed,
    result->>'status' AS calculation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "ACC_VAL_003")') AS has_acc_val_003
FROM calculation;



COMMIT;




