-- Migration: opura_projetos_eletricos_walls
-- Description: Tabela para salvar paredes/linhas de layout desenhadas na planta elétrica

CREATE TABLE IF NOT EXISTS public.opura_electrical_walls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.opura_electrical_plans(id) ON DELETE CASCADE,
    points JSONB NOT NULL,
    thickness_m NUMERIC DEFAULT 0.15,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.opura_electrical_walls ENABLE ROW LEVEL SECURITY;

-- Policies for opura_electrical_walls
CREATE POLICY "Enable read access for organization users on opura_electrical_walls"
    ON public.opura_electrical_walls FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable insert for organization users on opura_electrical_walls"
    ON public.opura_electrical_walls FOR INSERT
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Enable update for organization users on opura_electrical_walls"
    ON public.opura_electrical_walls FOR UPDATE
    USING (public.is_org_member(organization_id));

CREATE POLICY "Enable delete for organization users on opura_electrical_walls"
    ON public.opura_electrical_walls FOR DELETE
    USING (public.is_org_member(organization_id));

-- Create a custom function to update the updated_at column if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_opura_electrical_walls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.opura_electrical_walls
  FOR EACH ROW EXECUTE PROCEDURE public.set_opura_electrical_walls_updated_at();
