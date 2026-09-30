-- ============================================================================
-- Planta Inteligente — INCÊNDIO, E0.1 (30/09/2026, roadmap
-- `docs/planos/2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`):
--   `blueprint_study_incendio` — as PREMISSAS de incêndio por estudo (uma
--   linha por estudo, JSONB parcial completado com o padrão na leitura — o
--   mesmo desenho de `blueprint_study_hidro` e `blueprint_study_eletrica`).
--   Hoje: o preset do Corpo de Bombeiros (MG), a divisão de ocupação, a altura
--   e a carga de incêndio declaradas e o pavimento de descarga. Cresce por
--   grupo a cada etapa do roadmap, sem migration nova.
--
-- A emissão com ART (INCENDIO no CHECK de `blueprint_study_projeto_executivo`)
-- fica para a E8.4 — não há o que emitir antes.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: CREATE … IF NOT EXISTS, DROP/CREATE POLICY e TRIGGER.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_incendio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesIncendio`, parcial: { classificacao: HipotesesDeClassificacao }.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_incendio_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_incendio_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_incendio IS
  'Premissas de segurança contra incêndio de um estudo de Planta Inteligente: preset do Corpo de '
  'Bombeiros (MG/CBMMG), divisão de ocupação, altura e carga de incêndio declaradas, pavimento de '
  'descarga. Fora do payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_incendio_updated ON public.blueprint_study_incendio;
CREATE TRIGGER trg_blueprint_incendio_updated
    BEFORE UPDATE ON public.blueprint_study_incendio
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_incendio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_incendio_org" ON public.blueprint_study_incendio;
CREATE POLICY "blueprint_study_incendio_org"
    ON public.blueprint_study_incendio
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_incendio FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_incendio TO authenticated;

RESET lock_timeout;
