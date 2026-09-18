-- ============================================================================
-- Definições de parâmetro personalizado da Planta Inteligente
-- Plano: docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md (E1.2)
--
-- A PEÇA carrega `parametros: {chave: valor}` no payload canônico (kernel
-- 0.33.0). O que a chave SIGNIFICA — nome legível, tipo, unidade, opções,
-- se sai no IFC/planilha, e (E1.3) a fórmula — é a DEFINIÇÃO, que mora aqui,
-- por organização. A separação é a mesma do tipo de parede: renomear uma
-- definição hoje não pode mudar o snapshot publicado ontem; e apagar uma
-- definição deixa o valor na peça, que a tela mostra como "sem definição".
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270918000050_blueprint_parameter_definitions.sql
--    NUNCA `supabase db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_parameter_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- A chave de programa, como o kernel a aceita (`CHAVE_DE_PARAMETRO`).
    chave           TEXT NOT NULL CHECK (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
    -- O nome que a tela mostra ("Fabricante", "fck (MPa)").
    nome            TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    -- A família a que se aplica; NULL = todas as famílias com parâmetros.
    familia         TEXT CHECK (familia IS NULL OR familia IN ('wall','opening','structural','roof','stair','trecho','terminal','quadro')),
    tipo            TEXT NOT NULL CHECK (tipo IN ('NUMERO','TEXTO','BOOLEANO','LISTA')),
    unidade         TEXT NOT NULL DEFAULT '',
    -- Só em LISTA: as opções, como array JSON de textos.
    opcoes          JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Sai no IFC (Pset_OPURA_Personalizado) e na planilha. Desligado = interno.
    compartilhado   BOOLEAN NOT NULL DEFAULT TRUE,
    -- Reservado para a E1.3 (motor de fórmulas). Vazio = valor digitado.
    formula         TEXT NOT NULL DEFAULT '',

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_parameter_definition_unique UNIQUE (organization_id, chave)
);

SET lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS idx_blueprint_parameter_definition_org
    ON public.blueprint_parameter_definitions(organization_id) WHERE active;

COMMENT ON TABLE public.blueprint_parameter_definitions IS
  'Definições de parâmetro personalizado da Planta Inteligente, por organização. '
  'O VALOR vive na peça (payload canônico, kernel 0.33.0); aqui só o significado da chave.';

SET lock_timeout = '5s';
ALTER TABLE public.blueprint_parameter_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_parameter_definition_org_read" ON public.blueprint_parameter_definitions;
CREATE POLICY "blueprint_parameter_definition_org_read" ON public.blueprint_parameter_definitions
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_parameter_definition_org_insert" ON public.blueprint_parameter_definitions;
CREATE POLICY "blueprint_parameter_definition_org_insert" ON public.blueprint_parameter_definitions
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_parameter_definition_org_update" ON public.blueprint_parameter_definitions;
CREATE POLICY "blueprint_parameter_definition_org_update" ON public.blueprint_parameter_definitions
    FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "blueprint_parameter_definition_org_delete" ON public.blueprint_parameter_definitions;
CREATE POLICY "blueprint_parameter_definition_org_delete" ON public.blueprint_parameter_definitions
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_parameter_definitions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_parameter_definitions TO authenticated;

-- Conferência. Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_parameter_definitions') AS tabela,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='blueprint_parameter_definitions' AND rowsecurity) AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='blueprint_parameter_definitions') AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='blueprint_parameter_definitions' AND grantee='anon') AS anon_grants;
