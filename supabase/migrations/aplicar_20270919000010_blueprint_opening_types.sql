-- ============================================================================
-- Tipos de esquadria — o catálogo de portas e janelas por organização
-- Plano: docs/planos/2026-09-05-planta-inteligente-tipos-de-esquadria.md
--
-- "P1 — porta de madeira semi-oca 80×210 — item 90843" é o que se repete em
-- toda porta interna de toda planta. Sem um lugar para guardar, o usuário
-- redigita largura, altura e item porta a porta — e uma sai 80×200 sem que
-- nada acuse.
--
-- Espelha `aplicar_20270905000031_blueprint_wall_types.sql`, decisão por
-- decisão: é CONFIGURAÇÃO da organização, mutável e apagável à vontade. O que
-- precisa ser imutável é o desenho publicado — e o tipo viaja COPIADO dentro
-- do payload canônico da abertura (`Opening.esquadria`), então apagar um tipo
-- daqui não mexe em nenhuma planta que já o usou.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
--
-- ⚠️ APLICAR À MÃO:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270919000010_blueprint_opening_types.sql
--    NUNCA `supabase db push` — o histórico tem migrations 2027* fora de
--    `schema_migrations`, e o push as reexecutaria.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_opening_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Como o projeto chama: "P1", "J3". É o que vai para o quadro de
    -- esquadrias e para o IfcDoorType.Name.
    nome            TEXT NOT NULL,

    -- `Opening['kind']` do kernel, como TEXTO: o catálogo de tipos é do kernel,
    -- e um tipo novo não pode exigir migration. Vão livre não entra: não há
    -- caixilho a catalogar.
    kind            TEXT NOT NULL CHECK (kind IN ('door','window','sliding')),
    width_mm        INTEGER NOT NULL CHECK (width_mm > 0),
    height_mm       INTEGER NOT NULL CHECK (height_mm > 0),
    sill_mm         INTEGER NOT NULL DEFAULT 0 CHECK (sill_mm >= 0),
    -- Só faz sentido em `sliding`; guardado sempre pela razão do kernel.
    embutida        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Item de catálogo (SINAPI ou base própria). `''` = tipo nomeado antes de
    -- escolher o item, que é fluxo normal — a abertura entra no quadro e sai
    -- do orçamento com divergência, não calada.
    item_code       TEXT NOT NULL DEFAULT '',
    descricao       TEXT NOT NULL DEFAULT '',

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_opening_type_nome_nao_vazio CHECK (length(trim(nome)) > 0),

    -- Nome é como o usuário identifica o tipo no seletor e no quadro. Dois
    -- "P1" na mesma organização seriam indistinguíveis nos dois lugares.
    CONSTRAINT blueprint_opening_type_unique UNIQUE (organization_id, nome)
);

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_opening_type_org
    ON public.blueprint_opening_types(organization_id) WHERE active;

COMMENT ON TABLE public.blueprint_opening_types IS
  'Tipos de esquadria (porta, janela, correr) salvos por organização, para '
  'reaplicar em qualquer planta. Configuração mutável: o tipo de uma abertura '
  'publicada vive copiado no payload canônico dela (Opening.esquadria), não aqui.';

COMMENT ON COLUMN public.blueprint_opening_types.nome IS
  'Código de projeto ("P1", "J3"). Vai para o quadro de esquadrias e para o IfcDoorType.Name.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
-- Configuração, e portanto editável nas quatro operações — ao contrário dos
-- snapshots, que só têm SELECT e INSERT.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_opening_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_opening_type_org_read" ON public.blueprint_opening_types;
CREATE POLICY "blueprint_opening_type_org_read" ON public.blueprint_opening_types
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_opening_type_org_insert" ON public.blueprint_opening_types;
CREATE POLICY "blueprint_opening_type_org_insert" ON public.blueprint_opening_types
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_opening_type_org_update" ON public.blueprint_opening_types;
CREATE POLICY "blueprint_opening_type_org_update" ON public.blueprint_opening_types
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_opening_type_org_delete" ON public.blueprint_opening_types;
CREATE POLICY "blueprint_opening_type_org_delete" ON public.blueprint_opening_types
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- `anon` NUNCA: catálogo de organização não tem por que ser legível por link
-- público. Ver o rollout de drop-anon.
REVOKE ALL ON public.blueprint_opening_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_opening_types TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0, fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_opening_types')            AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_opening_types'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_opening_types')            AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='blueprint_opening_types'
      AND grantee='anon')                                                         AS anon_grants,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_opening_types'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
