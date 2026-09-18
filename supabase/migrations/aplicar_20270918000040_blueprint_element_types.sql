-- ============================================================================
-- Tipos de elemento — o catálogo genérico da organização (estrutura, ponto de
-- instalação, escada, telhado)
-- Plano: docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md (E1.1)
--
-- "Pilar 20×40 · 2,80 m", "TUG 100 VA a 30 cm", "Escada 1,20 m · espelho 17,5"
-- é o que se repete peça a peça. Parede e esquadria já têm catálogo próprio
-- (`blueprint_wall_types`, `blueprint_opening_types`); as demais famílias não
-- tinham nenhum, e o usuário redigitava medida por medida.
--
-- Espelha as duas tabelas anteriores, decisão por decisão: é CONFIGURAÇÃO da
-- organização, mutável e apagável à vontade. O que precisa ser imutável é o
-- desenho publicado — e o tipo viaja COPIADO para o payload canônico da peça
-- (medidas, classificação, potência), nunca por referência. Apagar um tipo
-- daqui não mexe em planta nenhuma; "quais peças são deste tipo" é pergunta de
-- ASSINATURA (as mesmas propriedades), não de id.
--
-- Uma tabela para as quatro famílias, com as propriedades em JSONB: a forma de
-- cada família é do kernel (`utils/blueprintTipos.ts`), e uma família nova
-- não pode exigir migration. Parede e esquadria ficam onde estão — mover as
-- duas para cá seria migração de dados sem ganho para quem usa.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
--
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270918000040_blueprint_element_types.sql
--    NUNCA `supabase db push`.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_element_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- A família, como TEXTO com a lista fechada de hoje. Ampliar a lista é uma
    -- migration de um CHECK — barato — e mantém o banco recusando lixo.
    familia         TEXT NOT NULL CHECK (familia IN ('ESTRUTURA','TERMINAL','ESCADA','TELHADO')),
    nome            TEXT NOT NULL,

    -- As propriedades COPIÁVEIS da família, na forma que `utils/blueprintTipos.ts`
    -- declara (ex.: estrutura = kind, larguraMm, profundidadeMm, alturaMm,
    -- baseMm, circular). Não se valida aqui: quem recusa valor inválido é o
    -- kernel, ao aplicar.
    propriedades    JSONB NOT NULL DEFAULT '{}'::jsonb,

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_element_type_nome_nao_vazio CHECK (length(trim(nome)) > 0),
    CONSTRAINT blueprint_element_type_unique UNIQUE (organization_id, familia, nome)
);

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_element_type_org_familia
    ON public.blueprint_element_types(organization_id, familia) WHERE active;

COMMENT ON TABLE public.blueprint_element_types IS
  'Tipos de elemento (estrutura, ponto de instalação, escada, telhado) salvos por '
  'organização, para reaplicar em qualquer planta. Configuração mutável: a peça '
  'publicada carrega as propriedades copiadas no payload canônico, não um id daqui.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_element_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_element_type_org_read" ON public.blueprint_element_types;
CREATE POLICY "blueprint_element_type_org_read" ON public.blueprint_element_types
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_element_type_org_insert" ON public.blueprint_element_types;
CREATE POLICY "blueprint_element_type_org_insert" ON public.blueprint_element_types
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_element_type_org_update" ON public.blueprint_element_types;
CREATE POLICY "blueprint_element_type_org_update" ON public.blueprint_element_types
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_element_type_org_delete" ON public.blueprint_element_types;
CREATE POLICY "blueprint_element_type_org_delete" ON public.blueprint_element_types
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_element_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_element_types TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0, fk_auth_users=0
SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_element_types')            AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_element_types'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_element_types')            AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='blueprint_element_types'
      AND grantee='anon')                                                         AS anon_grants,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_element_types'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
