-- Create investor_reports and investor_opportunities tables
-- Replaces investorData.reports[] and investorData.opportunities[] stored in project settings JSONB
-- Date: 2026-06-04

-- ─── investor_reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_reports (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investor_id   uuid REFERENCES public.investors(id) ON DELETE CASCADE,
    name          text NOT NULL,
    type          text NOT NULL DEFAULT 'PDF',
    url           text,
    report_date   text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org reports" ON public.investor_reports
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org reports" ON public.investor_reports
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_investor_reports_org ON public.investor_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_investor_reports_investor ON public.investor_reports(investor_id);

-- ─── investor_opportunities ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_opportunities (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title           text NOT NULL,
    subtitle        text,
    projected_yield text,
    open_date       text,
    link            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org opportunities" ON public.investor_opportunities
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org opportunities" ON public.investor_opportunities
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_investor_opps_org ON public.investor_opportunities(organization_id);

-- ─── Backfill from JSONB ─────────────────────────────────────────────────────
-- Reports
INSERT INTO public.investor_reports (organization_id, name, type, report_date)
SELECT
    (p.settings->>'organizationId')::uuid,
    r->>'name',
    COALESCE(NULLIF(r->>'type', ''), 'PDF'),
    r->>'date'
FROM public.projects p,
     LATERAL jsonb_array_elements(p.settings->'investorData'->'reports') AS r
WHERE p.settings->'investorData'->'reports' IS NOT NULL
  AND jsonb_typeof(p.settings->'investorData'->'reports') = 'array'
  AND p.settings->>'organizationId' IS NOT NULL
  AND (p.settings->>'organizationId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (r->>'name') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Opportunities
INSERT INTO public.investor_opportunities (organization_id, title, subtitle, projected_yield, open_date, link)
SELECT
    (p.settings->>'organizationId')::uuid,
    o->>'title',
    o->>'subtitle',
    o->>'yield',
    o->>'openDate',
    o->>'link'
FROM public.projects p,
     LATERAL jsonb_array_elements(p.settings->'investorData'->'opportunities') AS o
WHERE p.settings->'investorData'->'opportunities' IS NOT NULL
  AND jsonb_typeof(p.settings->'investorData'->'opportunities') = 'array'
  AND p.settings->>'organizationId' IS NOT NULL
  AND (p.settings->>'organizationId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (o->>'title') IS NOT NULL
ON CONFLICT DO NOTHING;
