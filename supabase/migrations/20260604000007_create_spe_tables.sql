-- Fase 4.2 do Investor OS: módulo SPE (Sociedade de Propósito Específico)
-- Resolve a limitação atual (1 investidor → N projetos).
-- SPE = N sócios → 1 empreendimento com % distintos.
-- Date: 2026-06-04

-- ─── spe_entities ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spe_entities (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    name             text NOT NULL,
    cnpj             text,
    capital_social   numeric(15,2) NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spe_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org SPEs" ON public.spe_entities
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org SPEs" ON public.spe_entities
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_spe_entities_org ON public.spe_entities(organization_id);
CREATE INDEX IF NOT EXISTS idx_spe_entities_project ON public.spe_entities(project_id);

-- ─── spe_partners ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spe_partners (
    id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    spe_entity_id        uuid NOT NULL REFERENCES public.spe_entities(id) ON DELETE CASCADE,
    investor_id          uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
    quota_count          integer NOT NULL DEFAULT 1,
    ownership_pct        numeric(7,4) NOT NULL DEFAULT 0,
    capital_calls_total  numeric(15,2) NOT NULL DEFAULT 0,
    capital_paid         numeric(15,2) NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (spe_entity_id, investor_id)
);

ALTER TABLE public.spe_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read partners of their org SPEs" ON public.spe_partners
    FOR SELECT TO authenticated
    USING (spe_entity_id IN (
        SELECT id FROM public.spe_entities
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

CREATE POLICY "Admins can manage partners of their org SPEs" ON public.spe_partners
    FOR ALL TO authenticated
    USING (spe_entity_id IN (
        SELECT id FROM public.spe_entities
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    ))
    WITH CHECK (spe_entity_id IN (
        SELECT id FROM public.spe_entities
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    ));

CREATE INDEX IF NOT EXISTS idx_spe_partners_entity ON public.spe_partners(spe_entity_id);
CREATE INDEX IF NOT EXISTS idx_spe_partners_investor ON public.spe_partners(investor_id);
