-- migration: 20261126000000_opura_assets_mvp.sql

-- 1. Criação das Tabelas de Ativos
CREATE TABLE IF NOT EXISTS public.opura_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    parent_asset_id UUID REFERENCES public.opura_assets(id) ON DELETE SET NULL, -- Permite componentização (ex: pneu no caminhão)
    code VARCHAR(100) NOT NULL, -- Código patrimonial gerado (ex: OPR-EQP-000145)
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- equipamento, ferramenta, veiculo, tecnologia, imovel, mobiliario
    subcategory VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    purchase_date DATE,
    purchase_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    useful_life_months INT,
    residual_value NUMERIC(15, 2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'disponivel', -- disponivel, em_uso, manutencao, ocioso, baixado
    responsible_worker_id UUID, -- FK para resource_workers ou profiles
    current_project_id UUID, -- FK para public.projects
    tracking_code VARCHAR(255), -- QR Code / RFID gravado
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_asset_code_org UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.opura_asset_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.opura_assets(id) ON DELETE CASCADE,
    origin_project_id UUID, -- NULL se estava na sede/oficina
    destination_project_id UUID, -- NULL se foi para manutenção/sede
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    responsible_worker_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.opura_asset_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.opura_assets(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- preventiva, corretiva, calibracao
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'agendada', -- agendada, em_execucao, concluida, cancelada
    scheduled_date DATE NOT NULL,
    executed_date DATE,
    cost NUMERIC(15, 2) DEFAULT 0.00,
    current_odometer NUMERIC(12, 2), -- Km atual (para veículos)
    current_hourmeter NUMERIC(12, 2), -- Horímetro atual (para máquinas)
    checklist_responses JSONB, -- Resultados de checklist digital realizados pelo app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.opura_asset_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES public.opura_assets(id) ON DELETE CASCADE,
    project_id UUID NOT NULL, -- Obra solicitante
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pendente', -- pendente, aprovada, ativa, finalizada, cancelada
    requested_by_email VARCHAR(255) NOT NULL,
    approved_by_email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitação de RLS (Row Level Security - Regra 2)
ALTER TABLE public.opura_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_asset_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_asset_reservations ENABLE ROW LEVEL SECURITY;

-- 3. Criação de Políticas RLS para Acesso Corporativo (Authenticated Tenant - Regra 2)
DROP POLICY IF EXISTS "org_access_assets" ON public.opura_assets;
CREATE POLICY "org_access_assets" ON public.opura_assets
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP POLICY IF EXISTS "org_access_asset_movements" ON public.opura_asset_movements;
CREATE POLICY "org_access_asset_movements" ON public.opura_asset_movements
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP POLICY IF EXISTS "org_access_asset_maintenances" ON public.opura_asset_maintenances;
CREATE POLICY "org_access_asset_maintenances" ON public.opura_asset_maintenances
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ));

DROP POLICY IF EXISTS "org_access_asset_reservations" ON public.opura_asset_reservations;
CREATE POLICY "org_access_asset_reservations" ON public.opura_asset_reservations
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id 
        FROM public.organization_members om 
        WHERE om.email = auth.jwt()->>'email'
    ));

-- 4. Políticas de Desenvolvimento (Regra 8 — Políticas Anon)
DROP POLICY IF EXISTS "Allow anon all on assets" ON public.opura_assets;
CREATE POLICY "Allow anon all on assets" ON public.opura_assets FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on asset_movements" ON public.opura_asset_movements;
CREATE POLICY "Allow anon all on asset_movements" ON public.opura_asset_movements FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on asset_maintenances" ON public.opura_asset_maintenances;
CREATE POLICY "Allow anon all on asset_maintenances" ON public.opura_asset_maintenances FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on asset_reservations" ON public.opura_asset_reservations;
CREATE POLICY "Allow anon all on asset_reservations" ON public.opura_asset_reservations FOR ALL TO anon USING (true) WITH CHECK (true);
