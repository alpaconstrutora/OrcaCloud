-- 1. Criação das Tabelas de Compliance

-- 1.1 Áreas Físicas / Módulo de Segregação
CREATE TABLE IF NOT EXISTS public.compliance_physical_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'sala', 'posicao_logistica', 'locker', 'escritorio'
    coordinates JSONB, -- Posição visual no layout do mapa (x, y, w, h ou grid)
    status VARCHAR(50) DEFAULT 'disponivel', -- 'disponivel', 'ocupado', 'manutencao'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.2 Regras e Requisitos do Regime
CREATE TABLE IF NOT EXISTS public.compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'tts_mg', 'licenca', 'anvisa', 'avcb'
    metric_threshold NUMERIC, -- Limite métrico (ex: 30.00 para interestadual)
    recurrence_days INT DEFAULT 30, -- Dias para recorrência de checagem
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.3 Checklists e Monitoramento Diário/Mensal
CREATE TABLE IF NOT EXISTS public.compliance_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pendente', -- 'pendente', 'em_analise', 'conforme', 'inconforme'
    due_date DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by VARCHAR(255), -- Email do membro da organização
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.4 Evidências Operacionais
CREATE TABLE IF NOT EXISTS public.compliance_evidences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    checklist_id UUID REFERENCES public.compliance_checklists(id) ON DELETE SET NULL,
    operation_type VARCHAR(100) NOT NULL, -- 'recebimento', 'expedicao', 'inventario'
    document_ref VARCHAR(100), -- Número da NF-e, Chave de Acesso, Pedido
    operator_email VARCHAR(255) NOT NULL,
    evidence_url VARCHAR(512) NOT NULL, -- Arquivo no Supabase Storage
    file_hash VARCHAR(64), -- SHA-256 para validade legal
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS em todas as tabelas
ALTER TABLE public.compliance_physical_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evidences ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS (Segurança baseada no tenant/membro)

-- 3.1 compliance_physical_locations
DROP POLICY IF EXISTS "compliance_physical_locations_org_access" ON public.compliance_physical_locations;
CREATE POLICY "compliance_physical_locations_org_access" ON public.compliance_physical_locations
FOR ALL TO authenticated
USING (org_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE email = auth.jwt()->>'email'
));

-- 3.2 compliance_rules
DROP POLICY IF EXISTS "compliance_rules_org_access" ON public.compliance_rules;
CREATE POLICY "compliance_rules_org_access" ON public.compliance_rules
FOR ALL TO authenticated
USING (org_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE email = auth.jwt()->>'email'
));

-- 3.3 compliance_checklists
DROP POLICY IF EXISTS "compliance_checklists_org_access" ON public.compliance_checklists;
CREATE POLICY "compliance_checklists_org_access" ON public.compliance_checklists
FOR ALL TO authenticated
USING (org_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE email = auth.jwt()->>'email'
));

-- 3.4 compliance_evidences
DROP POLICY IF EXISTS "compliance_evidences_org_access" ON public.compliance_evidences;
CREATE POLICY "compliance_evidences_org_access" ON public.compliance_evidences
FOR ALL TO authenticated
USING (org_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE email = auth.jwt()->>'email'
));

-- 4. Políticas para Ambiente de Desenvolvimento (Anon) - Regra 8
DROP POLICY IF EXISTS "Allow anon all on compliance_physical_locations" ON public.compliance_physical_locations;
CREATE POLICY "Allow anon all on compliance_physical_locations" 
ON public.compliance_physical_locations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on compliance_rules" ON public.compliance_rules;
CREATE POLICY "Allow anon all on compliance_rules" 
ON public.compliance_rules FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on compliance_checklists" ON public.compliance_checklists;
CREATE POLICY "Allow anon all on compliance_checklists" 
ON public.compliance_checklists FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on compliance_evidences" ON public.compliance_evidences;
CREATE POLICY "Allow anon all on compliance_evidences" 
ON public.compliance_evidences FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Bucket de Storage para Evidências de Compliance
INSERT INTO storage.buckets (id, name, public) 
VALUES ('compliance-evidences', 'compliance-evidences', true) 
ON CONFLICT (id) DO NOTHING;

-- Políticas de RLS para o bucket
DROP POLICY IF EXISTS "Public Access for compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete compliance-evidences" ON storage.objects;

CREATE POLICY "Public Access for compliance-evidences"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'compliance-evidences' );

CREATE POLICY "Auth Insert compliance-evidences"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'compliance-evidences' );

CREATE POLICY "Auth Update compliance-evidences"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'compliance-evidences' );

CREATE POLICY "Auth Delete compliance-evidences"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'compliance-evidences' );
