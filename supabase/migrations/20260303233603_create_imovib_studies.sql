-- Create imovib_studies table
CREATE TABLE IF NOT EXISTS public.imovib_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cnpj TEXT,
    developer TEXT,
    manager TEXT,
    version TEXT DEFAULT '1.0',
    segment TEXT,
    sub_classification TEXT,
    phase TEXT,
    development_modality TEXT,
    zoning TEXT,
    needs_eiv BOOLEAN DEFAULT false,
    ca_basic NUMERIC,
    ca_max NUMERIC,
    occupancy_rate NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.imovib_studies ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their organization's imovib studies"
    ON public.imovib_studies FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Users can insert imovib studies for their organization"
    ON public.imovib_studies FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Users can update their organization's imovib studies"
    ON public.imovib_studies FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Users can delete their organization's imovib studies"
    ON public.imovib_studies FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email'
    ));

-- Create an updated_at trigger function if it doesn't already exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_imovib_studies_updated_at') THEN
        CREATE TRIGGER set_imovib_studies_updated_at
            BEFORE UPDATE ON public.imovib_studies
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;
