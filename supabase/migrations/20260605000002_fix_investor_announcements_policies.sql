-- Reparo: policies de investor_announcements e investor_acknowledgments
-- A migration 20260604000006 falhou parcialmente (tabelas criadas, policies não).
-- Este arquivo aplica apenas o que faltou, de forma idempotente.

ALTER TABLE public.investor_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their org announcements" ON public.investor_announcements;
CREATE POLICY "Members can read their org announcements" ON public.investor_announcements
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

DROP POLICY IF EXISTS "Admins can manage org announcements" ON public.investor_announcements;
CREATE POLICY "Admins can manage org announcements" ON public.investor_announcements
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

ALTER TABLE public.investor_acknowledgments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read acknowledgments in their org" ON public.investor_acknowledgments;
CREATE POLICY "Members can read acknowledgments in their org" ON public.investor_acknowledgments
    FOR SELECT TO authenticated
    USING (announcement_id IN (
        SELECT id FROM public.investor_announcements
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "Authenticated users can acknowledge" ON public.investor_acknowledgments;
CREATE POLICY "Authenticated users can acknowledge" ON public.investor_acknowledgments
    FOR INSERT TO authenticated
    WITH CHECK (announcement_id IN (
        SELECT id FROM public.investor_announcements
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

DROP POLICY IF EXISTS "Admins can view all acknowledgments" ON public.investor_acknowledgments;
CREATE POLICY "Admins can view all acknowledgments" ON public.investor_acknowledgments
    FOR ALL TO authenticated
    USING (announcement_id IN (
        SELECT ia.id FROM public.investor_announcements ia
        WHERE ia.organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    ));
