-- Fase 2 do Investor OS: timeline da obra
-- Marcos curados pelo gestor (Fundação, Estrutura, Cobertura...), distintos das
-- atividades granulares do diário de obra. Fotos/vídeos vêm de diaryEntries no período.
-- Date: 2026-06-04

CREATE TABLE IF NOT EXISTS public.project_milestones (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name             text NOT NULL,
    planned_date     date,
    completed_date   date,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'completed')),
    physical_pct     numeric(5,2) NOT NULL DEFAULT 0,   -- % físico do marco (0-100)
    order_index      integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org milestones" ON public.project_milestones
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Admins can manage org milestones" ON public.project_milestones
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
    ));

CREATE INDEX IF NOT EXISTS idx_project_milestones_org ON public.project_milestones(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id);
