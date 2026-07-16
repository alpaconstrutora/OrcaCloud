-- Comparador de modelos de aquisição do terreno por oportunidade
-- (compra direta / permuta física / permuta financeira / opção de compra / sociedade)
-- Date: 2027-07-16

CREATE TABLE IF NOT EXISTS public.land_deal_scenarios (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    deal_type           text NOT NULL
                        CHECK (deal_type IN ('compra_direta','permuta_fisica','permuta_financeira','opcao_compra','sociedade')),
    name                text NOT NULL,
    -- premissas específicas de cada tipo de negócio (entrada/parcelas/percentual sobre VGV/prazo da opção/participação etc.)
    premises_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- resultados calculados a partir do estudo Imovib vinculado (impacto no fluxo)
    land_cost_equivalent numeric,
    impact_tir_pct       numeric,
    impact_vpl           numeric,
    max_cash_exposure    numeric,
    notes               text,
    is_selected         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.land_deal_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read land deal scenarios" ON public.land_deal_scenarios
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage land deal scenarios" ON public.land_deal_scenarios
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE INDEX IF NOT EXISTS idx_land_deal_org ON public.land_deal_scenarios(organization_id);
CREATE INDEX IF NOT EXISTS idx_land_deal_opp ON public.land_deal_scenarios(opportunity_id);
