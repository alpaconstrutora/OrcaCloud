-- ============================================================
-- Fixture Caso 6 - Erro: area nao padrao sem coeficiente
-- Motor Areas NBR 12721 MVP
-- Esperado: MOTOR_007 e calculate_area_version retorna status failed
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
WHERE id = '44444444-4444-4444-4444-444444444446';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333306';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222236';

DELETE FROM public.organizations
WHERE id = '16161616-1616-1616-1616-161616161616';

INSERT INTO public.organizations (id, name, email)
VALUES ('16161616-1616-1616-1616-161616161616', 'Fixture Areas Caso 6', 'fixture-areas-case6@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222236', '16161616-1616-1616-1616-161616161616', 'Caso 6 - Erro coeficiente ausente', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222236', 1, 'Fixture caso 6', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444446', '33333333-3333-3333-3333-333333333306', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('55555555-5555-5555-5555-555555555566', '33333333-3333-3333-3333-333333333306', '44444444-4444-4444-4444-444444444446', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('66666666-6666-6666-6666-666666666661', '33333333-3333-3333-3333-333333333306', '44444444-4444-4444-4444-444444444446', '55555555-5555-5555-5555-555555555566', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777761', '33333333-3333-3333-3333-333333333306', '44444444-4444-4444-4444-444444444446', '55555555-5555-5555-5555-555555555566', '66666666-6666-6666-6666-666666666661', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777762', '33333333-3333-3333-3333-333333333306', '44444444-4444-4444-4444-444444444446', '55555555-5555-5555-5555-555555555566', '66666666-6666-6666-6666-666666666661', 'U101-VAR', 'Varanda sem coeficiente', 'private', 'main', 'uncovered', 'not_applicable', 'direct_unit', 10.000000, NULL, 'manual', false, true, 'Varanda sem coeficiente', 2);

WITH validation AS (
    SELECT public.validate_area_version('33333333-3333-3333-3333-333333333306') AS result
)
SELECT
    result AS validation_expected_motor_007,
    result->>'status' AS validation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "MOTOR_007")') AS has_motor_007
FROM validation;

WITH calculation AS (
    SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333306') AS result
)
SELECT
    result AS calculation_expected_failed,
    result->>'status' AS calculation_status,
    jsonb_path_exists(result, '$.blocking_errors[*] ? (@.code == "MOTOR_007")') AS has_motor_007
FROM calculation;



COMMIT;




