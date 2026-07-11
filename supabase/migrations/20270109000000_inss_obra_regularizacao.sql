-- Create enum types for social security module (idempotente: reexecução segura se já existirem)
DO $$ BEGIN
  CREATE TYPE cno_status AS ENUM ('nao_cadastrado', 'cadastrado', 'pendente_revisao', 'encerrado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE regularization_method AS ENUM ('afericao_indireta', 'contabilidade_regular');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sero_status AS ENUM ('nao_iniciado', 'em_preparacao', 'aferido', 'dctfweb_enviada', 'darf_emitido', 'pago', 'certidao_emitida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main social security record per project/obra
CREATE TABLE IF NOT EXISTS construction_social_security_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    cno_number VARCHAR(14),
    cno_status cno_status DEFAULT 'nao_cadastrado',
    cno_registration_date DATE,
    responsible_type VARCHAR(50), -- PF, PJ, incorporadora, construtora
    execution_type VARCHAR(50), -- Obra própria, empreitada total, etc
    construction_type VARCHAR(50),
    destination_type VARCHAR(50),
    regularization_method regularization_method,
    total_area NUMERIC(12,2),
    assessed_area NUMERIC(12,2),
    start_date DATE,
    end_date DATE,
    permit_number VARCHAR(100),
    occupancy_permit_number VARCHAR(100),
    accountant_name VARCHAR(150),
    accountant_crc VARCHAR(50),
    accountant_cpf VARCHAR(14),
    sero_status sero_status DEFAULT 'nao_iniciado',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checklist and documents
CREATE TABLE IF NOT EXISTS construction_social_security_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL, -- alvara, habite-se, certidao, etc
    file_id UUID, -- reference to storage or dms_documents
    issue_date DATE,
    expiration_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manual credits and withholdings
CREATE TABLE IF NOT EXISTS construction_social_security_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    credit_type VARCHAR(50) NOT NULL, -- folha, esocial, gfip, retencao_nf, pre_moldado
    source_module VARCHAR(50),
    source_id UUID,
    competence VARCHAR(7), -- YYYY-MM
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Simulations history
CREATE TABLE IF NOT EXISTS construction_social_security_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    scenario VARCHAR(50) NOT NULL, -- conservador, provavel, otimista
    gross_estimated_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit_estimated_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_estimated_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    confidence_level VARCHAR(20),
    calculation_version VARCHAR(20),
    simulation_parameters_json JSONB,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DCTFWeb records
CREATE TABLE IF NOT EXISTS construction_social_security_dctfweb (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES construction_social_security_records(id) ON DELETE CASCADE,
    declaration_number VARCHAR(100),
    transmission_date DATE,
    principal_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    fine_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    interest_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    file_id UUID,
    status VARCHAR(50) DEFAULT 'transmitida',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE construction_social_security_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_social_security_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_social_security_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_social_security_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_social_security_dctfweb ENABLE ROW LEVEL SECURITY;

-- RLS Policies (assuming multi-tenant based on company_id in main record)
DROP POLICY IF EXISTS "Users can view records in their company" ON construction_social_security_records;
CREATE POLICY "Users can view records in their company" ON construction_social_security_records
    FOR SELECT USING (EXISTS (SELECT 1 FROM companies c WHERE c.id = company_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can insert records in their company" ON construction_social_security_records;
CREATE POLICY "Users can insert records in their company" ON construction_social_security_records
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM companies c WHERE c.id = company_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can update records in their company" ON construction_social_security_records;
CREATE POLICY "Users can update records in their company" ON construction_social_security_records
    FOR UPDATE USING (EXISTS (SELECT 1 FROM companies c WHERE c.id = company_id AND public.is_org_member(c.org_id)));

-- Cascading RLS via record_id
DROP POLICY IF EXISTS "Users can view docs in their company" ON construction_social_security_documents;
CREATE POLICY "Users can view docs in their company" ON construction_social_security_documents
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can insert docs in their company" ON construction_social_security_documents;
CREATE POLICY "Users can insert docs in their company" ON construction_social_security_documents
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can update docs in their company" ON construction_social_security_documents;
CREATE POLICY "Users can update docs in their company" ON construction_social_security_documents
    FOR UPDATE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

DROP POLICY IF EXISTS "Users can view credits in their company" ON construction_social_security_credits;
CREATE POLICY "Users can view credits in their company" ON construction_social_security_credits
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can insert credits in their company" ON construction_social_security_credits;
CREATE POLICY "Users can insert credits in their company" ON construction_social_security_credits
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can update credits in their company" ON construction_social_security_credits;
CREATE POLICY "Users can update credits in their company" ON construction_social_security_credits
    FOR UPDATE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

DROP POLICY IF EXISTS "Users can view simulations in their company" ON construction_social_security_simulations;
CREATE POLICY "Users can view simulations in their company" ON construction_social_security_simulations
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can insert simulations in their company" ON construction_social_security_simulations;
CREATE POLICY "Users can insert simulations in their company" ON construction_social_security_simulations
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

DROP POLICY IF EXISTS "Users can view dctfweb in their company" ON construction_social_security_dctfweb;
CREATE POLICY "Users can view dctfweb in their company" ON construction_social_security_dctfweb
    FOR SELECT USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can insert dctfweb in their company" ON construction_social_security_dctfweb;
CREATE POLICY "Users can insert dctfweb in their company" ON construction_social_security_dctfweb
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));
DROP POLICY IF EXISTS "Users can update dctfweb in their company" ON construction_social_security_dctfweb;
CREATE POLICY "Users can update dctfweb in their company" ON construction_social_security_dctfweb
    FOR UPDATE USING (EXISTS (SELECT 1 FROM construction_social_security_records r JOIN companies c ON r.company_id = c.id WHERE r.id = record_id AND public.is_org_member(c.org_id)));

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_construction_social_security_records_updated_at ON construction_social_security_records;
CREATE TRIGGER update_construction_social_security_records_updated_at BEFORE UPDATE ON construction_social_security_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_construction_social_security_documents_updated_at ON construction_social_security_documents;
CREATE TRIGGER update_construction_social_security_documents_updated_at BEFORE UPDATE ON construction_social_security_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_construction_social_security_credits_updated_at ON construction_social_security_credits;
CREATE TRIGGER update_construction_social_security_credits_updated_at BEFORE UPDATE ON construction_social_security_credits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_construction_social_security_dctfweb_updated_at ON construction_social_security_dctfweb;
CREATE TRIGGER update_construction_social_security_dctfweb_updated_at BEFORE UPDATE ON construction_social_security_dctfweb FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
