-- ============================================================================
-- Planta Inteligente — CLIMATIZAÇÃO, E0.1 (04/10/2026, roadmap
-- `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`):
--   `blueprint_study_climatizacao` — as PREMISSAS de climatização por estudo
--   (uma linha por estudo, JSONB parcial completado com o padrão na leitura —
--   o mesmo desenho de `blueprint_study_hidro`, `_eletrica` e `_incendio`).
--   Hoje: as condições internas de conforto (temperatura e umidade de projeto).
--   Cresce por grupo a cada fase da E0 (clima por cidade na 0.2, dados por
--   ambiente na 0.3) e do roadmap, sem migration nova.
--
-- A emissão com ART (CLIMATIZACAO no CHECK de `blueprint_study_projeto_executivo`)
-- fica para a E8.4 — não há o que emitir antes.
--
-- ⚠️ NÚMERO: nasceu `aplicar_20271004000030_…` e colidiu com
--   `aplicar_20271004000030_portal_help_tour_passos.sql` (outra frente, publicada
--   antes). Renomeada para 000040 em 04/10/2026, DEPOIS de JÁ TER SIDO APLICADA
--   no banco com o número antigo (04/10/2026, com OK do usuário). É idempotente:
--   rodar de novo não cria nem altera nada.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: CREATE … IF NOT EXISTS, DROP/CREATE POLICY e TRIGGER.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_climatizacao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesClimatizacao`, parcial: { conforto: HipotesesDeConforto }.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_climatizacao_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_climatizacao_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_climatizacao IS
  'Premissas de climatização de um estudo de Planta Inteligente: condições internas de conforto '
  '(temperatura e umidade de projeto) e, nas fases seguintes, clima externo por cidade e dados por '
  'ambiente para a carga térmica. Fora do payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_climatizacao_updated ON public.blueprint_study_climatizacao;
CREATE TRIGGER trg_blueprint_climatizacao_updated
    BEFORE UPDATE ON public.blueprint_study_climatizacao
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_climatizacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_climatizacao_org" ON public.blueprint_study_climatizacao;
CREATE POLICY "blueprint_study_climatizacao_org"
    ON public.blueprint_study_climatizacao
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_climatizacao FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_climatizacao TO authenticated;

RESET lock_timeout;
