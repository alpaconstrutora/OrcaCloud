-- ============================================================================
-- Planta Inteligente — ENTORNO do estudo (vizinhos por divisa) (02/10/2026, M5b)
--
-- Plano `docs/planos/2026-10-01-estudo-de-massa.md`, fase M5b: a insolação da
-- massa (sombra no lote e nos vizinhos, sol nas fachadas) compara cenários —
-- e para comparar de forma reprodutível o ENTORNO precisa ser do estudo.
--
-- Até aqui os vizinhos (altura, afastamento, profundidade por divisa — E5.1)
-- viviam no navegador, numa chave GLOBAL (`blueprint:insolacao`): valiam para
-- todos os estudos daquele navegador e o colega que abria o estudo não os via.
-- Uma linha por estudo, JSONB sanitizado na leitura (`vizinhosDaColuna` em
-- utils/blueprintInsolacao.ts). Fora do payload do desenho: é o quarteirão
-- declarado, não geometria do projeto. Molde: `blueprint_study_produto`
-- (…000010).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_entorno (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `VizinhoDoEntorno[]`: { id, lado, alturaM, afastamentoM, profundidadeM }.
    vizinhos        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_entorno_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_entorno_study_key UNIQUE (study_id),
    CONSTRAINT blueprint_study_entorno_vizinhos_array CHECK (jsonb_typeof(vizinhos) = 'array')
);

COMMENT ON TABLE public.blueprint_study_entorno IS
  'Entorno declarado de um estudo de Planta Inteligente: vizinhos por divisa (altura, afastamento, '
  'profundidade) para a insolação. Fora do payload. Antes vivia no navegador (chave global).';

DROP TRIGGER IF EXISTS trg_blueprint_study_entorno_updated ON public.blueprint_study_entorno;
CREATE TRIGGER trg_blueprint_study_entorno_updated
    BEFORE UPDATE ON public.blueprint_study_entorno
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_entorno ENABLE ROW LEVEL SECURITY;

-- Uma perna só, sem OR: membro da organização dona do estudo (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "blueprint_study_entorno_org" ON public.blueprint_study_entorno;
CREATE POLICY "blueprint_study_entorno_org"
    ON public.blueprint_study_entorno
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- O Supabase concede ALL a anon/authenticated por default privileges: tirar de todos e devolver só o necessário.
REVOKE ALL ON public.blueprint_study_entorno FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_entorno TO authenticated;
