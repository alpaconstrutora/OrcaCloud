-- Migration: opura_projetos_eletricos_schema
-- Description: Tabelas fundamentais para o MVP do módulo de engenharia elétrica.

-- 1. Projetos Elétricos
CREATE TABLE IF NOT EXISTS public.opura_electrical_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    technical_lead TEXT,
    tension_type TEXT,
    default_voltage NUMERIC,
    status TEXT DEFAULT 'RASCUNHO',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Versões do Projeto Elétrico
CREATE TABLE IF NOT EXISTS public.opura_electrical_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    electrical_project_id UUID NOT NULL REFERENCES public.opura_electrical_projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    status TEXT DEFAULT 'RASCUNHO',
    is_locked BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Plantas (Plans)
CREATE TABLE IF NOT EXISTS public.opura_electrical_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES public.opura_electrical_versions(id) ON DELETE CASCADE,
    file_url TEXT,
    floor_name TEXT,
    scale_factor NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Ambientes (Rooms)
CREATE TABLE IF NOT EXISTS public.opura_electrical_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.opura_electrical_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    area_sqm NUMERIC,
    perimeter_m NUMERIC,
    polygon_points JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Quadros (Boards)
CREATE TABLE IF NOT EXISTS public.opura_electrical_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES public.opura_electrical_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    board_type TEXT,
    voltage NUMERIC,
    phases INTEGER,
    main_breaker_capacity NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Circuitos (Circuits)
CREATE TABLE IF NOT EXISTS public.opura_electrical_circuits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    board_id UUID NOT NULL REFERENCES public.opura_electrical_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    circuit_type TEXT,
    voltage NUMERIC,
    installed_power_w NUMERIC,
    demand_factor NUMERIC,
    breaker_capacity NUMERIC,
    wire_section_mm2 NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Pontos Elétricos (Points)
CREATE TABLE IF NOT EXISTS public.opura_electrical_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.opura_electrical_rooms(id) ON DELETE CASCADE,
    circuit_id UUID REFERENCES public.opura_electrical_circuits(id) ON DELETE SET NULL,
    point_type TEXT NOT NULL,
    power_w NUMERIC,
    voltage NUMERIC,
    height_m NUMERIC,
    canvas_x NUMERIC,
    canvas_y NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Quantitativos (Takeoffs)
CREATE TABLE IF NOT EXISTS public.opura_electrical_takeoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES public.opura_electrical_versions(id) ON DELETE CASCADE,
    item_type TEXT,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    unit_cost NUMERIC,
    waste_factor NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HABILITAR RLS EM TODAS AS TABELAS
ALTER TABLE public.opura_electrical_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opura_electrical_takeoffs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- POLÍTICAS DE RLS - PROJECTS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_projects;
    CREATE POLICY "org_access" ON public.opura_electrical_projects FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_projects" ON public.opura_electrical_projects;
    CREATE POLICY "Allow anon all on opura_electrical_projects" ON public.opura_electrical_projects FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - VERSIONS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_versions;
    CREATE POLICY "org_access" ON public.opura_electrical_versions FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_versions" ON public.opura_electrical_versions;
    CREATE POLICY "Allow anon all on opura_electrical_versions" ON public.opura_electrical_versions FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - PLANS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_plans;
    CREATE POLICY "org_access" ON public.opura_electrical_plans FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_plans" ON public.opura_electrical_plans;
    CREATE POLICY "Allow anon all on opura_electrical_plans" ON public.opura_electrical_plans FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - ROOMS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_rooms;
    CREATE POLICY "org_access" ON public.opura_electrical_rooms FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_rooms" ON public.opura_electrical_rooms;
    CREATE POLICY "Allow anon all on opura_electrical_rooms" ON public.opura_electrical_rooms FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - BOARDS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_boards;
    CREATE POLICY "org_access" ON public.opura_electrical_boards FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_boards" ON public.opura_electrical_boards;
    CREATE POLICY "Allow anon all on opura_electrical_boards" ON public.opura_electrical_boards FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - CIRCUITS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_circuits;
    CREATE POLICY "org_access" ON public.opura_electrical_circuits FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_circuits" ON public.opura_electrical_circuits;
    CREATE POLICY "Allow anon all on opura_electrical_circuits" ON public.opura_electrical_circuits FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - POINTS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_points;
    CREATE POLICY "org_access" ON public.opura_electrical_points FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_points" ON public.opura_electrical_points;
    CREATE POLICY "Allow anon all on opura_electrical_points" ON public.opura_electrical_points FOR ALL TO anon USING (true) WITH CHECK (true);

    -- POLÍTICAS DE RLS - TAKEOFFS
    DROP POLICY IF EXISTS "org_access" ON public.opura_electrical_takeoffs;
    CREATE POLICY "org_access" ON public.opura_electrical_takeoffs FOR ALL TO authenticated USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE email = auth.jwt()->>'email')
    );
    DROP POLICY IF EXISTS "Allow anon all on opura_electrical_takeoffs" ON public.opura_electrical_takeoffs;
    CREATE POLICY "Allow anon all on opura_electrical_takeoffs" ON public.opura_electrical_takeoffs FOR ALL TO anon USING (true) WITH CHECK (true);
END $$;
