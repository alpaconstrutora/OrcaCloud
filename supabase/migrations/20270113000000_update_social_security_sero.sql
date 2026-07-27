-- ============================================================
-- Migration: 20270113000000_update_social_security_sero
-- Description: Adiciona tabelas e colunas para cálculo exato de
-- Aferição Indireta do SERO (Receita Federal)
-- ============================================================

-- 1. Create Enums for SERO categorization
DO $$ BEGIN
  CREATE TYPE sero_category AS ENUM ('obra_nova', 'acrescimo', 'reforma', 'demolicao');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sero_destination AS ENUM (
    'residencial_unifamiliar', 
    'residencial_multifamiliar', 
    'comercial_salas_lojas', 
    'galpao_industrial', 
    'casa_popular', 
    'conjunto_habitacional_popular', 
    'edificio_garagens'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sero_type AS ENUM ('alvenaria', 'madeira', 'mista');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Update Main Record Table
ALTER TABLE construction_social_security_records
  ADD COLUMN IF NOT EXISTS sero_category sero_category,
  ADD COLUMN IF NOT EXISTS sero_destination sero_destination,
  ADD COLUMN IF NOT EXISTS sero_type sero_type,
  ADD COLUMN IF NOT EXISTS vau_value NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS used_pre_mixed_concrete BOOLEAN DEFAULT false;

-- 3. Create Areas Table
CREATE TABLE IF NOT EXISTS construction_social_security_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    area_type VARCHAR(20) NOT NULL CHECK (area_type IN ('principal', 'complementar')),
    is_covered BOOLEAN DEFAULT true, -- Relevante apenas para área complementar no redutor (50% ou 75%)
    total_area NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    area_to_regularize NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create Pre-molded Reductions Table (Notas Fiscais de Pré-Moldados)
CREATE TABLE IF NOT EXISTS construction_social_security_reductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    nf_cnpj VARCHAR(18) NOT NULL,
    nf_number VARCHAR(50) NOT NULL,
    nf_serie VARCHAR(20),
    nf_date DATE NOT NULL,
    nf_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    percent_used NUMERIC(5,2) NOT NULL DEFAULT 100.00, -- Parcela da nota (ex: 100%)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS Policies
ALTER TABLE construction_social_security_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_social_security_reductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view areas in their company" ON construction_social_security_areas
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can insert areas in their company" ON construction_social_security_areas
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can update areas in their company" ON construction_social_security_areas
    FOR UPDATE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can delete areas in their company" ON construction_social_security_areas
    FOR DELETE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

CREATE POLICY "Users can view reductions in their company" ON construction_social_security_reductions
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can insert reductions in their company" ON construction_social_security_reductions
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can update reductions in their company" ON construction_social_security_reductions
    FOR UPDATE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
CREATE POLICY "Users can delete reductions in their company" ON construction_social_security_reductions
    FOR DELETE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

-- 6. Triggers
CREATE TRIGGER update_construction_social_security_areas_updated_at BEFORE UPDATE ON construction_social_security_areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_construction_social_security_reductions_updated_at BEFORE UPDATE ON construction_social_security_reductions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
