-- Migration for IMOVIB CAPEX Items (Sprint 7)

CREATE TABLE IF NOT EXISTS public.imovib_capex_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    category varchar(255) NOT NULL,
    subcategory varchar(255),
    name text NOT NULL,
    value_type varchar(50) NOT NULL DEFAULT 'currency', -- 'currency' or 'percent'
    value numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.imovib_capex_items ENABLE ROW LEVEL SECURITY;

-- Create policies (assuming same org-based access as imovib_studies)
CREATE POLICY "Users can view capex items in their organization"
    ON public.imovib_capex_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies
            WHERE imovib_studies.id = imovib_capex_items.study_id
            AND imovib_studies.organization_id = (SELECT auth.uid()) -- Adjust based on actual auth logic if needed. Currently simplified like others.
        )
    );

CREATE POLICY "Users can create capex items in their organization"
    ON public.imovib_capex_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.imovib_studies
            WHERE imovib_studies.id = imovib_capex_items.study_id
            AND imovib_studies.organization_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can update capex items in their organization"
    ON public.imovib_capex_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies
            WHERE imovib_studies.id = imovib_capex_items.study_id
            AND imovib_studies.organization_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "Users can delete capex items in their organization"
    ON public.imovib_capex_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.imovib_studies
            WHERE imovib_studies.id = imovib_capex_items.study_id
            AND imovib_studies.organization_id = (SELECT auth.uid())
        )
    );

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_imovib_capex_study_id ON public.imovib_capex_items(study_id);

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at_imovib_capex_items
    BEFORE UPDATE ON public.imovib_capex_items
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime (updated_at);
