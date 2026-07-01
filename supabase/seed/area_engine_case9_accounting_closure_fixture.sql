-- ============================================================
-- Fixture Caso 9 - Fechamento contabil dos Quadros e fracoes
-- Motor Areas NBR 12721 MVP
-- Esperado: coeficientes/facoes somam 1 e totais QII x IV-B fecham
-- ============================================================

BEGIN;

DELETE FROM public.area_version_blocks
WHERE id IN (
    '44444444-4444-4444-4444-444444444491',
    '44444444-4444-4444-4444-444444444492'
);

DELETE FROM public.area_versions
WHERE id = '33333333-3333-3333-3333-333333333309';

DELETE FROM public.area_projects
WHERE id = '22222222-2222-2222-2222-222222222239';

DELETE FROM public.organizations
WHERE id = '19191919-1919-1919-1919-191919191919';

INSERT INTO public.organizations (id, name, email)
VALUES ('19191919-1919-1919-1919-191919191919', 'Fixture Areas Caso 9', 'fixture-areas-case9@example.test');

INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES ('22222222-2222-2222-2222-222222222239', '19191919-1919-1919-1919-191919191919', 'Caso 9 - Fechamento contabil', 'ABNT NBR 12721:2006', DATE '2007-01-21', 'mixed', 'active');

INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES ('33333333-3333-3333-3333-333333333309', '22222222-2222-2222-2222-222222222239', 1, 'Fixture caso 9', 'draft', 'area-engine-mvp-1.2.1', 'ABNT NBR 12721:2006', DATE '2007-01-21');

INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES
('44444444-4444-4444-4444-444444444491', '33333333-3333-3333-3333-333333333309', 'A', 'Bloco A', 1),
('44444444-4444-4444-4444-444444444492', '33333333-3333-3333-3333-333333333309', 'B', 'Bloco B', 2);

INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('55555555-5555-5555-5555-555555555591', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444491', 'TER-A', 'Terreo Bloco A', 'ground', 1, false, true, 'Terreo Bloco A', 1),
('55555555-5555-5555-5555-555555555592', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444492', 'TER-B', 'Terreo Bloco B', 'ground', 1, false, true, 'Terreo Bloco B', 1);

INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('66666666-6666-6666-6666-666666666691', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444491', '55555555-5555-5555-5555-555555555591', 'A-101', 'apartment', 'Tipo A', true, true, false, true, 'A-101', 1),
('66666666-6666-6666-6666-666666666692', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444492', '55555555-5555-5555-5555-555555555592', 'B-101', 'apartment', 'Tipo B', true, true, false, true, 'B-101', 2);

INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES
('77777777-7777-7777-7777-777777777791', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444491', '55555555-5555-5555-5555-555555555591', '66666666-6666-6666-6666-666666666691', 'A101-PRIV', 'Area privativa A-101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 100.000000, 1.00000000, 'manual', false, true, 'Area privativa A-101', 1),
('77777777-7777-7777-7777-777777777792', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444492', '55555555-5555-5555-5555-555555555592', '66666666-6666-6666-6666-666666666692', 'B101-PRIV', 'Area privativa B-101', 'private', 'main', 'covered_standard', 'not_applicable', 'direct_unit', 300.000000, 1.00000000, 'manual', false, true, 'Area privativa B-101', 2),
('77777777-7777-7777-7777-777777777793', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444491', '55555555-5555-5555-5555-555555555591', NULL, 'HALL-A', 'Hall proporcional Bloco A', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 20.000000, 1.00000000, 'manual', false, true, 'Hall Bloco A', 3),
('77777777-7777-7777-7777-777777777794', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444492', '55555555-5555-5555-5555-555555555592', NULL, 'HALL-B', 'Hall proporcional Bloco B', 'common', 'not_applicable', 'covered_standard', 'proportional', 'common_area', 60.000000, 1.00000000, 'manual', false, true, 'Hall Bloco B', 4),
('77777777-7777-7777-7777-777777777795', '33333333-3333-3333-3333-333333333309', '44444444-4444-4444-4444-444444444491', '55555555-5555-5555-5555-555555555591', NULL, 'DEP-A', 'Deposito comum nao proporcional A-101', 'common', 'not_applicable', 'covered_standard', 'non_proportional', 'common_area', 10.000000, 1.00000000, 'manual', false, true, 'Deposito A-101', 5);

INSERT INTO public.area_version_common_allocations (id, area_version_id, common_space_id, target_unit_id, allocation_method, allocated_real_area_m2_raw, justification)
VALUES ('88888888-8888-8888-8888-888888888891', '33333333-3333-3333-3333-333333333309', '77777777-7777-7777-7777-777777777795', '66666666-6666-6666-6666-666666666691', 'fixed_area', 10.000000, 'Deposito A atribuido a unidade A-101');

INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id, notes)
VALUES
('88888888-8888-8888-8888-888888888892', '33333333-3333-3333-3333-333333333309', '77777777-7777-7777-7777-777777777793', 'block', '44444444-4444-4444-4444-444444444491', 'Hall proporcional do Bloco A'),
('88888888-8888-8888-8888-888888888893', '33333333-3333-3333-3333-333333333309', '77777777-7777-7777-7777-777777777794', 'block', '44444444-4444-4444-4444-444444444492', 'Hall proporcional do Bloco B');

SELECT public.calculate_area_version('33333333-3333-3333-3333-333333333309') AS calculation_result;

WITH sums AS (
    SELECT
        (SELECT COALESCE(SUM(qii_31_proportionality_coefficient_raw), 0) FROM public.area_version_quadro_ii_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS coefficient_sum,
        (SELECT COALESCE(SUM(fraction_decimal_raw), 0) FROM public.area_version_fraction_ideals WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS fraction_sum,
        (SELECT COALESCE(SUM(qii_37_unit_real_total_raw), 0) FROM public.area_version_quadro_ii_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS qii_real_total,
        (SELECT COALESCE(SUM(qivb_f_real_total_area_raw), 0) FROM public.area_version_quadro_ivb_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS qivb_real_total,
        (SELECT COALESCE(SUM(qii_38_unit_equivalent_total_raw), 0) FROM public.area_version_quadro_ii_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS qii_equivalent_total,
        (SELECT COALESCE(SUM(qi_18_floor_equivalent_total_raw), 0) FROM public.area_version_quadro_i_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS qi_equivalent_total,
        (SELECT COUNT(*) FROM public.area_version_quadro_i_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS quadro_i_rows,
        (SELECT COUNT(*) FROM public.area_version_quadro_ii_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS quadro_ii_rows,
        (SELECT COUNT(*) FROM public.area_version_quadro_ivb_rows WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS quadro_ivb_rows,
        (SELECT COUNT(*) FROM public.area_version_fraction_ideals WHERE area_version_id = '33333333-3333-3333-3333-333333333309') AS fraction_rows
)
SELECT
    coefficient_sum,
    abs(coefficient_sum - 1) <= 0.000000000001 AS coefficient_sum_is_one,
    fraction_sum,
    abs(fraction_sum - 1) <= 0.000000000001 AS fraction_sum_is_one,
    qii_real_total,
    qivb_real_total,
    abs(qii_real_total - qivb_real_total) <= 0.000001 AS qii_matches_ivb_real_total,
    qii_equivalent_total,
    qi_equivalent_total,
    abs(qii_equivalent_total - qi_equivalent_total) <= 0.000001 AS qii_matches_qi_equivalent_total,
    quadro_i_rows,
    quadro_ii_rows,
    quadro_ivb_rows,
    fraction_rows
FROM sums;

COMMIT;
