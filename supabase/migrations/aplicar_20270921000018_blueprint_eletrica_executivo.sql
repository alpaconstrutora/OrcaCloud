-- ============================================================================
-- Planta Inteligente — pré-dimensionamento elétrico, F7 (13/09/2026):
--   1. `blueprint_study_eletrica` — as HIPÓTESES do pré-dimensionamento por
--      estudo (uma linha por estudo, JSONB parcial completado com o padrão na
--      leitura — o mesmo desenho de `blueprint_study_terraplenagem`).
--   2. `blueprint_study_projeto_executivo.disciplina` — a MESMA tabela de
--      emissão executiva da topografia passa a servir à elétrica. Um fluxo de
--      emissão, N disciplinas (decisão do usuário em 13/09/2026: "uma tabela
--      de projeto executivo com disciplina").
--
-- ─── POR QUE AS HIPÓTESES NÃO VÃO NO PAYLOAD DO DESENHO ─────────────────────
-- Método de instalação, temperatura, ρ e fatores de demanda não são o
-- desenho: são premissas de CÁLCULO, mudam sem mexer numa parede, e o hash
-- da versão publicada não deve mudar por elas. A emissão executiva amarra o
-- hash do desenho E o hash das hipóteses — os dois, separados.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ `blueprint_study_projeto_executivo` tem linhas EMITIDAS (imutáveis por
--    trigger). `ADD COLUMN … DEFAULT` não dispara o trigger de UPDATE; o
--    índice parcial de rascunho é refeito por (study_id, disciplina).
-- ============================================================================

SET lock_timeout = '5s';

-- 1. Hipóteses do pré-dimensionamento elétrico ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_study_eletrica (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    -- `HipotesesEletricas`, parcial: método de instalação, temperatura,
    -- agrupamento, ρ, limites de queda, catálogo de disjuntores, demanda.
    hipoteses       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_eletrica_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_study_eletrica_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_study_eletrica IS
  'Hipóteses do pré-dimensionamento elétrico (NBR 5410) de um estudo de Planta '
  'Inteligente: método de instalação, temperatura, agrupamento, resistividade, '
  'limites de queda, catálogo de disjuntores, fatores de demanda. Fora do payload do desenho.';

DROP TRIGGER IF EXISTS trg_blueprint_eletrica_updated ON public.blueprint_study_eletrica;
CREATE TRIGGER trg_blueprint_eletrica_updated
    BEFORE UPDATE ON public.blueprint_study_eletrica
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_eletrica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_study_eletrica_org" ON public.blueprint_study_eletrica;
CREATE POLICY "blueprint_study_eletrica_org"
    ON public.blueprint_study_eletrica
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_study_eletrica FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_eletrica TO authenticated;

-- 2. A disciplina na emissão executiva ──────────────────────────────────────

ALTER TABLE public.blueprint_study_projeto_executivo
    ADD COLUMN IF NOT EXISTS disciplina TEXT NOT NULL DEFAULT 'TERRAPLENAGEM';

ALTER TABLE public.blueprint_study_projeto_executivo
    DROP CONSTRAINT IF EXISTS blueprint_projeto_executivo_disciplina_chk;
ALTER TABLE public.blueprint_study_projeto_executivo
    ADD CONSTRAINT blueprint_projeto_executivo_disciplina_chk
    CHECK (disciplina IN ('TERRAPLENAGEM', 'ELETRICA'));

COMMENT ON COLUMN public.blueprint_study_projeto_executivo.disciplina IS
  'Qual projeto executivo a linha emite: TERRAPLENAGEM (topografia, drenagem, contenção) ou ELETRICA (NBR 5410). Um rascunho por estudo POR disciplina.';

-- Um rascunho por estudo POR DISCIPLINA (antes: um por estudo).
DROP INDEX IF EXISTS public.idx_blueprint_projeto_executivo_rascunho;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_projeto_executivo_rascunho
    ON public.blueprint_study_projeto_executivo(study_id, disciplina) WHERE status = 'RASCUNHO';

RESET lock_timeout;
