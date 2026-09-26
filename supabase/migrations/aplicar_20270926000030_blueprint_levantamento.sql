-- ============================================================================
-- Planta Inteligente — LEVANTAMENTO EM EDIÇÃO (A2, 26/09/2026)
--
-- Os pontos do levantamento (importados ou digitados) viviam só em `useState`:
-- recarregar a página antes de gerar uma versão perdia a importação inteira,
-- e o nome, o código e a descrição de cada ponto nem chegavam à versão (que
-- guarda só {x, y, cota} — é o que entra no hash).
--
-- UMA linha por estudo, MUTÁVEL: é o caderno de campo em edição. A versão de
-- topografia (`blueprint_study_topografia`, imutável) passa a apontar para o
-- levantamento de onde saiu (`levantamento_id`, SET NULL ao apagar).
--
-- ⚠️ O `hash_entrada` da versão continua sobre {x, y, cota}: nome, código e
-- descrição NÃO entram — as versões antigas continuam conferíveis.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_study_levantamento (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id         UUID NOT NULL,
    organization_id  UUID NOT NULL,

    -- [{x, y, cotaM, nome?, codigo?, descricao?}, …] em mm do desenho.
    pontos           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Linhas de quebra (fase 15) do mesmo levantamento: [{pontos: [{x, y, cotaM}]}].
    linhas_de_quebra JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- sha256 de {x, y, cota} dos pontos — o mesmo recorte do hash da versão.
    hash_pontos      TEXT,
    -- De onde veio: {arquivo, formato, sha256, quantos}. NULL = digitado.
    origem           JSONB,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_study_levantamento_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_levantamento_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_levantamento IS
  'Levantamento em edição de um estudo de Planta Inteligente (A2): pontos com '
  'nome/código/descrição e linhas de quebra. Mutável; as versões de topografia '
  'apontam para ele por levantamento_id.';

DROP TRIGGER IF EXISTS trg_blueprint_levantamento_updated ON public.blueprint_study_levantamento;
CREATE TRIGGER trg_blueprint_levantamento_updated
    BEFORE UPDATE ON public.blueprint_study_levantamento
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_levantamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_levantamento_org" ON public.blueprint_study_levantamento;
CREATE POLICY "blueprint_study_levantamento_org"
    ON public.blueprint_study_levantamento
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_levantamento FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_levantamento TO authenticated;

-- A versão aponta para o levantamento de onde saiu.
ALTER TABLE public.blueprint_study_topografia
  ADD COLUMN IF NOT EXISTS levantamento_id UUID
  REFERENCES public.blueprint_study_levantamento(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.blueprint_study_topografia.levantamento_id IS
  'A2: o levantamento em edição de onde a versão saiu (nome, código e descrição dos pontos). NULL = versão anterior à A2, fonte remota, ou levantamento apagado.';

RESET lock_timeout;
