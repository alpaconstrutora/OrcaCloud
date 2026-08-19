-- ============================================================================
-- Regras de ajuste percentual da aba "Inteligência" (Comercial › Gestão de
-- Locações › Gestão de Unidades).
--
-- Cada linha é UMA REGRA: característica + condição + percentual. Ex:
--   área privativa  >  15 m²          → +5%
--   área privativa  >  30 m²          → +10%
--   Acessibilidade  contém Elevador   → +3%
--
-- O percentual NÃO sobrescreve aluguel por fora: ele entra como um 6º fator
-- multiplicativo no score do modelo hedônico existente
-- (services/rentalPricingService.ts), somando-se aos demais percentuais que
-- casarem com a mesma unidade (5% + 3% = fator 1,08). É essa escolha que
-- preserva a soma exata no modo "aluguel-alvo total" — um pós-processamento
-- sobre o rental_price já calculado quebraria o alvo.
--
-- `attribute_key` aponta ou para um campo físico da unidade (`private_area`,
-- `floor`, `view_type`, …) ou para uma característica do catálogo criado na
-- migration ...029, no formato `carac:<uuid>`.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ, no SQL Editor do Supabase. O editor roda
--    o script inteiro como UMA transação: um erro no meio desfaz o resto.
-- ============================================================================

-- ═══ BLOCO 1 — a tabela ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.rental_pricing_rules (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Referência LÓGICA a commercial_properties(id) — o edifício aberto na
    -- Gestão de Unidades. SEM FK de propósito: commercial_properties é tabela
    -- quente e DDL com FK deadlocka contra o tráfego normal. Mesmo motivo e
    -- mesmo padrão de rental_price_tables.building_id (20270824000002, l.10-18).
    -- Consequência assumida: a regra fica órfã se o edifício for excluído; a
    -- tela lista por building_property_id, então regra órfã simplesmente não
    -- aparece em lugar nenhum.
    building_property_id UUID NOT NULL,

    -- Campo físico da unidade ('private_area', 'floor', 'view_type', ...) ou
    -- característica do catálogo no formato 'carac:<uuid>'
    -- (empreendimento_unit_characteristics.id, migration ...029).
    attribute_key        TEXT NOT NULL,

    -- Rótulo CONGELADO no momento do cadastro. É o que impede a regra de virar
    -- lixo ilegível quando a característica é renomeada ou excluída do
    -- catálogo — sem ele, uma regra apontando para um 'carac:<uuid>' apagado
    -- não teria como se explicar na tela.
    attribute_label      TEXT NOT NULL,

    operator             TEXT NOT NULL CHECK (operator IN (
                             'gt','gte','lt','lte','eq','neq','between',
                             'contains','not_contains','is_set','is_not_set'
                         )),

    -- value_num2 só é usado por 'between'. value_text guarda opção de
    -- característica (o `value` da opção) ou texto livre.
    value_num            NUMERIC,
    value_num2           NUMERIC,
    value_text           TEXT,

    -- Pode ser NEGATIVO (desconto). Somado, não composto.
    adjust_pct           NUMERIC NOT NULL DEFAULT 0,

    active               BOOLEAN NOT NULL DEFAULT true,
    sort_order           INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.rental_pricing_rules IS
  'Regras de ajuste percentual do aluguel por edifício (aba Inteligência em Gestão de '
  'Unidades). Uma linha = uma regra. O percentual entra como fator multiplicativo no '
  'score hedônico de rentalPricingService, somando-se entre regras que casam.';

COMMENT ON COLUMN public.rental_pricing_rules.building_property_id IS
  'Ref. lógica a commercial_properties(id) — sem FK: tabela quente, DDL com FK deadlocka '
  '(mesmo padrão de rental_price_tables.building_id).';

COMMENT ON COLUMN public.rental_pricing_rules.attribute_label IS
  'Rótulo congelado no cadastro. Mantém a regra legível mesmo se a característica for '
  'renomeada ou excluída do catálogo.';

COMMENT ON COLUMN public.rental_pricing_rules.adjust_pct IS
  'Percentual de ajuste. Negativo = desconto. Regras que casam na mesma unidade SOMAM '
  '(5 + 3 = 8 => fator 1,08), nao compoem.';

-- ═══ BLOCO 2 — índices e trigger de updated_at ═════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_rental_pricing_rules_building
    ON public.rental_pricing_rules(building_property_id);
CREATE INDEX IF NOT EXISTS idx_rental_pricing_rules_org
    ON public.rental_pricing_rules(organization_id);

DROP TRIGGER IF EXISTS set_updated_at_rental_pricing_rules ON public.rental_pricing_rules;
CREATE TRIGGER set_updated_at_rental_pricing_rules BEFORE UPDATE ON public.rental_pricing_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
-- Sem policy para `anon` — tabela nasce do lado certo do rollout drop-anon,
-- igual à ...029 desta mesma frente.
SET lock_timeout = '5s';

ALTER TABLE public.rental_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_pricing_rules_org_read" ON public.rental_pricing_rules;
CREATE POLICY "rental_pricing_rules_org_read" ON public.rental_pricing_rules
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "rental_pricing_rules_org_insert" ON public.rental_pricing_rules;
CREATE POLICY "rental_pricing_rules_org_insert" ON public.rental_pricing_rules
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "rental_pricing_rules_org_update" ON public.rental_pricing_rules;
CREATE POLICY "rental_pricing_rules_org_update" ON public.rental_pricing_rules
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "rental_pricing_rules_org_delete" ON public.rental_pricing_rules;
CREATE POLICY "rental_pricing_rules_org_delete" ON public.rental_pricing_rules
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.rental_pricing_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_pricing_rules TO authenticated;

-- ═══ BLOCO 4 — conferência ═════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, anon_policies=0, indices=2, trigger=1

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='rental_pricing_rules')                  AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='rental_pricing_rules' AND rowsecurity)  AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='rental_pricing_rules')                  AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='rental_pricing_rules'
      AND 'anon' = ANY(roles))                                                       AS anon_policies,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public'
      AND indexname IN ('idx_rental_pricing_rules_building','idx_rental_pricing_rules_org'))
                                                                                      AS indices,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname='set_updated_at_rental_pricing_rules')                              AS trigger_updated_at;

-- FIM: aplicar_20270905000030_rental_pricing_rules.sql
