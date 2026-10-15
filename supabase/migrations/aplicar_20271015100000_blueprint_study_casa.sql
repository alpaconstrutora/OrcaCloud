-- ============================================================================
-- Planta Inteligente — CASA AUTOMÁTICA, F10 (15/10/2026, plano
-- `docs/planos/2026-10-14-casa-automatica.md`):
--   `blueprint_study_casa` — as PREMISSAS da casa automática por estudo (uma
--   linha por estudo, JSONB parcial completado com o padrão na leitura — o mesmo
--   desenho de `blueprint_study_hidro`, `_eletrica`, `_incendio` e
--   `_climatizacao`): o programa curto (dormitórios, suítes, banheiros, vagas,
--   padrão CUB), as disciplinas ligadas e as hipóteses que a tela expõe
--   (`utils/blueprintPremissasDaCasa.ts`). As premissas de cada disciplina
--   continuam nas tabelas delas.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: CREATE … IF NOT EXISTS, DROP/CREATE POLICY e TRIGGER.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_casa (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `PremissasDaCasa`, parcial: { curto, disciplinas, telhado, implantacao, ancoras, eletrica, sementes }.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_casa_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_casa_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_casa IS
  'Premissas da casa automática de um estudo de Planta Inteligente: o programa curto (dormitórios, '
  'suítes, banheiros, vagas, padrão CUB), as disciplinas lançadas e as hipóteses da tela. Fora do '
  'payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_casa_updated ON public.blueprint_study_casa;
CREATE TRIGGER trg_blueprint_casa_updated
    BEFORE UPDATE ON public.blueprint_study_casa
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_casa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_casa_org" ON public.blueprint_study_casa;
CREATE POLICY "blueprint_study_casa_org"
    ON public.blueprint_study_casa
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_casa FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_casa TO authenticated;

RESET lock_timeout;
