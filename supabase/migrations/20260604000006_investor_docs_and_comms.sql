-- Fase 3 do Investor OS: documentos categorizados + comunicação oficial
-- Date: 2026-06-04

-- ─── 1. Estender investor_reports com category e project_id ──────────────────
ALTER TABLE public.investor_reports
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'relatorio'
        CHECK (category IN (
            'relatorio', 'contrato', 'spe', 'matricula', 'licenca',
            'art', 'nota', 'prestacao_contas', 'balancete', 'dre', 'ata', 'outro'
        )),
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_investor_reports_category ON public.investor_reports(category);
CREATE INDEX IF NOT EXISTS idx_investor_reports_project ON public.investor_reports(project_id);

-- ─── 2. investor_announcements ────────────────────────────────────────────────
-- Comunicados oficiais da construtora para investidores
CREATE TABLE IF NOT EXISTS public.investor_announcements (
    id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id             uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    title                  text NOT NULL,
    body                   text NOT NULL,
    type                   text NOT NULL DEFAULT 'aviso'
                           CHECK (type IN ('aviso', 'assembleia', 'votacao', 'comunicado')),
    published_at           timestamptz,
    requires_acknowledgment boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org announcements" ON public.investor_announcements
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

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

CREATE INDEX IF NOT EXISTS idx_announcements_org ON public.investor_announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_project ON public.investor_announcements(project_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.investor_announcements(published_at DESC);

-- ─── 3. investor_acknowledgments ─────────────────────────────────────────────
-- Aceite digital e votação por investidor
CREATE TABLE IF NOT EXISTS public.investor_acknowledgments (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id  uuid NOT NULL REFERENCES public.investor_announcements(id) ON DELETE CASCADE,
    investor_id      uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
    acknowledged_at  timestamptz NOT NULL DEFAULT now(),
    vote_option      text,   -- 'sim' | 'nao' | 'abstencao' (null quando só aceite)
    UNIQUE (announcement_id, investor_id)
);

ALTER TABLE public.investor_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read acknowledgments in their org" ON public.investor_acknowledgments
    FOR SELECT TO authenticated
    USING (announcement_id IN (
        SELECT id FROM public.investor_announcements
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

CREATE POLICY "Authenticated users can acknowledge" ON public.investor_acknowledgments
    FOR INSERT TO authenticated
    WITH CHECK (announcement_id IN (
        SELECT id FROM public.investor_announcements
        WHERE organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    ));

CREATE POLICY "Admins can view all acknowledgments" ON public.investor_acknowledgments
    FOR ALL TO authenticated
    USING (announcement_id IN (
        SELECT ia.id FROM public.investor_announcements ia
        WHERE ia.organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    ));

CREATE INDEX IF NOT EXISTS idx_acks_announcement ON public.investor_acknowledgments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_acks_investor ON public.investor_acknowledgments(investor_id);
