-- ============================================================================
-- Áreas NBR 12721 — DROP DO MOTOR DE ÁREAS ANTIGO
-- (14/10/2026, Fase 10.5 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md)
--
-- Os Quadros NBR 12721 moram na Planta Inteligente desde as Fases 0–9 (motor TS
-- puro conferido contra a testemunha deste SQL; versão congelada e aprovada;
-- PDF/XLSX/memorial; fração de volta ao Empreendimento). O código do Motor saiu
-- em 848d288a; ESTA migration só roda com a produção já nesse código.
--
-- Decisão do usuário (13/10/2026): os 2 projetos e 3 versões do Motor "Pode
-- excluir" (nunca aprovados). Backup completo antes do DROP, fora do git:
-- C:\D\ORÇACLOUD\backups\area_engine_2026-10-14\ (18 tabelas em JSON + as 9
-- funções como estavam no banco).
--
-- Inventário conferido em 14/10/2026: nenhuma view, gatilho de fora, cron ou
-- coluna de outra tabela usa os tipos/tabelas area_*; a ÚNICA dependência de
-- fora é empreendimento_units.area_engine_version_id (0 linhas preenchidas).
--
-- SEM CASCADE em lugar nenhum: se surgir uma dependência que o inventário não
-- viu, o DROP falha e a transação inteira desfaz — melhor que levar junto.
--
-- Também sai empreendimento_types.motor_category (só o Motor a lia; o código
-- deixou de gravá-la em 848d288a, com DEFAULT desde aplicar_20271014300000).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Nada novo desde a análise: exatamente os 2 projetos e 3 versões autorizados.
DO $$
DECLARE np INT; nv INT;
BEGIN
    SELECT count(*) INTO np FROM public.area_projects;
    SELECT count(*) INTO nv FROM public.area_versions;
    IF np <> 2 OR nv <> 3 THEN
        RAISE EXCEPTION 'esperava 2 projetos e 3 versões do Motor de Áreas, achei % e % — conferir antes de apagar', np, nv;
    END IF;
    IF EXISTS (SELECT 1 FROM public.empreendimento_units WHERE area_engine_version_id IS NOT NULL) THEN
        RAISE EXCEPTION 'há unidade de empreendimento apontando para versão do Motor antigo — conferir antes de apagar';
    END IF;
END $$;

-- A única dependência de fora (a FK some com a coluna).
ALTER TABLE public.empreendimento_units DROP COLUMN IF EXISTS area_engine_version_id;

DROP TABLE IF EXISTS
    public.area_materialization_batches,
    public.area_version_approvals,
    public.area_version_audit_logs,
    public.area_version_blocks,
    public.area_version_coefficients_used,
    public.area_version_common_allocations,
    public.area_version_common_distribution_scopes,
    public.area_version_export_files,
    public.area_version_floors,
    public.area_version_fraction_ideals,
    public.area_version_quadro_i_rows,
    public.area_version_quadro_ii_rows,
    public.area_version_quadro_ivb_rows,
    public.area_version_spaces,
    public.area_version_unit_accessory_links,
    public.area_version_units,
    public.area_versions,
    public.area_projects;

DROP FUNCTION IF EXISTS public.approve_area_version(p_area_version_id uuid, p_approval_type area_approval_type, p_comments text);
DROP FUNCTION IF EXISTS public.area_jsonb_append(p_array jsonb, p_value jsonb);
DROP FUNCTION IF EXISTS public.area_prevent_locked_version_mutation();
DROP FUNCTION IF EXISTS public.area_rls_can_access_version(p_area_version_id uuid);
DROP FUNCTION IF EXISTS public.area_touch_updated_at();
DROP FUNCTION IF EXISTS public.calculate_area_version(p_area_version_id uuid);
DROP FUNCTION IF EXISTS public.lock_area_version(p_area_version_id uuid);
DROP FUNCTION IF EXISTS public.supersede_area_version(p_area_version_id uuid, p_reason text);
DROP FUNCTION IF EXISTS public.validate_area_version(p_area_version_id uuid);

DROP TYPE IF EXISTS
    public.area_accessory_link_type,
    public.area_approval_status,
    public.area_approval_type,
    public.area_audit_action,
    public.area_coefficient_source,
    public.area_common_allocation_method,
    public.area_common_division_class,
    public.area_coverage_class,
    public.area_distribution_scope,
    public.area_export_scope,
    public.area_export_type,
    public.area_floor_type,
    public.area_fraction_derivation_method,
    public.area_materialization_source_entity,
    public.area_ownership_accounting_mode,
    public.area_private_nature,
    public.area_project_status,
    public.area_project_type,
    public.area_source_type,
    public.area_unit_type,
    public.area_use_class,
    public.area_version_status;

ALTER TABLE public.empreendimento_types DROP COLUMN IF EXISTS motor_category;

-- Conferência dentro da transação: sobrou alguma coisa, desfaz tudo.
DO $$
BEGIN
    IF to_regclass('public.area_versions') IS NOT NULL OR to_regclass('public.area_projects') IS NOT NULL THEN
        RAISE EXCEPTION 'tabelas do Motor ainda existem';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND (p.proname LIKE '%area\_version%' OR p.proname LIKE 'area\_%')) THEN
        RAISE EXCEPTION 'funções do Motor ainda existem';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typname LIKE 'area\_%' AND t.typtype = 'e') THEN
        RAISE EXCEPTION 'tipos enum do Motor ainda existem';
    END IF;
END $$;

COMMIT;
