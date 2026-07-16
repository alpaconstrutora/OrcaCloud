-- Comitê de Investimentos: gates de decisão sobre a oportunidade (1-6)
-- Reusa dossiê (exportService) e cadeias de alçada (approvalService) já existentes;
-- esta tabela é só o registro da decisão de cada gate.
-- Date: 2027-07-16

CREATE TABLE IF NOT EXISTS public.investment_committee_decisions (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    gate                integer NOT NULL CHECK (gate BETWEEN 1 AND 6),
    -- 1 Triagem, 2 Viabilidade preliminar, 3 Negociação, 4 Aquisição, 5 Desenvolvimento, 6 Lançamento
    decision            text NOT NULL DEFAULT 'pendente'
                        CHECK (decision IN ('pendente','aprovado','aprovado_condicionantes','reprovado','devolvido','suspenso','arquivado')),
    condicionantes      text,
    parecer             text,
    dossie_url          text,
    decided_by_email    text,
    decided_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id, gate)
);

ALTER TABLE public.investment_committee_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read committee decisions" ON public.investment_committee_decisions
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

-- Só owner/admin decide gates (mesmo padrão de alçada usado em investor_opportunities)
CREATE POLICY "Admins can manage committee decisions" ON public.investment_committee_decisions
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_committee_decisions_org ON public.investment_committee_decisions(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_decisions_opp ON public.investment_committee_decisions(opportunity_id);
