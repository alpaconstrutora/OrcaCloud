-- Migration: Create Contract Management Module
-- Date: 2026-02-24

-- 1. Contracts Table
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    contract_type TEXT CHECK (contract_type IN ('Empreitada Global', 'PreÃ§o UnitÃ¡rio', 'AdministraÃ§Ã£o', 'Subempreitada', 'Outros')),
    nature TEXT CHECK (nature IN ('Fornecimento', 'ServiÃ§o', 'MÃ£o de Obra', 'LocaÃ§Ã£o', 'Outros')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho', 'Ativo', 'Suspenso', 'Encerrado', 'Cancelado')),
    original_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    current_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    reajuste_index TEXT, -- ex: INCC, IPCA
    retention_rate DECIMAL(5,2) DEFAULT 0.00, -- % para retenÃ§Ã£o contratual
    responsible_email TEXT, -- UsuÃ¡rio responsÃ¡vel interno
    cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    category_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Contract Items Table
CREATE TABLE IF NOT EXISTS public.contract_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    budget_item_id TEXT, -- Link para BudgetEntry.id
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity DECIMAL(15,4) NOT NULL DEFAULT 0.00,
    unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Contract Addendums Table (Aditivos)
CREATE TABLE IF NOT EXISTS public.contract_addendums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    type TEXT CHECK (type IN ('Valor', 'Prazo', 'Ambos', 'Outros')),
    description TEXT NOT NULL,
    value_impact DECIMAL(15,2) DEFAULT 0.00,
    new_end_date DATE,
    status TEXT DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Aprovado', 'Rejeitado', 'Cancelado')),
    requested_by TEXT, -- email
    approved_by TEXT, -- email
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Contract Measurements Table (MediÃ§Ãµes)
CREATE TABLE IF NOT EXISTS public.contract_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em AnÃ¡lise', 'Processada', 'Paga', 'Cancelada')),
    total_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    retention_value DECIMAL(15,2) DEFAULT 0.00,
    net_value DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- total - retenÃ§Ãµes
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Contract Measurement Items Table
CREATE TABLE IF NOT EXISTS public.contract_measurement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id UUID REFERENCES public.contract_measurements(id) ON DELETE CASCADE,
    contract_item_id UUID REFERENCES public.contract_items(id) ON DELETE CASCADE,
    quantity_executed DECIMAL(15,4) NOT NULL DEFAULT 0.00,
    value_executed DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS contracts_org_idx ON public.contracts(organization_id);
CREATE INDEX IF NOT EXISTS contracts_project_idx ON public.contracts(project_id);
CREATE INDEX IF NOT EXISTS contract_items_contract_idx ON public.contract_items(contract_id);
CREATE INDEX IF NOT EXISTS contract_addendums_contract_idx ON public.contract_addendums(contract_id);
CREATE INDEX IF NOT EXISTS contract_measurements_contract_idx ON public.contract_measurements(contract_id);

-- 7. RLS Enablement
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_addendums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_measurement_items ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies

-- Contracts
CREATE POLICY "Users can view contract of their organization" 
ON public.contracts FOR SELECT TO authenticated 
USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "Users can manage contract of their organization" 
ON public.contracts FOR ALL TO authenticated 
USING (organization_id IS NULL OR public.is_org_member(organization_id));

-- Items (linked through contract)
CREATE POLICY "Users can view contract items" 
ON public.contract_items FOR SELECT TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

CREATE POLICY "Users can manage contract items" 
ON public.contract_items FOR ALL TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

-- Addendums
CREATE POLICY "Users can view contract addendums" 
ON public.contract_addendums FOR SELECT TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

CREATE POLICY "Users can manage contract addendums" 
ON public.contract_addendums FOR ALL TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

-- Measurements
CREATE POLICY "Users can view contract measurements" 
ON public.contract_measurements FOR SELECT TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

CREATE POLICY "Users can manage contract measurements" 
ON public.contract_measurements FOR ALL TO authenticated 
USING (contract_id IN (SELECT id FROM public.contracts));

-- Measurement Items
CREATE POLICY "Users can view measurement items" 
ON public.contract_measurement_items FOR SELECT TO authenticated 
USING (measurement_id IN (SELECT id FROM public.contract_measurements));

CREATE POLICY "Users can manage measurement items" 
ON public.contract_measurement_items FOR ALL TO authenticated 
USING (measurement_id IN (SELECT id FROM public.contract_measurements));

-- Support for Anon (development)
CREATE POLICY "Allow anon all on contracts" ON public.contracts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on contract_items" ON public.contract_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on contract_addendums" ON public.contract_addendums FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on contract_measurements" ON public.contract_measurements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on contract_measurement_items" ON public.contract_measurement_items FOR ALL TO anon USING (true) WITH CHECK (true);
