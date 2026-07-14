-- ============================================================
-- Fixture Caso 8 - Determinismo e idempotencia do calculo
-- Motor Areas NBR 12721 MVP
-- Esperado: mesmo payload_hash em dois calculos e sem duplicar resultados
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
WHERE id = '44444444-4444-4444-4444-444444444448';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333308';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222238';

DELETE FROM public.organizations
WHERE id = '18181818-1818-1818-1818-181818181818';

INSERT INTO public.organizations (id, name, email)
VALUES ('18181818-1818-1818-1818-181818181818', 'Fixture Areas Caso 8', 'fixture-areas-case8@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222238', '18181818-1818-1818-1818-181818181818', 'Caso 8 - Determinismo do calculo', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333308', '22222222-2222-2222-2222-222222222238', 1, 'Fixture caso 8', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444448', '33333333-3333-3333-3333-333333333308', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('55555555-5555-5555-5555-555555555581', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1),
('55555555-5555-5555-5555-555555555582', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', 'PAV1', 'Pavimento 1', 'type', 2, false, true, 'Pavimento 1', 2);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('66666666-6666-6666-6666-666666666681', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555582', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1),
('66666666-6666-6666-6666-666666666682', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555582', 'Apto 102', 'apartment', 'Tipo B', true, true, false, true, 'Apto 102', 2);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777781', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555582', '66666666-6666-6666-6666-666666666681', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 60.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777782', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555582', '66666666-6666-6666-6666-666666666681', 'U101-VAR', 'Varanda Apto 101', 'private', 'main', 'uncovered', 'not_applicable', 'direct_unit', 8.000000, 0.75000000, 'manual', false, true, 'Varanda Apto 101', 2),
('77777777-7777-7777-7777-777777777783', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555582', '66666666-6666-6666-6666-666666666682', 'U102-PRIV', 'Area privativa Apto 102', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 40.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 102', 3),
('77777777-7777-7777-7777-777777777784', '33333333-3333-3333-3333-333333333308', '44444444-4444-4444-4444-444444444448', '55555555-5555-5555-5555-555555555581', NULL, 'HALL-COMUM', 'Hall comum', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 20.000000, 1.00000000, 'manual', false, true, 'Hall comum', 4);

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333308', '77777777-7777-7777-7777-777777777784', 'global', NULL, 'Fixture caso 8: hall distribuido globalmente');

CREATE OR REPLACE FUNCTION public.area_case8_run_determinism_check(p_area_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first_result JSONB;
    v_second_result JSONB;
    v_first_hash TEXT;
    v_second_hash TEXT;
    v_qi_count INTEGER;
    v_qii_count INTEGER;
    v_ivb_count INTEGER;
    v_fraction_count INTEGER;
BEGIN
    v_first_result := public.calculate_area_version(p_area_version_id);

    SELECT version_payload_hash INTO v_first_hash
      FROM public.area_versions
     WHERE id = p_area_version_id;

    v_second_result := public.calculate_area_version(p_area_version_id);

    SELECT version_payload_hash INTO v_second_hash
      FROM public.area_versions
     WHERE id = p_area_version_id;

    SELECT COUNT(*) INTO v_qi_count
      FROM public.area_version_quadro_i_rows
     WHERE area_version_id = p_area_version_id;

    SELECT COUNT(*) INTO v_qii_count
      FROM public.area_version_quadro_ii_rows
     WHERE area_version_id = p_area_version_id;

    SELECT COUNT(*) INTO v_ivb_count
      FROM public.area_version_quadro_ivb_rows
     WHERE area_version_id = p_area_version_id;

    SELECT COUNT(*) INTO v_fraction_count
      FROM public.area_version_fraction_ideals
     WHERE area_version_id = p_area_version_id;

    RETURN jsonb_build_object(
        'first_status', v_first_result->>'status',
        'second_status', v_second_result->>'status',
        'first_hash', v_first_hash,
        'second_hash', v_second_hash,
        'hashes_equal', v_first_hash = v_second_hash,
        'quadro_i_rows', v_qi_count,
        'quadro_ii_rows', v_qii_count,
        'quadro_ivb_rows', v_ivb_count,
        'fraction_rows', v_fraction_count,
        'no_duplicate_rows', v_qi_count = 2 AND v_qii_count = 2 AND v_ivb_count = 2 AND v_fraction_count = 2
    );
END;
$$;

WITH check_result AS (
    SELECT public.area_case8_run_determinism_check('33333333-3333-3333-3333-333333333308') AS result
)
SELECT
    result->>'first_status' AS first_status,
    result->>'second_status' AS second_status,
    (result->>'hashes_equal')::boolean AS hashes_equal,
    (result->>'quadro_i_rows')::integer AS quadro_i_rows,
    (result->>'quadro_ii_rows')::integer AS quadro_ii_rows,
    (result->>'quadro_ivb_rows')::integer AS quadro_ivb_rows,
    (result->>'fraction_rows')::integer AS fraction_rows,
    (result->>'no_duplicate_rows')::boolean AS no_duplicate_rows
FROM check_result;

DROP FUNCTION public.area_case8_run_determinism_check(UUID);

COMMIT;
