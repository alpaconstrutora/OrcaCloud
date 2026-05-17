-- Add land_cost to imovib_studies
ALTER TABLE public.imovib_studies 
ADD COLUMN IF NOT EXISTS land_cost NUMERIC DEFAULT 0;

-- Create imovib_blocks table
CREATE TABLE IF NOT EXISTS public.imovib_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    construction_cost_sqm NUMERIC DEFAULT 0,
    sales_price_sqm NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for imovib_blocks
ALTER TABLE public.imovib_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for imovib_blocks
-- We check access through the parent imovib_studies table's organization_id
CREATE POLICY "Users can view blocks of their organization's studies"
    ON public.imovib_blocks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies s
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE s.id = imovib_blocks.study_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can insert blocks to their organization's studies"
    ON public.imovib_blocks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.imovib_studies s
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE s.id = study_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update blocks of their organization's studies"
    ON public.imovib_blocks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies s
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE s.id = imovib_blocks.study_id AND om.email = auth.jwt()->>'email'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.imovib_studies s
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE s.id = study_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete blocks of their organization's studies"
    ON public.imovib_blocks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies s
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE s.id = imovib_blocks.study_id AND om.email = auth.jwt()->>'email'
        )
    );


-- Create imovib_units table
CREATE TABLE IF NOT EXISTS public.imovib_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID NOT NULL REFERENCES public.imovib_blocks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    private_area NUMERIC DEFAULT 0,
    common_area NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for imovib_units
ALTER TABLE public.imovib_units ENABLE ROW LEVEL SECURITY;

-- RLS Policies for imovib_units
-- We check access through the block -> study -> organization
CREATE POLICY "Users can view units of their organization's studies"
    ON public.imovib_units FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_blocks b
            JOIN public.imovib_studies s ON s.id = b.study_id
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE b.id = imovib_units.block_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can insert units to their organization's studies"
    ON public.imovib_units FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.imovib_blocks b
            JOIN public.imovib_studies s ON s.id = b.study_id
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE b.id = block_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can update units of their organization's studies"
    ON public.imovib_units FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_blocks b
            JOIN public.imovib_studies s ON s.id = b.study_id
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE b.id = imovib_units.block_id AND om.email = auth.jwt()->>'email'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.imovib_blocks b
            JOIN public.imovib_studies s ON s.id = b.study_id
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE b.id = block_id AND om.email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Users can delete units of their organization's studies"
    ON public.imovib_units FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_blocks b
            JOIN public.imovib_studies s ON s.id = b.study_id
            JOIN public.organization_members om ON om.organization_id = s.organization_id
            WHERE b.id = imovib_units.block_id AND om.email = auth.jwt()->>'email'
        )
    );

-- Triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_imovib_blocks_updated_at') THEN
        CREATE TRIGGER set_imovib_blocks_updated_at
            BEFORE UPDATE ON public.imovib_blocks
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_imovib_units_updated_at') THEN
        CREATE TRIGGER set_imovib_units_updated_at
            BEFORE UPDATE ON public.imovib_units
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;
