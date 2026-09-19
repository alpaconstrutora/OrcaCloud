-- ============================================================================
-- Conjuntos de regras — o catálogo de legislação da organização
-- Plano: docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md (E3.2)
--
-- O motor de regras (`utils/blueprintRegras.ts`) avalia regras DECLARATIVAS
-- {escopo, quando, expressao, severidade, fonte} com o motor de fórmulas.
-- A SEMENTE (código de obras genérico) mora no código; o que cada município
-- e cada organização acrescentam mora aqui, em JSONB, para uma regra nova não
-- exigir migration. É CONFIGURAÇÃO: apagar um conjunto não mexe em planta
-- nenhuma — o resultado da avaliação é leitura, nunca gravado.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270919000045_blueprint_rule_sets.sql
--    NUNCA `supabase db push`.
-- ============================================================================
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_rule_sets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    -- "Belo Horizonte", "Curitiba" — texto, porque o conjunto pode ser da lei
    -- estadual ou de uma norma sem município.
    municipio       TEXT,
    lei_referencia  TEXT,
    -- Array de regras na forma de `Regra` (utils/blueprintRegras.ts).
    regras          JSONB NOT NULL DEFAULT '[]'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_rule_set_nome_nao_vazio CHECK (length(trim(nome)) > 0),
    CONSTRAINT blueprint_rule_set_regras_array CHECK (jsonb_typeof(regras) = 'array'),
    CONSTRAINT blueprint_rule_set_unique UNIQUE (organization_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_rule_set_org
    ON public.blueprint_rule_sets(organization_id) WHERE active;

COMMENT ON TABLE public.blueprint_rule_sets IS
  'Conjuntos de regras de legislação por organização (E3.2). Regras declarativas em JSONB, '
  'avaliadas pelo motor de fórmulas da planta; configuração mutável, resultado nunca gravado.';

ALTER TABLE public.blueprint_rule_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_rule_set_org_read" ON public.blueprint_rule_sets;
CREATE POLICY "blueprint_rule_set_org_read" ON public.blueprint_rule_sets
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_rule_set_org_insert" ON public.blueprint_rule_sets;
CREATE POLICY "blueprint_rule_set_org_insert" ON public.blueprint_rule_sets
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_rule_set_org_update" ON public.blueprint_rule_sets;
CREATE POLICY "blueprint_rule_set_org_update" ON public.blueprint_rule_sets
    FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_rule_set_org_delete" ON public.blueprint_rule_sets;
CREATE POLICY "blueprint_rule_set_org_delete" ON public.blueprint_rule_sets
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_rule_sets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_rule_sets TO authenticated;

-- Conferência. Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_rule_sets') AS tabela,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_rule_sets' AND rowsecurity) AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='blueprint_rule_sets') AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='blueprint_rule_sets' AND grantee='anon') AS anon_grants;
