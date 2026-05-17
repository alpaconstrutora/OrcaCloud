-- Create parametric_scenarios table
CREATE TABLE IF NOT EXISTS public.parametric_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_value NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parametric_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view scenarios from their organization"
    ON public.parametric_scenarios
    FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert scenarios for their organization"
    ON public.parametric_scenarios
    FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update scenarios from their organization"
    ON public.parametric_scenarios
    FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete scenarios from their organization"
    ON public.parametric_scenarios
    FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    ));

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_parametric_scenarios_updated_at
    BEFORE UPDATE ON public.parametric_scenarios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
