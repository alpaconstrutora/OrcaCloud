-- ============================================================
-- Fixture Caso 5 - Erro: area comum sem divisao
-- Motor Areas NBR 12721 MVP
-- Esperado: MOTOR_012 e calculate_area_version retorna status failed
-- ============================================================

BEGIN;
DO $
BEGIN
    IF current_setting('app.allow_area_engine_fixture', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Fixture de QA bloqueado. Execute SET app.allow_area_engine_fixture = ''on'' apenas em banco de teste antes de rodar este arquivo.'
            USING ERRCODE = 'P0001';
    END IF;
END $;
DELETE FROM public.area_version_blocks
WHERE id = '44444444-4444-4444-4444-444444444445';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333305';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222235';

DELETE FROM public.organizations
WHERE id = '15151515-1515-1515-1515-151515151515';

INSERT INTO public.organizations (id, name, email)
VALUES ('15151515-1515-1515-1515-151515151515', 'Fixture Areas Caso 5', 'fixture-areas-case5@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222235', '15151515-1515-1515-1515-151515151515', 'Caso 5 - Erro comum sem divisao', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222235', 1, 'Fixture caso 5', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444445', '33333333-3333-3333-3333-333333333305', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('55555555-5555-5555-5555-555555555565', '33333333-3333-3333-3333-333333333305', '44444444-4444-4444-4444-444444444445', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('66666666-6666-6666-6666-666666666651', '33333333-3333-3333-3333-333333333305', '44444444-4444-4444-4444-444444444445', '55555555-5555-5555-5555-555555555565', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777751', '33333333-3333-3333-3333-333333333305', '44444444-4444-4444-4444-444444444445', '55555555-5555-5555-5555-555555555565', '66666666-6666-6666-6666-666666666651', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777752', '33333333-3333-3333-3333-333333333305', '44444444-4444-4444-4444-444444444445', '55555555-5555-5555-5555-555555555565', NULL, 'COMUM-SEM-DIV', 'Area comum sem tipo de divisao', 'common', 'not_applicable', 'covered_standard', 'not_applicable', 'common_area', 10.000000, 1.00000000, 'manual', false, true, 'Area comum sem divisao', 2);

WITH validation AS (
    SELECT public.validate_area_version('33333333-3333-3333-3333-333333333305') AS result
)
SELECT
    result AS validation_expected_motor_012,
    result->>'status' AS validation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "MOTOR_012")') AS has_motor_012
FROM validation;

WITH calculation AS (
    SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333305') AS result
)
SELECT
    result AS calculation_expected_failed,
    result->>'status' AS calculation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "MOTOR_012")') AS has_motor_012
FROM calculation;



COMMIT;




