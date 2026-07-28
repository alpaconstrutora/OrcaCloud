-- opura_electrical_elements table

CREATE TABLE IF NOT EXISTS public.opura_electrical_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.opura_electrical_plans(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'door', 'window', 'opening', 'sliding_door', 'double_door', 'stairs'
    points JSONB NOT NULL, -- usually an array of coordinates like [x1, y1, x2, y2]
    properties JSONB, -- optional properties (e.g. flip, rotation)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.opura_electrical_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for organization users on opura_electrical_elements"
    ON public.opura_electrical_elements FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable insert for organization users on opura_electrical_elements"
    ON public.opura_electrical_elements FOR INSERT
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Enable update for organization users on opura_electrical_elements"
    ON public.opura_electrical_elements FOR UPDATE
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable delete for organization users on opura_electrical_elements"
    ON public.opura_electrical_elements FOR DELETE
    USING (public.is_org_member(organization_id));

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.opura_electrical_elements
  FOR EACH ROW EXECUTE PROCEDURE public.set_opura_electrical_walls_updated_at();
