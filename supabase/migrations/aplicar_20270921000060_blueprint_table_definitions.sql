-- ============================================================================
-- Planta Inteligente — TABELAS PERSONALIZADAS por organização (21/09/2026,
-- backlog P2 — P2.16)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`:
-- os "schedules" — uma tabela definida pelo usuário sobre uma família de peças
-- (colunas = variáveis das fórmulas, filtro = expressão da mesma linguagem,
-- agrupamento, ordenação, totais). A DEFINIÇÃO é da organização; a tabela é
-- derivada do modelo aberto. `definicao` é JSONB sanitizado na leitura
-- (`definicaoDaColuna` em utils/blueprintTabelas.ts). Mesmo desenho de
-- `blueprint_view_templates`; escrita vedada ao leitor do estudo.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_table_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    definicao       JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_table_definitions_nome_key UNIQUE (organization_id, nome)
);

COMMENT ON TABLE public.blueprint_table_definitions IS
  'Tabelas personalizadas (schedules) da Planta Inteligente por organização: família, colunas (variáveis das fórmulas), '
  'filtro, agrupamento, ordenação e totais. Definição — a tabela é derivada do modelo aberto.';

CREATE INDEX IF NOT EXISTS blueprint_table_definitions_org_idx
    ON public.blueprint_table_definitions(organization_id) WHERE active;

DROP TRIGGER IF EXISTS trg_blueprint_table_definitions_updated ON public.blueprint_table_definitions;
CREATE TRIGGER trg_blueprint_table_definitions_updated
    BEFORE UPDATE ON public.blueprint_table_definitions
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_table_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_table_definitions_org" ON public.blueprint_table_definitions;
CREATE POLICY "blueprint_table_definitions_org"
    ON public.blueprint_table_definitions
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_table_definitions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_table_definitions TO authenticated;
