-- ============================================================================
-- Planta Inteligente — PROGRAMA DE NECESSIDADES por estudo (19/09/2026, E4.1)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 4.1: itens {uso, quantidade, área mín/ideal/máx, largura mín, pé-direito
-- mín, exige iluminação/ventilação/fachada, privacidade}, relações {a, b, peso
-- 0–10, desejável/obrigatória/proibida} e circulação máxima %. Uma linha por
-- estudo, JSONB sanitizado na leitura (`programaDaColuna` em
-- utils/blueprintPrograma.ts). Fora do payload do desenho: é intenção, não
-- geometria. Mesmo desenho de `blueprint_study_armadura` (…000023).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_programs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL,
    organization_id UUID NOT NULL,
    nome            TEXT NOT NULL DEFAULT 'Programa',
    -- `Programa`: { nome, itens[], relacoes[], circulacaoMaxPct }.
    programa        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_programs_study_fk
      FOREIGN KEY (study_id, organization_id)
      REFERENCES public.blueprint_studies(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_programs_study_key UNIQUE (study_id)
);

COMMENT ON TABLE public.blueprint_programs IS
  'Programa de necessidades de um estudo de Planta Inteligente: itens (uso, quantidade, '
  'áreas, largura, pé-direito, exigências, privacidade), matriz de proximidade '
  '(relações com peso 0–10, obrigatória/proibida) e circulação máxima %. Fora do payload.';

DROP TRIGGER IF EXISTS trg_blueprint_programs_updated ON public.blueprint_programs;
CREATE TRIGGER trg_blueprint_programs_updated
    BEFORE UPDATE ON public.blueprint_programs
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_programs_org" ON public.blueprint_programs;
CREATE POLICY "blueprint_programs_org"
    ON public.blueprint_programs
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_programs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_programs TO authenticated;
