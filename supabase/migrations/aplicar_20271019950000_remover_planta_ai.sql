-- ============================================================================
-- Remove o Planta AI v1 do banco: 8 tabelas plant_* e 5 colunas de vínculo.
-- Plano: docs/planos/2026-10-19-remover-planta-ai.md (Fase 2).
--
-- PRÉ-REQUISITO: o código que não lê mais planta_ai_* tem de estar NO AR antes
-- (commit a4e704be). As listas EMPREENDIMENTO_COLS/TOWER_COLS/UNIT_COLS pediam
-- essas colunas; aplicar isto antes do deploy faria o site responder 42703.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — nunca db push.
--
-- Levantado em 2026-10-19: nenhuma função, view, cron ou objeto de storage usa
-- as tabelas; cada uma só tem a policy org_access_* e o gatilho set_updated_at_*.
-- Propostas com origin='planta_ai': 0. Contagens: studies 2, scenarios 41,
-- floors 18, units 88, terrains 1, briefings 1, urban_rulesets 1, validations 78.
--
-- CÓPIA: antes de apagar, tudo vai para o schema `arquivo_planta_ai` (fora da
-- API: o PostgREST só expõe `public`, e o REVOKE abaixo tira o acesso de quem
-- não é dono). Apagar a cópia é decisão do usuário, depois.
-- ============================================================================

BEGIN;

-- ── 1. Cópia ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS arquivo_planta_ai;
REVOKE ALL ON SCHEMA arquivo_planta_ai FROM PUBLIC, anon, authenticated;

CREATE TABLE arquivo_planta_ai.plant_studies        AS SELECT * FROM public.plant_studies;
CREATE TABLE arquivo_planta_ai.plant_terrains       AS SELECT * FROM public.plant_terrains;
CREATE TABLE arquivo_planta_ai.plant_urban_rulesets AS SELECT * FROM public.plant_urban_rulesets;
CREATE TABLE arquivo_planta_ai.plant_briefings      AS SELECT * FROM public.plant_briefings;
CREATE TABLE arquivo_planta_ai.plant_scenarios      AS SELECT * FROM public.plant_scenarios;
CREATE TABLE arquivo_planta_ai.plant_floors         AS SELECT * FROM public.plant_floors;
CREATE TABLE arquivo_planta_ai.plant_units          AS SELECT * FROM public.plant_units;
CREATE TABLE arquivo_planta_ai.plant_validations    AS SELECT * FROM public.plant_validations;

-- Os vínculos que somem com as colunas: (tabela, id da linha, coluna, valor).
CREATE TABLE arquivo_planta_ai.vinculos AS
          SELECT 'imovib_studies'::text        AS tabela, id, 'planta_ai_study_id'::text    AS coluna, planta_ai_study_id    AS valor FROM public.imovib_studies        WHERE planta_ai_study_id    IS NOT NULL
UNION ALL SELECT 'empreendimentos',                   id, 'planta_ai_study_id',                    planta_ai_study_id             FROM public.empreendimentos       WHERE planta_ai_study_id    IS NOT NULL
UNION ALL SELECT 'commercial_properties',             id, 'planta_ai_study_id',                    planta_ai_study_id             FROM public.commercial_properties WHERE planta_ai_study_id    IS NOT NULL
UNION ALL SELECT 'empreendimento_towers',             id, 'planta_ai_scenario_id',                 planta_ai_scenario_id          FROM public.empreendimento_towers WHERE planta_ai_scenario_id IS NOT NULL
UNION ALL SELECT 'empreendimento_units',              id, 'planta_ai_unit_id',                     planta_ai_unit_id              FROM public.empreendimento_units  WHERE planta_ai_unit_id     IS NOT NULL;

-- As chaves de permissão que saem do JSON dos membros.
CREATE TABLE arquivo_planta_ai.permissoes AS
SELECT id, organization_id, user_id,
       permissions -> 'canViewPlantaAi' AS can_view_planta_ai,
       permissions -> 'canEditPlantaAi' AS can_edit_planta_ai
FROM public.organization_members
WHERE permissions ?| ARRAY['canViewPlantaAi', 'canEditPlantaAi'];

REVOKE ALL ON ALL TABLES IN SCHEMA arquivo_planta_ai FROM PUBLIC, anon, authenticated;

-- ── 2. Colunas de vínculo (as FKs e os índices parciais caem junto) ─────────
ALTER TABLE public.imovib_studies        DROP COLUMN IF EXISTS planta_ai_study_id;
ALTER TABLE public.empreendimentos       DROP COLUMN IF EXISTS planta_ai_study_id;
ALTER TABLE public.commercial_properties DROP COLUMN IF EXISTS planta_ai_study_id;
ALTER TABLE public.empreendimento_towers DROP COLUMN IF EXISTS planta_ai_scenario_id;
ALTER TABLE public.empreendimento_units  DROP COLUMN IF EXISTS planta_ai_unit_id;

-- ── 3. Tabelas: um DROP só, porque há FK circular dentro do conjunto ────────
-- (plant_studies.selected_scenario_id → plant_scenarios → plant_studies). Listadas
-- juntas, o Postgres resolve a dependência ENTRE elas sem CASCADE — que levaria
-- junto, calado, qualquer objeto de fora que ainda dependesse delas. Ensaio com
-- ROLLBACK em 19/10/2026 achou essa FK. Policies e gatilhos caem com a tabela.
DROP TABLE IF EXISTS
    public.plant_validations, public.plant_units, public.plant_floors, public.plant_scenarios,
    public.plant_briefings, public.plant_urban_rulesets, public.plant_terrains, public.plant_studies;

-- ── 4. Curadoria: 'planta_ai' deixa de ser origem válida (0 linhas com ela) ──
-- O 'sync_planta' de empreendimento_audit_logs.source FICA: rotula histórico.
ALTER TABLE public.empreendimento_field_proposals DROP CONSTRAINT IF EXISTS empreendimento_field_proposals_origin_check;
ALTER TABLE public.empreendimento_field_proposals ADD CONSTRAINT empreendimento_field_proposals_origin_check
    CHECK (origin = ANY (ARRAY['imovib'::text, 'blueprint'::text, 'massa'::text]));

-- ── 5. Permissões que não existem mais na tela ──────────────────────────────
UPDATE public.organization_members
SET permissions = permissions - 'canViewPlantaAi' - 'canEditPlantaAi'
WHERE permissions ?| ARRAY['canViewPlantaAi', 'canEditPlantaAi'];

COMMIT;
