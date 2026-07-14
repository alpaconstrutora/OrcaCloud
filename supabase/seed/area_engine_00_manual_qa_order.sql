-- ============================================================
-- QA Manual - Motor de Areas NBR 12721
-- Ordem de aplicacao manual das migrations e fixtures
-- ============================================================
--
-- 1) Aplique as migrations abaixo, nesta ordem:
--
-- supabase/migrations/20261231000000_area_engine_nbr12721_mvp.sql
-- supabase/migrations/20261231000001_area_engine_nbr12721_functions.sql
-- supabase/migrations/20261231000002_area_engine_hash_search_path_fix.sql
-- supabase/migrations/20261231000004_area_engine_draft_validation_constraints.sql
-- supabase/migrations/20261231000005_area_engine_lifecycle_functions.sql
--
-- 2) Fixtures sao SOMENTE para banco de QA/teste.
--    Antes de cada fixture, habilite explicitamente a sessao:
--
--    SET app.allow_area_engine_fixture = 'on';
--
--    Sem essa flag, os fixtures param antes de criar dados.
--
-- 3) Rode os fixtures abaixo, um por vez, nesta ordem:
--
-- supabase/seed/area_engine_case1_fixture.sql
-- supabase/seed/area_engine_case2_varanda_fixture.sql
-- supabase/seed/area_engine_case3_vaga_vinculada_fixture.sql
-- supabase/seed/area_engine_case4_common_nonprop_fixture.sql
-- supabase/seed/area_engine_case5_error_common_without_division_fixture.sql
-- supabase/seed/area_engine_case6_error_missing_coefficient_fixture.sql
-- supabase/seed/area_engine_case7_lock_hash_fixture.sql
-- supabase/seed/area_engine_case8_deterministic_recalculation_fixture.sql
-- supabase/seed/area_engine_case9_accounting_closure_fixture.sql
-- supabase/seed/area_engine_case10_error_double_count_parking_fixture.sql
--
-- Observacao: nao execute este arquivo como substituto dos fixtures.
-- Ele serve como checklist SQL e contem apenas verificacoes auxiliares.
-- ============================================================

-- Verificacao 1: funcoes essenciais instaladas.
SELECT
    to_regprocedure('public.validate_area_version(uuid)') IS NOT NULL AS has_validate_area_version,
    to_regprocedure('public.calculate_area_version(uuid)') IS NOT NULL AS has_calculate_area_version,
    to_regprocedure('public.approve_area_version(uuid,public.area_approval_type,text)') IS NOT NULL AS has_approve_area_version,
    to_regprocedure('public.lock_area_version(uuid)') IS NOT NULL AS has_lock_area_version;

-- Verificacao 2: tabelas essenciais instaladas.
SELECT
    to_regclass('public.area_projects') IS NOT NULL AS has_area_projects,
    to_regclass('public.area_versions') IS NOT NULL AS has_area_versions,
    to_regclass('public.area_version_blocks') IS NOT NULL AS has_area_version_blocks,
    to_regclass('public.area_version_floors') IS NOT NULL AS has_area_version_floors,
    to_regclass('public.area_version_units') IS NOT NULL AS has_area_version_units,
    to_regclass('public.area_version_spaces') IS NOT NULL AS has_area_version_spaces,
    to_regclass('public.area_version_unit_accessory_links') IS NOT NULL AS has_area_version_unit_accessory_links,
    to_regclass('public.area_version_common_allocations') IS NOT NULL AS has_area_version_common_allocations,
    to_regclass('public.area_version_common_distribution_scopes') IS NOT NULL AS has_area_version_common_distribution_scopes,
    to_regclass('public.area_version_quadro_i_rows') IS NOT NULL AS has_area_version_quadro_i_rows,
    to_regclass('public.area_version_quadro_ii_rows') IS NOT NULL AS has_area_version_quadro_ii_rows,
    to_regclass('public.area_version_quadro_ivb_rows') IS NOT NULL AS has_area_version_quadro_ivb_rows,
    to_regclass('public.area_version_fraction_ideals') IS NOT NULL AS has_area_version_fraction_ideals,
    to_regclass('public.area_version_audit_logs') IS NOT NULL AS has_area_version_audit_logs,
    to_regclass('public.area_version_approvals') IS NOT NULL AS has_area_version_approvals;

-- Verificacao 3: resumo dos fixtures depois de rodar todos os casos.
SELECT
    COUNT(*) FILTER (WHERE name ILIKE 'Caso %' OR name ILIKE 'Fixture Areas%') AS fixture_projects,
    COUNT(*) AS total_area_projects
FROM public.area_projects;

SELECT
    status,
    COUNT(*) AS version_count
FROM public.area_versions
GROUP BY status
ORDER BY status;

-- Verificacao 4: hashes tecnicos/documentais dos casos principais.
SELECT
    av.id,
    ap.name AS project_name,
    av.status,
    av.version_payload_hash IS NOT NULL AS has_payload_hash,
    av.version_identity_hash IS NOT NULL AS has_identity_hash,
    av.locked_at IS NOT NULL AS has_locked_at
FROM public.area_versions av
JOIN public.area_projects ap ON ap.id = av.area_project_id
WHERE av.id IN (
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333332',
    '33333333-3333-3333-3333-333333333303',
    '33333333-3333-3333-3333-333333333304',
    '33333333-3333-3333-3333-333333333307',
    '33333333-3333-3333-3333-333333333308',
    '33333333-3333-3333-3333-333333333309'
)
ORDER BY ap.name;