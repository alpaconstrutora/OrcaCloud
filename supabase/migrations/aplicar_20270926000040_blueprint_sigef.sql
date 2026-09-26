-- ============================================================================
-- Planta Inteligente — IDENTIFICAÇÃO SIGEF DO IMÓVEL (A4, 26/09/2026)
--
-- UMA linha por estudo: o que a aba `identificacao` da planilha ODS do SIGEF
-- pede e o desenho não sabe — natureza do serviço, detentor (nome, CPF/CNPJ),
-- denominação, situação, natureza da área, código SNCR, CNS, matrícula,
-- município, código do credenciado e responsável técnico.
--
-- Os VÉRTICES (código, tipo, sigmas, altitude, método) e os TRECHOS (tipo de
-- limite, confrontante e documentos) moram no kernel (0.60.0): são desenho, têm
-- desfazer e vão no snapshot. Aqui fica só o cadastro do imóvel.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_sigef (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    identificacao   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_study_sigef_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_sigef_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_sigef IS
  'Identificação SIGEF do imóvel de um estudo de Planta Inteligente (A4): o que a aba '
  'identificacao da planilha ODS pede. Vértices e trechos ficam no kernel.';

DROP TRIGGER IF EXISTS trg_blueprint_sigef_updated ON public.blueprint_study_sigef;
CREATE TRIGGER trg_blueprint_sigef_updated
    BEFORE UPDATE ON public.blueprint_study_sigef
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_sigef ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_sigef_org" ON public.blueprint_study_sigef;
CREATE POLICY "blueprint_study_sigef_org"
    ON public.blueprint_study_sigef
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_sigef FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_sigef TO authenticated;

RESET lock_timeout;
