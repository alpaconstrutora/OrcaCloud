-- CorreÃ§Ã£o do Schema do MÃ³dulo Comercial

-- 1. Adicionar organization_id Ã  tabela commercial_deals
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- 2. Atualizar constraints de Status em commercial_deals
ALTER TABLE commercial_deals DROP CONSTRAINT IF EXISTS commercial_deals_status_check;
ALTER TABLE commercial_deals ADD CONSTRAINT commercial_deals_status_check 
    CHECK (status IN ('IN_NEGOTIATION', 'PENDING', 'COMPLETED', 'CANCELLED'));

-- 3. Atualizar constraints de Tipo em commercial_deals
ALTER TABLE commercial_deals DROP CONSTRAINT IF EXISTS commercial_deals_type_check;
ALTER TABLE commercial_deals ADD CONSTRAINT commercial_deals_type_check 
    CHECK (type IN ('SALE', 'RENTAL'));

-- 4. Tentar atualizar organization_id de deals existentes baseados na propriedade vinculada
UPDATE commercial_deals d
SET organization_id = p.organization_id
FROM commercial_properties p
WHERE d.property_id = p.id
AND d.organization_id IS NULL;

-- 5. Atualizar PolÃ­ticas de RLS para usar organization_id diretamente
DROP POLICY IF EXISTS "Enable access to organization members" ON commercial_deals;
CREATE POLICY "Enable access to organization members" ON commercial_deals
    FOR ALL TO authenticated 
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');
