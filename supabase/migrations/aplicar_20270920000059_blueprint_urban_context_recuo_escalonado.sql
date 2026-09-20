-- ============================================================================
-- Planta Inteligente — RECUO DE FRENTE ESCALONADO por pavimento (20/09/2026, P2.10)
--
-- Backlog P2 do roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`
-- (E3.3 deixou registrado: "recuo de frente maior a partir do 3º"). Duas
-- colunas no contexto urbanístico do estudo, no molde do vocabulário
-- complementar da E3.1 (`aplicar_20270919000044`): o recuo (mm) e o pavimento
-- a partir do qual vale (1 = térreo). Digitadas à mão ou lidas da zona
-- (`recuo_frente_escalonado`: "5 m a partir do 3º pavimento").
--
-- Idempotente (ADD COLUMN IF NOT EXISTS). Aplicar com `db query -f`, nunca
-- `supabase db push` (ver CLAUDE.md).
-- ============================================================================
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_urban_context
  ADD COLUMN IF NOT EXISTS recuo_frente_escalonado_mm integer,
  ADD COLUMN IF NOT EXISTS recuo_frente_escalonado_pavimento integer;

COMMENT ON COLUMN public.blueprint_study_urban_context.recuo_frente_escalonado_mm IS 'P2.10: recuo de frente (mm) que vale a partir de recuo_frente_escalonado_pavimento (1 = térreo).';
COMMENT ON COLUMN public.blueprint_study_urban_context.recuo_frente_escalonado_pavimento IS 'P2.10: pavimento (ordinal, cotas ≥ 0) a partir do qual vale o recuo de frente escalonado.';
