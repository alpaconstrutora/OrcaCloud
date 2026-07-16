-- ==========================================================================
-- Migration: sales_plans + fn_validate_sales_simulation (F1 do PV)
-- Date: 2026-07-17
-- ==========================================================================
-- CONTEXTO
-- Modulo "Plano de Vendas e Propostas". A politica comercial (desconto maximo,
-- entrada minima, prazo maximo, indice de correcao, comissao) hoje NAO existe
-- em lugar nenhum -- o simulador do corretor tem os limites hardcoded no JSX
-- (BrokerProposalSimulator.tsx: slider de desconto max={10}).
--
-- Esta migration cria:
--   1. sales_plans          -- a politica, versionada por vigencia + status
--   2. fn_validate_sales_simulation(plan_id, payload) -- SERVIDOR e' a autoridade.
--      O front chama e espelha; nunca reimplementa a regra em TS.
--
-- DECISAO: nao ha tabela sales_plan_rules separada. Os limites da regra SAO as
-- colunas de sales_plans. A validacao (§8 do PRD) le essas colunas. Uma tabela
-- de regras a parte seria over-engineering para o MVP.
--
-- Espelha o padrao de commercial_price_tables (20261231000007):
-- is_org_member para RLS, status draft/active/suspended/closed, FK opcional
-- para a versao de tabela de precos (reusa o versionamento ja pronto).
--
-- Tabelas novas + FKs para tabelas quentes: CREATE TABLE pega lock curto no
-- destino, sem o ciclo de ALTER...REFERENCES que deadlockou o F0. Seguro numa
-- transacao so. NUNCA `supabase db push`.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. sales_plans
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_plans (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Predio (commercial_properties com filhos via parent_id). Mesmo escopo de
    -- commercial_price_tables.building_id.
    building_id          UUID NOT NULL REFERENCES public.commercial_properties(id) ON DELETE CASCADE,
    -- Versao de tabela de precos que este plano usa. Opcional: sem ela, o plano
    -- usa o current_price vigente da unidade.
    price_table_id       UUID REFERENCES public.commercial_price_tables(id) ON DELETE SET NULL,

    name                 TEXT NOT NULL,
    description          TEXT,

    effective_start      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end        DATE,

    -- Politica comercial (os limites que a validacao aplica) -----------------
    min_down_payment_pct NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- entrada minima (% do total)
    max_installments     INTEGER       NOT NULL DEFAULT 120, -- prazo maximo (parcelas mensais)
    max_discount_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- desconto comercial maximo (%)
    min_installment_value NUMERIC(14,2),                     -- valor minimo de parcela (R$)
    max_intermediary_count INTEGER      NOT NULL DEFAULT 0,  -- qtd max de parcelas intermediarias
    keys_pct             NUMERIC(5,2)   NOT NULL DEFAULT 0,  -- parcela nas chaves (% do total)

    -- Correcao / juros -------------------------------------------------------
    index_name           TEXT CHECK (index_name IN ('INCC','INCC-M','IPCA','IGP-M','CUB','OUTROS')),
    interest_rate_monthly NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- juros mensal ao comprador (%)
    -- Custo de capital da incorporadora: taxa de desconto do VPL. Se NULL, o
    -- servico usa um default. E' o que revela o desconto ECONOMICO.
    opportunity_rate_monthly NUMERIC(7,4),

    commission_pct       NUMERIC(5,2)   NOT NULL DEFAULT 0,  -- comissao do corretor (%)

    status               TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','suspended','closed')),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_plans_building ON public.sales_plans(building_id);
CREATE INDEX IF NOT EXISTS idx_sales_plans_org ON public.sales_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_plans_status ON public.sales_plans(status);

COMMENT ON COLUMN public.sales_plans.opportunity_rate_monthly IS
    'Custo de capital mensal da incorporadora (taxa de desconto do VPL). Revela o desconto economico: uma proposta "sem desconto" em 120x sem correcao tem VPL << total nominal.';
COMMENT ON COLUMN public.sales_plans.price_table_id IS
    'Versao de commercial_price_tables usada pelo plano. NULL = usa current_price da unidade.';

-- --------------------------------------------------------------------------
-- 2. RLS -- so' membros da org (is_org_member ja cobre corretores ativos via
--    broker_profiles). Escrita de plano e' ato de gestao: nao restringimos a
--    corretor aqui, qualquer membro da org gerencia; o gate corretor-x-gestor
--    fica na UI e na validacao. SELECT liberado a membros (o corretor precisa
--    ler o plano para simular).
-- --------------------------------------------------------------------------
ALTER TABLE public.sales_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_plans_select ON public.sales_plans;
DROP POLICY IF EXISTS sales_plans_insert ON public.sales_plans;
DROP POLICY IF EXISTS sales_plans_update ON public.sales_plans;
DROP POLICY IF EXISTS sales_plans_delete ON public.sales_plans;

CREATE POLICY sales_plans_select ON public.sales_plans
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY sales_plans_insert ON public.sales_plans
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY sales_plans_update ON public.sales_plans
    FOR UPDATE TO authenticated USING (public.is_org_member(organization_id));
-- So' rascunho pode ser deletado (planos ativos/encerrados sao historico).
CREATE POLICY sales_plans_delete ON public.sales_plans
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id) AND status = 'draft');

-- --------------------------------------------------------------------------
-- 3. fn_validate_sales_simulation -- SERVIDOR e' a autoridade da politica.
--    Retorna jsonb (nao RETURNS TABLE -> nao cai na armadilha 42702 de OUT vars).
--
--    payload jsonb esperado:
--      { down_payment_pct, installments, discount_pct, installment_value,
--        intermediary_count }
--
--    Retorna:
--      { overall: 'ALLOWED'|'WARN'|'NEEDS_APPROVAL'|'BLOCKED',
--        checks: [ { rule, verdict, message, limit, value } ... ] }
--
--    Severidade: BLOCKED > NEEDS_APPROVAL > WARN > ALLOWED. overall = a pior.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_sales_simulation(
    p_plan_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan          public.sales_plans%ROWTYPE;
    v_checks        JSONB := '[]'::jsonb;
    v_overall       TEXT := 'ALLOWED';
    v_rank          INT := 0;   -- 0 ALLOWED, 1 WARN, 2 NEEDS_APPROVAL, 3 BLOCKED
    -- payload
    v_down_pct      NUMERIC := COALESCE((p_payload->>'down_payment_pct')::numeric, 0);
    v_installments  INT     := COALESCE((p_payload->>'installments')::int, 0);
    v_discount_pct  NUMERIC := COALESCE((p_payload->>'discount_pct')::numeric, 0);
    v_inst_value    NUMERIC := COALESCE((p_payload->>'installment_value')::numeric, 0);
    v_interm_count  INT     := COALESCE((p_payload->>'intermediary_count')::int, 0);
BEGIN
    SELECT * INTO v_plan FROM public.sales_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plano de vendas nao encontrado.';
    END IF;
    IF NOT public.is_org_member(v_plan.organization_id) THEN
        RAISE EXCEPTION 'Sem permissao para esta organizacao.';
    END IF;

    -- Plano fora de vigencia / inativo -> BLOQUEADO
    IF v_plan.status <> 'active' THEN
        v_checks := v_checks || jsonb_build_object('rule','plan_status','verdict','BLOCKED',
            'message', format('Plano %s (nao ativo).', v_plan.status), 'limit', NULL, 'value', NULL);
        v_rank := GREATEST(v_rank, 3);
    ELSIF CURRENT_DATE < v_plan.effective_start
       OR (v_plan.effective_end IS NOT NULL AND CURRENT_DATE > v_plan.effective_end) THEN
        v_checks := v_checks || jsonb_build_object('rule','plan_validity','verdict','BLOCKED',
            'message','Plano fora do periodo de vigencia.', 'limit', NULL, 'value', NULL);
        v_rank := GREATEST(v_rank, 3);
    END IF;

    -- Entrada abaixo do minimo -> EXIGE APROVACAO
    IF v_down_pct < v_plan.min_down_payment_pct THEN
        v_checks := v_checks || jsonb_build_object('rule','min_down_payment','verdict','NEEDS_APPROVAL',
            'message', format('Entrada %s%% abaixo do minimo %s%%.', v_down_pct, v_plan.min_down_payment_pct),
            'limit', v_plan.min_down_payment_pct, 'value', v_down_pct);
        v_rank := GREATEST(v_rank, 2);
    END IF;

    -- Prazo acima do maximo -> EXIGE APROVACAO
    IF v_installments > v_plan.max_installments THEN
        v_checks := v_checks || jsonb_build_object('rule','max_installments','verdict','NEEDS_APPROVAL',
            'message', format('Prazo %sx acima do maximo %sx.', v_installments, v_plan.max_installments),
            'limit', v_plan.max_installments, 'value', v_installments);
        v_rank := GREATEST(v_rank, 2);
    END IF;

    -- Desconto: <= max = ALLOWED; acima ate' 2x = EXIGE APROVACAO; alem = BLOQUEADO
    IF v_discount_pct > v_plan.max_discount_pct THEN
        IF v_discount_pct > v_plan.max_discount_pct * 2 THEN
            v_checks := v_checks || jsonb_build_object('rule','max_discount','verdict','BLOCKED',
                'message', format('Desconto %s%% muito acima do maximo %s%%.', v_discount_pct, v_plan.max_discount_pct),
                'limit', v_plan.max_discount_pct, 'value', v_discount_pct);
            v_rank := GREATEST(v_rank, 3);
        ELSE
            v_checks := v_checks || jsonb_build_object('rule','max_discount','verdict','NEEDS_APPROVAL',
                'message', format('Desconto %s%% acima do maximo %s%%.', v_discount_pct, v_plan.max_discount_pct),
                'limit', v_plan.max_discount_pct, 'value', v_discount_pct);
            v_rank := GREATEST(v_rank, 2);
        END IF;
    END IF;

    -- Parcela abaixo do minimo -> ALERTA
    IF v_plan.min_installment_value IS NOT NULL
       AND v_inst_value > 0 AND v_inst_value < v_plan.min_installment_value THEN
        v_checks := v_checks || jsonb_build_object('rule','min_installment_value','verdict','WARN',
            'message', format('Parcela abaixo do minimo de R$ %s.', v_plan.min_installment_value),
            'limit', v_plan.min_installment_value, 'value', v_inst_value);
        v_rank := GREATEST(v_rank, 1);
    END IF;

    -- Intermediarias acima do permitido -> ALERTA
    IF v_interm_count > v_plan.max_intermediary_count THEN
        v_checks := v_checks || jsonb_build_object('rule','max_intermediary','verdict','WARN',
            'message', format('%s intermediarias acima do maximo %s.', v_interm_count, v_plan.max_intermediary_count),
            'limit', v_plan.max_intermediary_count, 'value', v_interm_count);
        v_rank := GREATEST(v_rank, 1);
    END IF;

    v_overall := CASE v_rank WHEN 3 THEN 'BLOCKED' WHEN 2 THEN 'NEEDS_APPROVAL'
                             WHEN 1 THEN 'WARN' ELSE 'ALLOWED' END;

    RETURN jsonb_build_object('overall', v_overall, 'checks', v_checks);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_sales_simulation(UUID, JSONB) TO authenticated;
