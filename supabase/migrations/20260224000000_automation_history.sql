-- Migration: Create Automation History Table
-- Date: 2026-02-24

CREATE TABLE IF NOT EXISTS public.automation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'contract_sent', 'order_sent', 'billing_ruler_trigger', etc.
    reference_id TEXT, -- ID do contrato, pedido ou parcela
    reference_name TEXT, -- NÃºmero ou tÃ­tulo para fÃ¡cil visualizaÃ§Ã£o
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    error_message TEXT,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS automation_history_org_idx ON public.automation_history(organization_id);
CREATE INDEX IF NOT EXISTS automation_history_project_idx ON public.automation_history(project_id);
CREATE INDEX IF NOT EXISTS automation_history_created_at_idx ON public.automation_history(created_at DESC);

-- RLS
ALTER TABLE public.automation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation history of their organization" 
ON public.automation_history FOR SELECT TO authenticated 
USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "Users can manage automation history of their organization" 
ON public.automation_history FOR ALL TO authenticated 
USING (organization_id IS NULL OR public.is_org_member(organization_id));

-- Support for Anon (development)
CREATE POLICY "Allow anon all on automation_history" ON public.automation_history FOR ALL TO anon USING (true) WITH CHECK (true);
