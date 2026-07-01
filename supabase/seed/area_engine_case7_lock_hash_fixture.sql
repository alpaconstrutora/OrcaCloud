-- ============================================================
-- Fixture Caso 7 - Aprovacao, lock, hash documental e bloqueio
-- Motor Areas NBR 12721 MVP
-- ============================================================

BEGIN;

UPDATE public.area_versions
   SET status = 'draft',
       locked_at = NULL,
       version_identity_hash = NULL
 WHERE id = '33333333-3333-3333-3333-333333333307';

DELETE FROM public.area_version_blocks
WHERE id = '44444444-4444-4444-4444-444444444447';

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333307';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222237';

DELETE FROM public.organizations
WHERE id = '17171717-1717-1717-1717-171717171717';

INSERT INTO public.organizations (id, name, email)
VALUES ('17171717-1717-1717-1717-171717171717', 'Fixture Areas Caso 7', 'fixture-areas-case7@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222237', '17171717-1717-1717-1717-171717171717', 'Caso 7 - Lock e hash documental', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'vertical', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333307', '22222222-2222-2222-2222-222222222237', 1, 'Fixture caso 7', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES ('44444444-4444-4444-4444-444444444447', '33333333-3333-3333-3333-333333333307', 'T1', 'Torre Unica', 1);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES ('55555555-5555-5555-5555-555555555567', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', 'TER', 'Terreo', 'ground', 1, false, true, 'Terreo', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('66666666-6666-6666-6666-666666666671', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', '55555555-5555-5555-5555-555555555567', 'Apto 101', 'apartment', 'Tipo A', true, true, false, true, 'Apto 101', 1),
('66666666-6666-6666-6666-666666666672', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', '55555555-5555-5555-5555-555555555567', 'Apto 102', 'apartment', 'Tipo A', true, true, false, true, 'Apto 102', 2);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777771', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', '55555555-5555-5555-5555-555555555567', '66666666-6666-6666-6666-666666666671', 'U101-PRIV', 'Area privativa Apto 101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 101', 1),
('77777777-7777-7777-7777-777777777772', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', '55555555-5555-5555-5555-555555555567', '66666666-6666-6666-6666-666666666672', 'U102-PRIV', 'Area privativa Apto 102', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 50.000000, 1.00000000, 'manual', false, true, 'Area privativa Apto 102', 2),
('77777777-7777-7777-7777-777777777773', '33333333-3333-3333-3333-333333333307', '44444444-4444-4444-4444-444444444447', '55555555-5555-5555-5555-555555555567', NULL, 'HALL-COMUM', 'Hall comum', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 20.000000, 1.00000000, 'manual', false, true, 'Hall comum', 3);

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES ('88888888-8888-8888-8888-888888888887', '33333333-3333-3333-3333-333333333307', '77777777-7777-7777-7777-777777777773', 'global', NULL, 'Fixture caso 7: hall distribuido globalmente');

SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333307') AS calculation_result;

SELECT
    status AS status_after_calculation,
    version_payload_hash IS NOT NULL AS has_payload_hash,
    version_identity_hash IS NULL AS identity_hash_is_null_before_lock
FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333307';

SELECT public.approve_area_version('33333333-3333-3333-3333-333333333307', 'technical', 'Fixture tecnico caso 7') AS technical_approval_result;
SELECT public.approve_area_version('33333333-3333-3333-3333-333333333307', 'legal', 'Fixture juridico caso 7') AS legal_approval_result;
SELECT public.lock_area_version('33333333-3333-3333-3333-333333333307') AS lock_result;

CREATE OR REPLACE FUNCTION public.area_case7_try_locked_mutation(p_space_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.area_version_spaces
       SET real_area_m2_raw = 51.000000
     WHERE id = p_space_id;

    RETURN jsonb_build_object(
        'mutation_blocked', false,
        'sqlstate', NULL,
        'message', 'Mutation unexpectedly succeeded'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'mutation_blocked', true,
        'sqlstate', SQLSTATE,
        'message', SQLERRM
    );
END;
$$;

WITH mutation AS (
    SELECT public.area_case7_try_locked_mutation('77777777-7777-7777-7777-777777777771') AS result
)
SELECT
    av.status,
    av.version_payload_hash IS NOT NULL AS has_payload_hash,
    av.version_identity_hash IS NOT NULL AS has_identity_hash_after_lock,
    av.locked_at IS NOT NULL AS has_locked_at,
    COUNT(a.id) FILTER (WHERE a.status = 'approved') AS approved_count,
    EXISTS (
        SELECT 1 FROM public.area_version_audit_logs l
        WHERE l.area_version_id = av.id
          AND l.action = 'lock'
    ) AS has_lock_audit,
    (mutation.result->>'mutation_blocked')::boolean AS mutation_blocked,
    mutation.result->>'sqlstate' AS mutation_sqlstate
FROM public.area_versions av
CROSS JOIN mutation
LEFT JOIN public.area_version_approvals a ON a.area_version_id = av.id
WHERE av.id = '33333333-3333-3333-3333-333333333307'
GROUP BY av.id, mutation.result;

DROP FUNCTION public.area_case7_try_locked_mutation(UUID);
COMMIT;



