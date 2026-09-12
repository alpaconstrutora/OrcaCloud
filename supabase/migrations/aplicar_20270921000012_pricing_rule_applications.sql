-- ============================================================================
-- Registro do que a Inteligência aplicou (Comercial › Gestão de Unidades).
--
-- O PROBLEMA que isto resolve: até aqui não existia registro de "quais regras
-- geraram este preço". A coluna "Regras da Inteligência" da Tabela de aluguéis
-- reavaliava as regras ATIVAS HOJE contra os atributos ATUAIS da unidade — se
-- alguém editasse a regra depois do Aplicar, a coluna passava a explicar o
-- preço por uma regra que nunca o produziu, sem avisar.
--
-- Uma linha por unidade por finalidade (RENTAL/SALE): a ÚLTIMA aplicação. Não é
-- tabela de histórico — a pergunta que ela responde é "o preço que está aí veio
-- de quê?", e essa pergunta só tem uma resposta por vez. Por isso o UNIQUE em
-- (property_id, purpose), com upsert a cada Aplicar.
--
-- `base_price` é o contrafactual EXATO calculado pelo motor: o que a unidade
-- receberia se nenhuma regra existisse, já considerando a redistribuição do
-- modo de alvo total (onde tirar % de uma unidade dá % a todas as outras).
-- É o que permite a tela mostrar R$ por regra sem aproximar.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ, no SQL Editor do Supabase (ou via
--    `npx supabase db query --linked -f`). Nunca `supabase db push`.
-- ============================================================================

-- ═══ BLOCO 1 — a tabela ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.pricing_rule_applications (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Refs LÓGICAS a commercial_properties(id) — o edifício e a unidade. Sem FK,
    -- pelo mesmo motivo de rental_pricing_rules.building_property_id: tabela
    -- quente, DDL com FK deadlocka contra o tráfego. Consequência assumida:
    -- registro fica órfão se a unidade for excluída; a tela lista por
    -- building_property_id e cruza por property_id, então órfão não aparece.
    building_property_id UUID NOT NULL,
    property_id          UUID NOT NULL,

    -- De qual espelho veio a aplicação. A MESMA unidade de empreendimento pode
    -- ter espelho em Locações e em Venda de Ativos, com preços independentes.
    purpose              TEXT NOT NULL CHECK (purpose IN ('RENTAL','SALE')),

    -- Estratégia do motor no momento do Aplicar. Decide como `base_price` foi
    -- obtido: PER_SQM é proporcional direto; os de alvo total redistribuem o
    -- bolo fixo entre as unidades.
    mode                 TEXT NOT NULL CHECK (mode IN ('PER_SQM','TARGET_TOTAL','TARGET_VGV')),

    -- Preço gravado na unidade por esta aplicação (rental_price ou price).
    price                NUMERIC NOT NULL,
    -- Contrafactual exato: o preço que a unidade teria sem NENHUMA regra.
    base_price           NUMERIC NOT NULL,
    -- price - base_price. Pode ser NEGATIVO mesmo sem regra na unidade: no modo
    -- de alvo total, regra em OUTRA unidade tira participação desta.
    total_amount         NUMERIC NOT NULL DEFAULT 0,
    -- Soma dos percentuais das regras que casaram com ESTA unidade.
    total_pct            NUMERIC NOT NULL DEFAULT 0,

    -- Congelado no momento do Aplicar:
    -- [{ rule_id, name, attribute_label, pct, amount }]
    -- `name`/`attribute_label` ficam aqui para a linha continuar legível depois
    -- de a regra ser renomeada ou excluída — mesma razão do attribute_label
    -- congelado em rental_pricing_rules.
    rules                JSONB NOT NULL DEFAULT '[]'::jsonb,

    applied_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by           UUID,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_rule_applications_unidade_uk UNIQUE (property_id, purpose)
);

COMMENT ON TABLE public.pricing_rule_applications IS
  'Ultima aplicacao da Inteligencia por unidade/finalidade: quais regras casaram, quanto '
  'cada uma pesou em R$ e qual seria o preco sem regra nenhuma. Uma linha por '
  '(property_id, purpose) - upsert a cada Aplicar, nao e historico.';

COMMENT ON COLUMN public.pricing_rule_applications.base_price IS
  'Contrafactual exato calculado pelo motor: preco da unidade sem NENHUMA regra, ja com a '
  'redistribuicao do modo de alvo total considerada.';

COMMENT ON COLUMN public.pricing_rule_applications.total_amount IS
  'price - base_price. Negativo sem regra na unidade e esperado no modo de alvo total: '
  'regra em outra unidade tira participacao desta.';

COMMENT ON COLUMN public.pricing_rule_applications.rules IS
  'Regras congeladas: [{rule_id,name,attribute_label,pct,amount}]. Nome congelado mantem a '
  'linha legivel se a regra for renomeada ou excluida.';

-- ═══ BLOCO 2 — índices e trigger de updated_at ═════════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_pricing_rule_applications_building
    ON public.pricing_rule_applications(building_property_id, purpose);
CREATE INDEX IF NOT EXISTS idx_pricing_rule_applications_org
    ON public.pricing_rule_applications(organization_id);

DROP TRIGGER IF EXISTS set_updated_at_pricing_rule_applications ON public.pricing_rule_applications;
CREATE TRIGGER set_updated_at_pricing_rule_applications BEFORE UPDATE ON public.pricing_rule_applications
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 3 — RLS ══════════════════════════════════════════════════════════
-- Sem policy para `anon`: nasce do lado certo do rollout drop-anon, igual à
-- rental_pricing_rules (...030). Toda perna do USING checa a organização — não
-- existe aqui um `OR is_shared` que libere a linha sozinho (REGRA #7, P1).
SET lock_timeout = '5s';

ALTER TABLE public.pricing_rule_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_rule_applications_org_read" ON public.pricing_rule_applications;
CREATE POLICY "pricing_rule_applications_org_read" ON public.pricing_rule_applications
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "pricing_rule_applications_org_insert" ON public.pricing_rule_applications;
CREATE POLICY "pricing_rule_applications_org_insert" ON public.pricing_rule_applications
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "pricing_rule_applications_org_update" ON public.pricing_rule_applications;
CREATE POLICY "pricing_rule_applications_org_update" ON public.pricing_rule_applications
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "pricing_rule_applications_org_delete" ON public.pricing_rule_applications;
CREATE POLICY "pricing_rule_applications_org_delete" ON public.pricing_rule_applications
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.pricing_rule_applications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rule_applications TO authenticated;

-- ═══ BLOCO 4 — conferência ═════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, anon_policies=0, indices=2, trigger=1, unique=1

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='pricing_rule_applications')                  AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='pricing_rule_applications' AND rowsecurity)  AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='pricing_rule_applications')                  AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='pricing_rule_applications'
      AND 'anon' = ANY(roles))                                                            AS anon_policies,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public'
      AND indexname IN ('idx_pricing_rule_applications_building','idx_pricing_rule_applications_org'))
                                                                                          AS indices,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname='set_updated_at_pricing_rule_applications')                              AS trigger_updated_at,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='pricing_rule_applications_unidade_uk')                                 AS unique_unidade;

-- FIM: aplicar_20270921000012_pricing_rule_applications.sql
