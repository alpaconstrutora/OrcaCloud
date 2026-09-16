-- ============================================================================
-- Planta Inteligente — hipóteses da ARMADURA ESQUEMÁTICA por estudo (16/09/2026)
--
-- Pedido: "implementar armadura em vigas, lajes, pilares, blocos e estacas".
-- Decisão do usuário: as hipóteses (fck, CAA, bitolas, taxas de referência,
-- perda, trecho armado da estaca) ficam NO ESTUDO — todo mundo que abre o
-- estudo vê o mesmo kg, e o orçamento usa as mesmas. Mesmo desenho de
-- `blueprint_study_eletrica` (aplicar_20270921000018): uma linha por estudo,
-- JSONB parcial completado com o padrão na leitura
-- (`hipotesesDeArmaduraDaColuna` em utils/blueprintArmadura.ts).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_armadura (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesDeArmadura`, parcial: fck, CAA, perda %, bitola longitudinal por
    -- família, bitola do estribo, trecho armado da estaca, taxas kg/m³.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_armadura_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_armadura_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_armadura IS
  'Hipóteses do pré-quantitativo de armadura (mínimos NBR 6118 + taxa de referência) '
  'de um estudo de Planta Inteligente: fck, CAA, perda, bitolas por família, estribo, '
  'trecho armado da estaca, taxas kg/m³. Fora do payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_armadura_updated ON public.blueprint_study_armadura;
CREATE TRIGGER trg_blueprint_armadura_updated
    BEFORE UPDATE ON public.blueprint_study_armadura
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_armadura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_armadura_org" ON public.blueprint_study_armadura;
CREATE POLICY "blueprint_study_armadura_org"
    ON public.blueprint_study_armadura
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_armadura FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_armadura TO authenticated;
