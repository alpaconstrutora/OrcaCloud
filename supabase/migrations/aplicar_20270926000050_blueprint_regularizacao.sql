-- ============================================================================
-- Planta Inteligente — DADOS DA REGULARIZAÇÃO (REURB e CAR) (26/09/2026)
--
-- UMA linha por estudo, com o que as gavetas REURB e CAR da A5 pedem e o
-- desenho não sabe:
--   reurb: nome do núcleo, modalidade (REURB-S/REURB-E), município, UF,
--          matrícula de origem, cartório, responsável técnico e registro;
--   car:   a localização do imóvel para o percentual da Reserva Legal (bioma).
--
-- Na A5 esses campos ficavam no navegador (localStorage) — outro usuário ou
-- outro computador não os via. Os temas ambientais e os lotes continuam no
-- kernel; os ocupantes, no Empreendimento.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_regularizacao (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    reurb           JSONB NOT NULL DEFAULT '{}'::jsonb,
    car             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_study_regularizacao_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_regularizacao_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_regularizacao IS
  'Dados da REURB (núcleo, modalidade, matrícula, RT) e do CAR (bioma da Reserva Legal) de um '
  'estudo de Planta Inteligente. Temas e lotes ficam no kernel; ocupantes, no Empreendimento.';

DROP TRIGGER IF EXISTS trg_blueprint_regularizacao_updated ON public.blueprint_study_regularizacao;
CREATE TRIGGER trg_blueprint_regularizacao_updated
    BEFORE UPDATE ON public.blueprint_study_regularizacao
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_regularizacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_regularizacao_org" ON public.blueprint_study_regularizacao;
CREATE POLICY "blueprint_study_regularizacao_org"
    ON public.blueprint_study_regularizacao
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_regularizacao FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_regularizacao TO authenticated;

RESET lock_timeout;
