-- Migration: imovib_unit_instances
-- Tabela de espelho de vendas para estudos de viabilidade

CREATE TABLE IF NOT EXISTS public.imovib_unit_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES public.imovib_blocks(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.imovib_units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    floor INTEGER DEFAULT 1,
    private_area NUMERIC DEFAULT 0,
    position_type TEXT DEFAULT 'LATERAL',
    sun_orientation TEXT DEFAULT 'NORTH',
    price NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'DISPONÍVEL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by study
CREATE INDEX IF NOT EXISTS idx_imovib_unit_instances_study_id
    ON public.imovib_unit_instances(study_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at_imovib_unit_instances ON public.imovib_unit_instances;

CREATE TRIGGER set_updated_at_imovib_unit_instances
    BEFORE UPDATE ON public.imovib_unit_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.imovib_unit_instances ENABLE ROW LEVEL SECURITY;

-- Helper: check membership via study's organization
CREATE OR REPLACE FUNCTION public.imovib_unit_instance_org_check(p_study_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.imovib_studies s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id = p_study_id
          AND om.email = auth.jwt()->>'email'
    );
$$;

-- SELECT policy
DROP POLICY IF EXISTS "imovib_unit_instances_select" ON public.imovib_unit_instances;
CREATE POLICY "imovib_unit_instances_select"
    ON public.imovib_unit_instances
    FOR SELECT
    USING (public.imovib_unit_instance_org_check(study_id));

-- INSERT policy
DROP POLICY IF EXISTS "imovib_unit_instances_insert" ON public.imovib_unit_instances;
CREATE POLICY "imovib_unit_instances_insert"
    ON public.imovib_unit_instances
    FOR INSERT
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

-- UPDATE policy
DROP POLICY IF EXISTS "imovib_unit_instances_update" ON public.imovib_unit_instances;
CREATE POLICY "imovib_unit_instances_update"
    ON public.imovib_unit_instances
    FOR UPDATE
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

-- DELETE policy
DROP POLICY IF EXISTS "imovib_unit_instances_delete" ON public.imovib_unit_instances;
CREATE POLICY "imovib_unit_instances_delete"
    ON public.imovib_unit_instances
    FOR DELETE
    USING (public.imovib_unit_instance_org_check(study_id));
