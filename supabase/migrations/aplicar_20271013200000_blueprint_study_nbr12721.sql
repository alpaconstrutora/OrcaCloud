-- ============================================================================
-- Planta Inteligente — HIPÓTESES NBR 12721 do estudo (13/10/2026, Fase 4.2)
--
-- Plano `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`: o Motor de Áreas
-- deixa de ser módulo separado. A classificação de cada ambiente mora no
-- desenho (kernel 0.100.0); o que é do ESTUDO e não de um ambiente mora aqui:
-- coeficientes padrão por classe de cobertura, escopo padrão do rateio, área
-- da vaga, regra de numeração dos andares copiados e os rateios dos comuns
-- não proporcionais. Uma linha por estudo, JSONB sanitizado na leitura
-- (`hipotesesNbr12721DaColuna` em utils/blueprintNbr12721.ts). Molde:
-- `blueprint_study_produto` (aplicar_20271002000010).
--
-- REGRA #7: uma policy de uma perna só (membro da organização dona do
-- estudo), nenhuma função nova.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_nbr12721 (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesNbr12721`: { coeficientesPadrao, escopoPadrao, areaDaVagaMm2, numeracao, alocacoes[] }.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_nbr12721_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_nbr12721_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_nbr12721 IS
  'Hipóteses NBR 12721 de um estudo de Planta Inteligente: coeficientes padrão, escopo do rateio, '
  'área da vaga, numeração dos andares copiados e rateios não proporcionais. Fora do payload.';

DROP TRIGGER IF EXISTS trg_blueprint_study_nbr12721_updated ON public.blueprint_study_nbr12721;
CREATE TRIGGER trg_blueprint_study_nbr12721_updated
    BEFORE UPDATE ON public.blueprint_study_nbr12721
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_nbr12721 ENABLE ROW LEVEL SECURITY;

-- Uma perna só, sem OR: membro da organização dona do estudo (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "blueprint_study_nbr12721_org" ON public.blueprint_study_nbr12721;
CREATE POLICY "blueprint_study_nbr12721_org"
    ON public.blueprint_study_nbr12721
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- O Supabase concede ALL a anon/authenticated por default privileges: tirar de todos e devolver só o necessário.
REVOKE ALL ON public.blueprint_study_nbr12721 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_nbr12721 TO authenticated;
