-- ============================================================================
-- Planta Inteligente — PRODUTO do Estudo de Massa, por estudo (02/10/2026, M2)
--
-- Plano `docs/planos/2026-10-01-estudo-de-massa.md`, fase M2: tipologias
-- (uso, dormitórios, área privativa alvo, vagas por unidade, participação no
-- mix), padrão construtivo (chave do CUB), meta de unidades e hipóteses de
-- perda do pavimento (paredes, corredor, núcleo, elevadores, portaria, arranjo
-- das vagas). Uma linha por estudo, JSONB sanitizado na leitura
-- (`produtoDaColuna` em utils/blueprintProduto.ts). Fora do payload do
-- desenho: é intenção, não geometria. Molde: `blueprint_programs` (…000046).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_produto (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `Produto`: { nome, padrao, tipologias[], metaUnidades, hipoteses }.
    produto         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_produto_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_produto_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_produto IS
  'Produto do Estudo de Massa de um estudo de Planta Inteligente: tipologias e mix, '
  'padrão construtivo (CUB), meta de unidades e hipóteses de perda do pavimento. Fora do payload.';

DROP TRIGGER IF EXISTS trg_blueprint_study_produto_updated ON public.blueprint_study_produto;
CREATE TRIGGER trg_blueprint_study_produto_updated
    BEFORE UPDATE ON public.blueprint_study_produto
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_produto ENABLE ROW LEVEL SECURITY;

-- Uma perna só, sem OR: membro da organização dona do estudo (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "blueprint_study_produto_org" ON public.blueprint_study_produto;
CREATE POLICY "blueprint_study_produto_org"
    ON public.blueprint_study_produto
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- O Supabase concede ALL a anon/authenticated por default privileges: tirar de todos e devolver só o necessário.
REVOKE ALL ON public.blueprint_study_produto FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_produto TO authenticated;
