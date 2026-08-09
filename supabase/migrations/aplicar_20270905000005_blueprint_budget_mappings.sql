-- ============================================================================
-- RF-122 — de-para entre a geometria e o orçamento
-- Plano: docs/planos/2026-08-09-quantitativos.md
--
-- É o último trecho do caminho que faz a planta valer alguma coisa: sem ele o
-- quantitativo fica bonito numa tela e o orçamento continua sendo digitado.
--
-- Diferente de `blueprint_quantity_snapshots`, esta tabela é CONFIGURAÇÃO, não
-- resultado: pode ser editada e apagada à vontade. O que precisa ser imutável é
-- o quantitativo gravado, não a regra que um dia o produziu — e por isso a linha
-- de orçamento gerada carrega a política e o hash da versão dentro dela, em vez
-- de depender desta tabela para se explicar depois.
--
-- ⚠️ SEM FK PARA auth.users (ver aplicar_20270905000004).
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor, **UM BLOCO POR VEZ**. DDL e leitura de
--    catálogo na mesma transação foi metade do deadlock da 000003.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_budget_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Id de `MEDIDAS` em utils/blueprintBudget.ts. Fica como TEXTO e não como
    -- enum do Postgres de propósito: o catálogo de medidas é do kernel, e uma
    -- medida nova não pode exigir migration. O código recusa medida
    -- desconhecida com divergência explícita, que é a validação que interessa.
    medida          TEXT NOT NULL,

    -- Código no catálogo — SINAPI ou base própria. É o MESMO espaço de códigos,
    -- porque `custom_items` sobrepõe `sinapi_items` por código. Não há decisão
    -- de "qual catálogo" a tomar aqui: quem escolhe é o próprio código.
    item_code       TEXT NOT NULL,

    phase           TEXT NOT NULL DEFAULT '',
    budget_group    TEXT NOT NULL DEFAULT '',

    -- TOTAL soma tudo numa linha; POR_ELEMENTO gera uma por ambiente/parede.
    -- Sem default óbvio: por elemento preserva a medição e o `location.room`,
    -- mas 40 ambientes × 3 medidas viram 120 linhas. Quem monta decide.
    agrupamento     TEXT NOT NULL DEFAULT 'TOTAL'
                    CHECK (agrupamento IN ('TOTAL', 'POR_ELEMENTO')),

    -- Só aplica a ambientes cujo nome contenha um destes termos. Existe porque
    -- revestimento de parede é de área molhada, não da casa inteira.
    filtro_ambiente TEXT[] NOT NULL DEFAULT '{}',

    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A mesma medida pode ir para itens diferentes (piso cerâmico e contrapiso
    -- saem os dois da área de piso), então a chave inclui o item. O que não faz
    -- sentido é a MESMA medida no MESMO item duas vezes.
    CONSTRAINT blueprint_map_unique UNIQUE (organization_id, medida, item_code)
);

-- ═══ BLOCO 2 — índice e comentários ═════════════════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_map_org
    ON public.blueprint_budget_mappings(organization_id) WHERE active;

COMMENT ON TABLE public.blueprint_budget_mappings IS
  'RF-122: de-para entre medida geométrica e item de orçamento. A unidade do '
  'item TEM de bater com a dimensão da medida — a verificação vive em '
  'utils/blueprintBudget.ts e recusa a geração, não apenas avisa.';

COMMENT ON COLUMN public.blueprint_budget_mappings.medida IS
  'Id de MEDIDAS (utils/blueprintBudget.ts). Texto, não enum: medida nova não '
  'pode exigir migration.';

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
-- Configuração, e portanto editável — ao contrário dos snapshots, que só têm
-- SELECT e INSERT.
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_budget_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_map_org_read" ON public.blueprint_budget_mappings;
CREATE POLICY "blueprint_map_org_read" ON public.blueprint_budget_mappings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_map_org_insert" ON public.blueprint_budget_mappings;
CREATE POLICY "blueprint_map_org_insert" ON public.blueprint_budget_mappings
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_map_org_update" ON public.blueprint_budget_mappings;
CREATE POLICY "blueprint_map_org_update" ON public.blueprint_budget_mappings
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_map_org_delete" ON public.blueprint_budget_mappings;
CREATE POLICY "blueprint_map_org_delete" ON public.blueprint_budget_mappings
    FOR DELETE TO authenticated
    USING (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_budget_mappings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_budget_mappings TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_budget_mappings')          AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_budget_mappings'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_budget_mappings')          AS policies,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
     JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname='blueprint_budget_mappings'
      AND rt.relname='users' AND rn.nspname='auth')                               AS fk_auth_users;
