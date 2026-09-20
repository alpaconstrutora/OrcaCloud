-- ============================================================================
-- Planta Inteligente — TEMPLATES DE PRANCHA por organização (20/09/2026, E8.3)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 8.3: formato (papel/orientação), escalas (planta, cortes, ampliação),
-- carimbo com campos (empresa, responsável, registro, cliente, endereço,
-- prefixo, campos extras) e o que entra no conjunto. `template` é JSONB
-- sanitizado na leitura (`templateDePranchaDaColuna`). Configuração de saída:
-- não toca no payload nem no hash. Mesmo desenho de `blueprint_view_templates`.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_sheet_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    template        JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_sheet_templates_nome_key UNIQUE (organization_id, nome)
);

COMMENT ON TABLE public.blueprint_sheet_templates IS
  'Templates de prancha da Planta Inteligente por organização: papel, escalas, carimbo com campos e o que entra no conjunto de desenhos. Configuração de saída — não altera o desenho.';

CREATE INDEX IF NOT EXISTS blueprint_sheet_templates_org_idx
    ON public.blueprint_sheet_templates(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_sheet_templates_updated ON public.blueprint_sheet_templates;
CREATE TRIGGER trg_blueprint_sheet_templates_updated
    BEFORE UPDATE ON public.blueprint_sheet_templates
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_sheet_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_sheet_templates_org" ON public.blueprint_sheet_templates;
CREATE POLICY "blueprint_sheet_templates_org"
    ON public.blueprint_sheet_templates
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_sheet_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_sheet_templates TO authenticated;
