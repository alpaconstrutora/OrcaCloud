-- ============================================================
-- Módulo: Gestão de Mão de Obra
-- OrçaCloud SaaS - Migration
-- ============================================================

-- 1. COLABORADORES (employees)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cpf TEXT,
    phone TEXT,
    email TEXT,
    contract_type TEXT NOT NULL DEFAULT 'CLT' CHECK (contract_type IN ('CLT','PJ','DIARISTA','EMPREITEIRO','ESTAGIARIO')),
    role TEXT NOT NULL DEFAULT 'Não especificado', -- função (pedreiro, mestre, etc.)
    daily_cost NUMERIC(12,2) DEFAULT 0,
    hourly_cost NUMERIC(12,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','INATIVO','AFASTADO','DESLIGADO')),
    hire_date DATE,
    termination_date DATE,
    termination_reason TEXT,
    notes TEXT,
    avatar_url TEXT,
    admission_checklist JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_org_id ON public.employees(org_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(org_id, status);

-- 2. ALOCAÇÃO EM OBRAS (employee_allocations)
CREATE TABLE IF NOT EXISTS public.employee_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT, -- fallback se project_id for nulo
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_alloc_employee ON public.employee_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_alloc_project ON public.employee_allocations(project_id);

-- 3. EQUIPES (teams)
CREATE TABLE IF NOT EXISTS public.labor_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    foreman_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA','INATIVA')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_teams_org ON public.labor_teams(org_id);

-- 4. MEMBROS DE EQUIPE (team_members)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.labor_teams(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_employee ON public.team_members(employee_id);

-- 5. REGISTRO DE PONTO / HORAS (time_entries)
CREATE TABLE IF NOT EXISTS public.time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT,
    team_id UUID REFERENCES public.labor_teams(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_worked NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0 AND hours_worked <= 24),
    overtime_hours NUMERIC(5,2) DEFAULT 0 CHECK (overtime_hours >= 0),
    hourly_rate NUMERIC(12,2) DEFAULT 0,
    total_cost NUMERIC(12,2) GENERATED ALWAYS AS (
        (hours_worked * hourly_rate) + (overtime_hours * hourly_rate * 1.5)
    ) STORED,
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON public.time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON public.time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON public.time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON public.time_entries(status);
-- Prevenir duplicatas: um colaborador não pode ter dois registros no mesmo dia/obra
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_unique_day 
    ON public.time_entries(employee_id, date, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 6. LOGS DE PRODUTIVIDADE (productivity_logs)
CREATE TABLE IF NOT EXISTS public.productivity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    team_id UUID REFERENCES public.labor_teams(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT,
    phase TEXT, -- etapa da obra
    activity_description TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'un', -- m², m³, ml, un, kg, etc.
    planned_qty NUMERIC(12,3) DEFAULT 0,
    actual_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
    hours_spent NUMERIC(8,2) DEFAULT 0,
    man_hour_per_unit NUMERIC(10,4) GENERATED ALWAYS AS (
        CASE WHEN actual_qty > 0 THEN hours_spent / actual_qty ELSE 0 END
    ) STORED,
    productivity_pct NUMERIC(6,2) GENERATED ALWAYS AS (
        CASE WHEN planned_qty > 0 THEN (actual_qty / planned_qty * 100) ELSE NULL END
    ) STORED,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productivity_project ON public.productivity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_productivity_team ON public.productivity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_productivity_date ON public.productivity_logs(date);
CREATE INDEX IF NOT EXISTS idx_productivity_employee ON public.productivity_logs(employee_id);

-- ============================================================
-- RLS POLICIES (padrão do projeto: is_org_member)
-- ============================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_logs ENABLE ROW LEVEL SECURITY;

-- employees: acesso via org_id
CREATE POLICY "employees_org_access" ON public.employees
    FOR ALL USING (public.is_org_member(org_id));

-- employee_allocations: acesso via employee → org
CREATE POLICY "employee_alloc_org_access" ON public.employee_allocations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_id
            AND public.is_org_member(e.org_id)
        )
    );

-- labor_teams: acesso via org_id
CREATE POLICY "labor_teams_org_access" ON public.labor_teams
    FOR ALL USING (public.is_org_member(org_id));

-- team_members: acesso via team → org
CREATE POLICY "team_members_org_access" ON public.team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.labor_teams t
            WHERE t.id = team_id
            AND public.is_org_member(t.org_id)
        )
    );

-- time_entries: acesso via employee → org
CREATE POLICY "time_entries_org_access" ON public.time_entries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_id
            AND public.is_org_member(e.org_id)
        )
    );

-- productivity_logs: acesso via team ou employee → org
CREATE POLICY "productivity_logs_org_access" ON public.productivity_logs
    FOR ALL USING (
        (
            team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.labor_teams t
                WHERE t.id = team_id
                AND public.is_org_member(t.org_id)
            )
        )
        OR (
            employee_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.employees e
                WHERE e.id = employee_id
                AND public.is_org_member(e.org_id)
            )
        )
    );

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_labor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_labor_teams_updated_at
    BEFORE UPDATE ON public.labor_teams
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

CREATE TRIGGER trg_time_entries_updated_at
    BEFORE UPDATE ON public.time_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_labor_updated_at();

