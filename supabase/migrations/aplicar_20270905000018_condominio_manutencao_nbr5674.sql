-- ============================================================================
-- ÒPURA Pós-Entrega — F1: Manutenção predial (NBR 5674)
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F1)
--
-- O QUE NÃO EXISTIA E É A RAZÃO DESTA MIGRATION: **periodicidade**. Não há
-- nenhuma coluna de recorrência ou próximo vencimento em lugar nenhum do
-- repositório — `opura_asset_maintenances` tem `scheduled_date` e nada mais,
-- o que faz dela agendamento avulso, não plano cíclico. Sem "de quanto em
-- quanto tempo" e "quando vence de novo", não existe plano de manutenção:
-- existe lista de tarefas que alguém tem de lembrar de recriar.
--
-- POR QUE NÃO REUSAR `work_orders`: ela é `project_id NOT NULL` com `phase`,
-- `budget_item_ref`, `planned_productivity`, `measurement_unit`, `team_id →
-- labor_teams` e status que termina em `measured`. É OS de PRODUÇÃO DE OBRA
-- MEDIDA. Manutenção predial não tem medição de produção, não tem fase de
-- obra e não tem projeto obrigatório — o edifício já foi entregue. Forçar as
-- duas na mesma tabela contamina os dois domínios.
--
-- O QUE É REUSADO DE VERDADE: `opura_assets`. Elevador, bomba, gerador e
-- portão são ativos, com hierarquia (`parent_asset_id`), documentos e
-- histórico já prontos. `category` é VARCHAR livre (sem CHECK), então a
-- categoria nova entra sem DDL de constraint.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — taxonomia de sistemas prediais ═══════════════════════════════
-- Catálogo por organização, não enum: cada empreendimento tem sistemas
-- diferentes (nem todo prédio tem gerador, nem toda galeria tem elevador), e a
-- NBR 5674 remete à NBR 14037 para o rol, que muda por tipologia.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.building_systems (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,
    /** Norma de referência do sistema (ex.: 'NBR 16083' para elevadores). */
    norm_ref        TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_building_systems_slug
    ON public.building_systems(organization_id, slug);

COMMENT ON TABLE public.building_systems IS
  'Taxonomia de sistemas prediais (elevador, bomba, SPDA, gerador, fachada). '
  'Catálogo por organização — o rol muda por tipologia de edifício.';

-- ═══ BLOCO 2 — o equipamento instalado é um ATIVO ═══════════════════════════
-- Sem tabela nova de equipamento: `opura_assets` já tem hierarquia, documentos
-- e histórico. O que falta é dizer A QUE EDIFÍCIO e A QUE SISTEMA ele pertence.
SET lock_timeout = '5s';

ALTER TABLE public.opura_assets
  ADD COLUMN IF NOT EXISTS empreendimento_id   UUID,
  ADD COLUMN IF NOT EXISTS building_system_id  UUID,
  -- Garantia do FORNECEDOR do equipamento. É outra coisa da garantia
  -- construtora→cliente de `warranty_terms`: aqui quem deve é quem vendeu a
  -- bomba, e o prazo corre da instalação, não da entrega do edifício.
  ADD COLUMN IF NOT EXISTS supplier_warranty_until DATE,
  ADD COLUMN IF NOT EXISTS supplier_id         UUID;

CREATE INDEX IF NOT EXISTS idx_opura_assets_empreendimento
    ON public.opura_assets(empreendimento_id) WHERE empreendimento_id IS NOT NULL;

COMMENT ON COLUMN public.opura_assets.empreendimento_id IS
  'Edifício onde o ativo está INSTALADO (elevador, bomba, portão). Nulo para '
  'frota e ferramenta de obra, que é o uso original da tabela. Use a categoria '
  '"sistema_predial" — `category` é VARCHAR livre, sem CHECK.';

COMMENT ON COLUMN public.opura_assets.supplier_warranty_until IS
  'Garantia do FORNECEDOR do equipamento — não confundir com warranty_terms, '
  'que é a garantia da construtora ao comprador.';

-- ═══ BLOCO 2B — as chaves estrangeiras, sozinhas ════════════════════════════
-- `opura_assets` fica quente com o módulo de Gestão de Bens aberto; FK exige
-- ShareRowExclusiveLock na tabela referenciada. Mesma família do deadlock de
-- aplicar_20270905000013. Se der 40P01, repetir com o app fechado.
SET lock_timeout = '5s';

ALTER TABLE public.opura_assets
  DROP CONSTRAINT IF EXISTS opura_assets_empreendimento_fk;
ALTER TABLE public.opura_assets
  ADD CONSTRAINT opura_assets_empreendimento_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

ALTER TABLE public.opura_assets
  DROP CONSTRAINT IF EXISTS opura_assets_building_system_fk;
ALTER TABLE public.opura_assets
  ADD CONSTRAINT opura_assets_building_system_fk
  FOREIGN KEY (building_system_id) REFERENCES public.building_systems(id) ON DELETE SET NULL;

-- ═══ BLOCO 3 — o plano de manutenção ════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.maintenance_plans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL,
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    -- VIGENTE é único por edifício (índice no bloco 5): dois planos vigentes ao
    -- mesmo tempo é a forma mais rápida de ninguém saber qual seguir.
    status            TEXT NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO','VIGENTE','SUBSTITUIDO')),
    norm_ref          TEXT NOT NULL DEFAULT 'NBR 5674',
    valid_from        DATE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenance_plan_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id            UUID NOT NULL,
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    building_system_id UUID,
    /** Nulo = o item vale para o sistema inteiro, não para um equipamento específico. */
    asset_id           UUID,

    description        TEXT NOT NULL,

    -- ── A RAZÃO DESTA MIGRATION EXISTIR ────────────────────────────────────
    -- Periodicidade como VALOR + UNIDADE, não como enum de rótulos: a NBR usa
    -- de "semanal" a "plurianual", e um enum obrigaria migration a cada
    -- periodicidade nova que um fabricante exigir.
    periodicity_value  INTEGER NOT NULL CHECK (periodicity_value > 0),
    periodicity_unit   TEXT NOT NULL CHECK (periodicity_unit IN ('DIA','SEMANA','MES','ANO')),

    /** Quando venceu pela última vez de fato. Nulo = nunca executado. */
    last_executed_at   DATE,
    /** Derivado de last_executed_at + periodicidade pela fn_maintenance_next_due. */
    next_due_date      DATE,

    responsible_type   TEXT NOT NULL DEFAULT 'EQUIPE_LOCAL'
                        CHECK (responsible_type IN (
                            'EQUIPE_LOCAL',            -- zelador/manutenção própria
                            'EMPRESA_ESPECIALIZADA',   -- contrato de terceiro
                            'FABRICANTE',
                            'ORGAO_PUBLICO'            -- ex.: laudo do corpo de bombeiros
                        )),
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.maintenance_plan_items.periodicity_unit IS
  'Com periodicity_value forma "de quanto em quanto tempo". É a coluna que NÃO '
  'existia em lugar nenhum do repositório antes desta migration — sem ela, '
  'manutenção é agendamento avulso, não plano cíclico.';

COMMENT ON COLUMN public.maintenance_plan_items.next_due_date IS
  'DERIVADO. Recalculado por fn_maintenance_next_due ao concluir uma OS. Item '
  'nunca executado recebe a data a partir de valid_from do plano.';

-- ═══ BLOCO 4 — a ordem de serviço de manutenção ═════════════════════════════
-- Tabela NOVA, irmã de work_orders e deliberadamente sem `project_id`
-- obrigatório, sem `phase`, sem `planned_productivity` e sem `measurement_unit`.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.maintenance_orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id  UUID NOT NULL,
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    /** Nulo em CORRETIVA: quebrou, não estava no plano. */
    plan_item_id       UUID,
    building_system_id UUID,
    asset_id           UUID,
    /** Nulo quando o serviço é em área comum, não numa unidade. */
    unit_id            UUID,

    code               TEXT,
    type               TEXT NOT NULL CHECK (type IN ('PREVENTIVA','CORRETIVA','INSPECAO')),
    priority           TEXT NOT NULL DEFAULT 'NORMAL'
                        CHECK (priority IN ('BAIXA','NORMAL','ALTA','EMERGENCIA')),
    -- Sem 'measured': manutenção não é medida para pagamento de produção.
    status             TEXT NOT NULL DEFAULT 'ABERTA'
                        CHECK (status IN ('ABERTA','AGENDADA','EM_EXECUCAO','CONCLUIDA','CANCELADA')),

    description        TEXT NOT NULL,
    scheduled_date     DATE,
    executed_date      DATE,
    cost               NUMERIC(15,2) NOT NULL DEFAULT 0,
    supplier_id        UUID,
    executed_by        TEXT,
    findings           TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- OS concluída sem data de execução deixa o plano sem âncora para calcular
    -- o próximo vencimento — o ciclo silenciosamente para de andar.
    CONSTRAINT maintenance_orders_concluida_tem_data
        CHECK (status <> 'CONCLUIDA' OR executed_date IS NOT NULL)
);

-- ═══ BLOCO 5 — chaves, índices e invariantes ════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.maintenance_plans
  DROP CONSTRAINT IF EXISTS maintenance_plans_empreendimento_fk;
ALTER TABLE public.maintenance_plans
  ADD CONSTRAINT maintenance_plans_empreendimento_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_plan_fk;
ALTER TABLE public.maintenance_plan_items
  ADD CONSTRAINT maintenance_plan_items_plan_fk
  FOREIGN KEY (plan_id) REFERENCES public.maintenance_plans(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_system_fk;
ALTER TABLE public.maintenance_plan_items
  ADD CONSTRAINT maintenance_plan_items_system_fk
  FOREIGN KEY (building_system_id) REFERENCES public.building_systems(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_orders
  DROP CONSTRAINT IF EXISTS maintenance_orders_empreendimento_fk;
ALTER TABLE public.maintenance_orders
  ADD CONSTRAINT maintenance_orders_empreendimento_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_orders
  DROP CONSTRAINT IF EXISTS maintenance_orders_plan_item_fk;
ALTER TABLE public.maintenance_orders
  ADD CONSTRAINT maintenance_orders_plan_item_fk
  FOREIGN KEY (plan_item_id) REFERENCES public.maintenance_plan_items(id) ON DELETE SET NULL;

-- Um plano VIGENTE por edifício.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_maintenance_plans_um_vigente
    ON public.maintenance_plans(empreendimento_id)
    WHERE status = 'VIGENTE';

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_empr
    ON public.maintenance_plans(empreendimento_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_plan_items_plan
    ON public.maintenance_plan_items(plan_id) WHERE is_active;
-- O índice que sustenta a tela de vencimentos (o alerta é a razão do plano existir).
CREATE INDEX IF NOT EXISTS idx_maintenance_plan_items_due
    ON public.maintenance_plan_items(next_due_date) WHERE is_active AND next_due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_orders_empr
    ON public.maintenance_orders(empreendimento_id, status);

-- ═══ BLOCO 6 — o ciclo anda sozinho ao concluir a OS ════════════════════════
-- Sem isto o plano é uma lista estática: alguém teria de recalcular a próxima
-- data à mão, e é exatamente aí que um plano de manutenção morre.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_maintenance_next_due(
    p_base DATE, p_value INTEGER, p_unit TEXT
) RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT CASE p_unit
        WHEN 'DIA'    THEN p_base + (p_value || ' days')::INTERVAL
        WHEN 'SEMANA' THEN p_base + (p_value || ' weeks')::INTERVAL
        WHEN 'MES'    THEN p_base + (p_value || ' months')::INTERVAL
        WHEN 'ANO'    THEN p_base + (p_value || ' years')::INTERVAL
    END::DATE;
$fn$;

REVOKE ALL ON FUNCTION public.fn_maintenance_next_due(DATE, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_maintenance_next_due(DATE, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_maintenance_order_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_item public.maintenance_plan_items%ROWTYPE;
BEGIN
    -- Só quando a OS ENTRA em CONCLUIDA e nasceu de um item do plano.
    IF NEW.status <> 'CONCLUIDA' OR NEW.plan_item_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'CONCLUIDA' THEN
        RETURN NEW; -- já contabilizada; reeditar não empurra o ciclo de novo
    END IF;

    SELECT * INTO v_item FROM public.maintenance_plan_items WHERE id = NEW.plan_item_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    UPDATE public.maintenance_plan_items
       SET last_executed_at = NEW.executed_date,
           next_due_date = public.fn_maintenance_next_due(
               NEW.executed_date, v_item.periodicity_value, v_item.periodicity_unit),
           updated_at = NOW()
     WHERE id = NEW.plan_item_id;

    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_maintenance_order_completed() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_maintenance_order_completed ON public.maintenance_orders;
CREATE TRIGGER trg_maintenance_order_completed
    AFTER INSERT OR UPDATE OF status ON public.maintenance_orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_maintenance_order_completed();

-- ═══ BLOCO 7 — updated_at ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS set_updated_at_building_systems ON public.building_systems;
CREATE TRIGGER set_updated_at_building_systems BEFORE UPDATE ON public.building_systems
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_maintenance_plans ON public.maintenance_plans;
CREATE TRIGGER set_updated_at_maintenance_plans BEFORE UPDATE ON public.maintenance_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_maintenance_plan_items ON public.maintenance_plan_items;
CREATE TRIGGER set_updated_at_maintenance_plan_items BEFORE UPDATE ON public.maintenance_plan_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_maintenance_orders ON public.maintenance_orders;
CREATE TRIGGER set_updated_at_maintenance_orders BEFORE UPDATE ON public.maintenance_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 8 — RLS ══════════════════════════════════════════════════════════
-- Sem policy para `anon`, como a 000017.
SET lock_timeout = '5s';

ALTER TABLE public.building_systems        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plan_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_orders      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['building_systems','maintenance_plans','maintenance_plan_items','maintenance_orders']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organization_id))',
            t || '_org_read', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id))',
            t || '_org_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))',
            t || '_org_update', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organization_id))',
            t || '_org_delete', t);

        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
END $$;

-- ═══ BLOCO 9 — semente da taxonomia (opcional, por organização) ═════════════
-- Rol mínimo da NBR 14037/5674 para edifício residencial/comercial. Troque o
-- UUID pela organização alvo. É semente, não catálogo fechado: some/edite à
-- vontade pela tela.
--
-- INSERT INTO public.building_systems (organization_id, name, slug, norm_ref, sort_order)
-- VALUES
--   ('<ORG_UUID>', 'Elevadores',                'elevadores',      'NBR 16083', 10),
--   ('<ORG_UUID>', 'Bombas e recalque',         'bombas',          NULL,        20),
--   ('<ORG_UUID>', 'Reservatórios de água',     'reservatorios',   NULL,        30),
--   ('<ORG_UUID>', 'SPDA (para-raios)',         'spda',            'NBR 5419',  40),
--   ('<ORG_UUID>', 'Instalações elétricas',     'eletrica',        'NBR 5410',  50),
--   ('<ORG_UUID>', 'Instalações hidrossanitárias','hidraulica',    NULL,        60),
--   ('<ORG_UUID>', 'Combate a incêndio',        'incendio',        'NBR 17240', 70),
--   ('<ORG_UUID>', 'Gerador',                   'gerador',         NULL,        80),
--   ('<ORG_UUID>', 'Portões e automação',       'portoes',         NULL,        90),
--   ('<ORG_UUID>', 'Fachada e revestimentos',   'fachada',         NULL,       100),
--   ('<ORG_UUID>', 'Impermeabilização',         'impermeabilizacao', NULL,     110),
--   ('<ORG_UUID>', 'Esquadrias',                'esquadrias',      NULL,       120)
-- ON CONFLICT (organization_id, slug) DO NOTHING;

-- ═══ BLOCO 10 — conferência ═════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabelas=4, com_rls=4, policies=16, anon_policies=0,
--           uidx_plano_vigente=1, trigger_ciclo=1, fn_next_due=1, cols_assets=4

SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('building_systems','maintenance_plans','maintenance_plan_items','maintenance_orders'))        AS tabelas,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity
     AND tablename IN ('building_systems','maintenance_plans','maintenance_plan_items','maintenance_orders'))        AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND tablename IN ('building_systems','maintenance_plans','maintenance_plan_items','maintenance_orders'))        AS policies,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'anon' = ANY(roles)
     AND tablename IN ('building_systems','maintenance_plans','maintenance_plan_items','maintenance_orders'))        AS anon_policies,
  (SELECT count(*) FROM pg_indexes WHERE indexname='uidx_maintenance_plans_um_vigente')                              AS uidx_plano_vigente,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_maintenance_order_completed')                                   AS trigger_ciclo,
  (SELECT count(*) FROM pg_proc WHERE proname='fn_maintenance_next_due')                                             AS fn_next_due,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='opura_assets'
     AND column_name IN ('empreendimento_id','building_system_id','supplier_warranty_until','supplier_id'))          AS cols_assets;

-- ═══ BLOCO 11 — teste do ciclo (opcional, desfaz sozinho) ═══════════════════
-- Prova que concluir uma OS empurra o próximo vencimento. Rodar inteiro.
--
-- BEGIN;
--   -- item trimestral executado hoje deve vencer daqui a 3 meses
--   SELECT public.fn_maintenance_next_due(CURRENT_DATE, 3, 'MES') AS proximo;
--   -- e, com uma OS real ligada a um plan_item, conferir que
--   -- maintenance_plan_items.next_due_date mudou depois do UPDATE para CONCLUIDA
-- ROLLBACK;
