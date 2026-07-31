-- supabase/migrations/20270845000000_opura_electrical_conduits.sql

CREATE TABLE IF NOT EXISTS opura_electrical_conduits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES opura_electrical_plans(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES opura_electrical_points(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES opura_electrical_points(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'teto', -- 'teto', 'parede', 'piso'
    wires JSONB DEFAULT '[]'::jsonb, -- Array of wire annotations
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE opura_electrical_conduits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conduits in their organization" 
    ON opura_electrical_conduits FOR SELECT 
    USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY "Users can insert conduits in their organization" 
    ON opura_electrical_conduits FOR INSERT 
    WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY "Users can update conduits in their organization" 
    ON opura_electrical_conduits FOR UPDATE 
    USING (organization_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY "Users can delete conduits in their organization" 
    ON opura_electrical_conduits FOR DELETE 
    USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_opura_electrical_conduits
    BEFORE UPDATE ON opura_electrical_conduits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
