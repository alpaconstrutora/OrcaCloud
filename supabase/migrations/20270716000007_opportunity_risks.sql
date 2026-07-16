-- Registro de riscos transversal por oportunidade (matriz probabilidade x impacto)
-- Date: 2027-07-16

CREATE TABLE IF NOT EXISTS public.opportunity_risks (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    category            text NOT NULL
                        CHECK (category IN ('fundiario','juridico','ambiental','urbanistico','tecnico','mercado','financeiro','tributario','societario','reputacional','prazo','vendas','construcao')),
    title               text NOT NULL,
    causa               text,
    consequencia        text,
    probabilidade       integer NOT NULL DEFAULT 1 CHECK (probabilidade BETWEEN 1 AND 5),
    impacto             integer NOT NULL DEFAULT 1 CHECK (impacto BETWEEN 1 AND 5),
    -- exposicao = probabilidade * impacto, calculada em app/consulta (evita trigger para um campo simples)
    tendencia           text DEFAULT 'estavel' CHECK (tendencia IN ('subindo','estavel','descendo')),
    responsavel_email   text,
    mitigacao           text,
    contingencia        text,
    prazo               date,
    status              text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_mitigacao','mitigado','materializado','encerrado')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read opportunity risks" ON public.opportunity_risks
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage opportunity risks" ON public.opportunity_risks
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE INDEX IF NOT EXISTS idx_opp_risks_org ON public.opportunity_risks(organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_risks_opp ON public.opportunity_risks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_risks_status ON public.opportunity_risks(status);
