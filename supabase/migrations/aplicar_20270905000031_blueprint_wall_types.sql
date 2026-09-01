-- ============================================================================
-- Tipos de parede — composições de camadas salvas por organização
-- Plano: docs/planos/2026-09-01-parede-camadas.md
--
-- Montar "bloco 140 + reboco 25 nas duas faces" é o gesto que se repete em toda
-- parede externa de toda planta. Sem um lugar para guardar a composição, o
-- usuário remonta as três camadas parede a parede — e uma delas sai com 20 em
-- vez de 25 sem que nada acuse.
--
-- Espelha `aplicar_20270905000005_blueprint_budget_mappings.sql`: é
-- CONFIGURAÇÃO da organização, mutável e apagável à vontade. O que precisa ser
-- imutável é o desenho publicado, não o modelo que o originou — a composição
-- viaja DENTRO do payload canônico da parede, então apagar um tipo daqui não
-- mexe em nenhuma planta que já o usou.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
--
-- ⚠️ APLICAR À MÃO, **UM BLOCO POR VEZ**:
--    npx supabase db query --linked -f supabase/migrations/aplicar_20270905000031_blueprint_wall_types.sql
--    NUNCA `supabase db push` — o histórico tem migrations 2027* fora de
--    `schema_migrations`, e o push as reexecutaria.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_wall_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Como o usuário chama a composição: "Externa 190", "Interna gesso 100".
    nome            TEXT NOT NULL,

    -- `CamadaParede[]` do kernel (utils/blueprintKernel/model.ts), na ordem da
    -- face esquerda para a direita. JSONB e não tabela filha de propósito: a
    -- lista é curta, sempre lida inteira, e o kernel já a trata como um valor
    -- único — `SetWallLayers` substitui a composição toda de uma vez.
    --
    -- Cada item: { espessuraMm:int>0, itemCode:text, descricao:text, funcao:text }
    -- `funcao` fica como TEXTO, não enum do Postgres, pela mesma razão que
    -- `blueprint_budget_mappings.medida`: o catálogo é do kernel, e uma função
    -- nova não pode exigir migration.
    camadas         JSONB NOT NULL DEFAULT '[]'::jsonb,

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composição vazia não é tipo de parede — é o mesmo `EMPTY_LAYERS` que o
    -- kernel recusa, trazido para a borda do banco.
    CONSTRAINT blueprint_wall_type_camadas_nao_vazio
        CHECK (jsonb_typeof(camadas) = 'array' AND jsonb_array_length(camadas) > 0),

    -- Nome é como o usuário identifica o tipo no seletor. Dois com o mesmo nome
    -- na mesma organização seriam indistinguíveis na tela.
    CONSTRAINT blueprint_wall_type_unique UNIQUE (organization_id, nome)
);

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_wall_type_org
    ON public.blueprint_wall_types(organization_id) WHERE active;

COMMENT ON TABLE public.blueprint_wall_types IS
  'Composições de camadas de parede salvas por organização, para reaplicar em '
  'qualquer planta. Configuração mutável: a composição de uma parede publicada '
  'vive no payload canônico dela, não aqui.';

COMMENT ON COLUMN public.blueprint_wall_types.camadas IS
  'CamadaParede[] do kernel, da face esquerda para a direita do sentido a→b. '
  '{ espessuraMm, itemCode, descricao, funcao }. A soma das espessuras vira a '
  'espessura da parede ao aplicar.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
-- Configuração, e portanto editável nas quatro operações — ao contrário dos
-- snapshots, que só têm SELECT e INSERT.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_wall_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_wall_type_org_read" ON public.blueprint_wall_types;
CREATE POLICY "blueprint_wall_type_org_read" ON public.blueprint_wall_types
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_wall_type_org_insert" ON public.blueprint_wall_types;
CREATE POLICY "blueprint_wall_type_org_insert" ON public.blueprint_wall_types
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_wall_type_org_update" ON public.blueprint_wall_types;
CREATE POLICY "blueprint_wall_type_org_update" ON public.blueprint_wall_types
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_wall_type_org_delete" ON public.blueprint_wall_types;
CREATE POLICY "blueprint_wall_type_org_delete" ON public.blueprint_wall_types
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

-- `anon` NUNCA: catálogo de organização não tem por que ser legível por link
-- público. Ver o rollout de drop-anon.
REVOKE ALL ON public.blueprint_wall_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_wall_types TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, anon_grants=0, fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_wall_types')               AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_wall_types'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_wall_types')               AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='blueprint_wall_types'
      AND grantee='anon')                                                         AS anon_grants,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_wall_types'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
