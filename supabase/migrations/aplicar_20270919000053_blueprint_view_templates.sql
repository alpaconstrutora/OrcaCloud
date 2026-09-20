-- ============================================================================
-- Planta Inteligente — TEMPLATES DE VISTA por organização (19/09/2026, E8.2)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 8.2: o que se mostra na planta e no 3D (camadas de exibição, modo de
-- cor dos ambientes, estilo do 3D) salvo com nome, para aplicar de uma vez em
-- qualquer estudo. É CONFIGURAÇÃO de leitura: não toca no payload nem no hash.
-- `config` é JSONB sanitizado na leitura (`configuracaoDaColuna` em
-- utils/blueprintTemplatesDeVista.ts). Mesmo desenho de `blueprint_wall_types`.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_view_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_view_templates_nome_key UNIQUE (organization_id, nome)
);

COMMENT ON TABLE public.blueprint_view_templates IS
  'Templates de vista da Planta Inteligente por organização: camadas de exibição da planta, modo de cor dos ambientes, '
  'estilo e camadas do 3D. Configuração de leitura — não altera o desenho.';

CREATE INDEX IF NOT EXISTS blueprint_view_templates_org_idx
    ON public.blueprint_view_templates(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_view_templates_updated ON public.blueprint_view_templates;
CREATE TRIGGER trg_blueprint_view_templates_updated
    BEFORE UPDATE ON public.blueprint_view_templates
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_view_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_view_templates_org" ON public.blueprint_view_templates;
CREATE POLICY "blueprint_view_templates_org"
    ON public.blueprint_view_templates
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_view_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_view_templates TO authenticated;
