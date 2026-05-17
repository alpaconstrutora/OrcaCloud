-- Tabelas do MÃ³dulo Comercial

-- 1. Tabela de ImÃ³veis (Properties)
CREATE TABLE IF NOT EXISTS commercial_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    parent_id UUID REFERENCES commercial_properties(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'BUILDING')),
    address TEXT NOT NULL,
    area NUMERIC(10,2),
    price NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD', 'RENTED', 'RESERVED', 'MAINTENANCE')),
    specs JSONB DEFAULT '{}'::jsonb,
    features TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    project_id UUID REFERENCES projects(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que a estrutura estÃ¡ atualizada para quem jÃ¡ tinha a tabela
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES commercial_properties(id);

-- Atualizar a restriÃ§Ã£o de tipos (Check Constraint)
DO $$ 
BEGIN 
    ALTER TABLE commercial_properties DROP CONSTRAINT IF EXISTS commercial_properties_type_check;
    ALTER TABLE commercial_properties ADD CONSTRAINT commercial_properties_type_check 
        CHECK (type IN ('HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'BUILDING'));
EXCEPTION 
    WHEN others THEN NULL; 
END $$;

-- 2. Tabela de NegociaÃ§Ãµes (Property Deals)
CREATE TABLE IF NOT EXISTS commercial_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES commercial_properties(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id),
    type TEXT NOT NULL CHECK (type IN ('SALE', 'RENT')),
    value NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_NEGOTIATION' CHECK (status IN ('IN_NEGOTIATION', 'CLOSED', 'CANCELLED')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_properties_org ON commercial_properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON commercial_properties(status);
CREATE INDEX IF NOT EXISTS idx_deals_property ON commercial_deals(property_id);
CREATE INDEX IF NOT EXISTS idx_deals_client ON commercial_deals(client_id);

-- Ativar RLS (Row Level Security)
ALTER TABLE commercial_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_deals ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas reais baseadas no padrÃ£o do projeto
DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_properties;
CREATE POLICY "Enable access to organization members" ON commercial_properties
    FOR ALL TO authenticated 
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_deals;
CREATE POLICY "Enable access to organization members" ON commercial_deals
    FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM commercial_properties p 
            WHERE p.id = commercial_deals.property_id 
            AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM commercial_properties p 
            WHERE p.id = commercial_deals.property_id 
            AND public.is_org_member(p.organization_id)
        )
        OR auth.jwt()->>'email' = 'admin@admin.com'
    );
