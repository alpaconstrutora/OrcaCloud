-- Tabela de concorrentes locais para o comparativo de mercado das oportunidades
-- Date: 2026-12-30

CREATE TABLE IF NOT EXISTS public.investor_opportunity_competitors (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    name                text NOT NULL,
    price_per_m2        numeric NOT NULL,
    sales_velocity_pct  numeric,
    appreciation_pct    numeric,
    distance_km         numeric,
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_opportunity_competitors ENABLE ROW LEVEL SECURITY;

-- Membros autenticados podem ver os concorrentes
CREATE POLICY "Members can read competitors" ON public.investor_opportunity_competitors
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

-- Admins gerenciam tudo
CREATE POLICY "Admins can manage competitors" ON public.investor_opportunity_competitors
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

-- Acesso anônimo/público (leitura) via portal tokens
-- Para simplificar o acesso anônimo do portal público via tokens, criamos uma política anon de leitura
CREATE POLICY "Public read for competitors" ON public.investor_opportunity_competitors
    FOR SELECT TO anon
    USING (true);

CREATE INDEX IF NOT EXISTS idx_opp_competitors_org ON public.investor_opportunity_competitors(organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_competitors_opp ON public.investor_opportunity_competitors(opportunity_id);
