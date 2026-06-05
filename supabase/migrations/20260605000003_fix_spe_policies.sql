-- Reparo: policies de spe_entities e spe_partners
-- Migration 20260604000007 falhou parcialmente (tabelas criadas, policies não).

ALTER TABLE public.spe_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their org SPEs" ON public.spe_entities;
CREATE POLICY "Members can read their org SPEs" ON public.spe_entities
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

DROP POLICY IF EXISTS "Admins can manage org SPEs" ON public.spe_entities;
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

ALTER TABLE public.spe_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read partners of their org SPEs" ON public.spe_partners;
CREATE POLICY "Members can read partners of their org SPEs" ON public.spe_partners
    FOR SELECT TO authenticated
    USING (spe_entity_id IN (
        SELECT id FROM public.spe_entities
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "Admins can manage partners of their org SPEs" ON public.spe_partners;
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
