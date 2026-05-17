-- ============================================================
-- Módulo: Folha de Pagamento - ESPECIFICAÇÃO V2 (CONSOLIDADA)
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Tabelas de Cadastro e Alocação (Atualizado para usar PROJECTS real)
-- A tabela public.worksites foi removida para usar a tabela public.projects existente no sistema.
-- A criação de employee_allocations foi movida para a seção de infraestrutura abaixo.

-- 2. Ajustes em Tabelas Existentes
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0;

ALTER TABLE public.time_entries 
    ADD COLUMN IF NOT EXISTS overtime_50 NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overtime_100 NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS night_hours NUMERIC DEFAULT 0;

-- 3. Infraestrutura de Folha
-- Note: Tabelas recriadas para garantir compatibilidade com a Spec V2
DROP TABLE IF EXISTS public.payroll_items CASCADE;
DROP TABLE IF EXISTS public.payroll_results CASCADE;
DROP TABLE IF EXISTS public.payroll_events CASCADE;
DROP TABLE IF EXISTS public.payroll_runs CASCADE;
DROP TABLE IF EXISTS public.payroll_fiscal_ranges CASCADE;
DROP TABLE IF EXISTS public.employee_allocations CASCADE;
DROP TABLE IF EXISTS public.worksites CASCADE;

CREATE TABLE public.employee_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    allocation_percent NUMERIC NOT NULL CHECK (allocation_percent BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payroll_fiscal_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    year INTEGER NOT NULL,
    min_value NUMERIC NOT NULL,
    max_value NUMERIC,
    rate NUMERIC NOT NULL,
    deduction NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payroll_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    code TEXT,
    type TEXT NOT NULL, 
    amount NUMERIC NOT NULL,
    description TEXT,
    reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL, 
    amount NUMERIC NOT NULL,
    base_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payroll_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    gross NUMERIC NOT NULL,
    discounts NUMERIC NOT NULL,
    net NUMERIC NOT NULL,
    employer_cost NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(payroll_run_id, employee_id)
);

-- 4. Seed de Dados Fiscais 2024
INSERT INTO public.payroll_fiscal_ranges (type, year, min_value, max_value, rate, deduction) VALUES
('INSS', 2024, 0, 1412.00, 0.0750, 0),
('INSS', 2024, 1412.01, 2666.68, 0.0900, 21.18),
('INSS', 2024, 2666.69, 4000.03, 0.1200, 101.18),
('INSS', 2024, 4000.04, 7786.02, 0.1400, 181.18),
('IRRF', 2024, 0, 2259.20, 0, 0),
('IRRF', 2024, 2259.21, 2826.65, 0.0750, 169.44),
('IRRF', 2024, 2826.66, 3751.05, 0.1500, 381.44),
('IRRF', 2024, 3751.06, 4664.68, 0.2250, 662.77),
('IRRF', 2024, 4664.69, 999999, 0.2750, 896.00);

-- 5. RLS e Segurança
ALTER TABLE public.employee_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allocations_org_access" ON public.employee_allocations;
CREATE POLICY "allocations_org_access" ON public.employee_allocations FOR ALL USING (
    employee_id IN (SELECT id FROM public.employees WHERE org_id IN (SELECT id FROM public.organizations WHERE public.is_org_member(id)))
);

DROP POLICY IF EXISTS "payroll_runs_v2_access" ON public.payroll_runs;
CREATE POLICY "payroll_runs_v2_access" ON public.payroll_runs FOR ALL USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "payroll_items_v2_access" ON public.payroll_items;
CREATE POLICY "payroll_items_v2_access" ON public.payroll_items FOR ALL USING (payroll_run_id IN (SELECT id FROM public.payroll_runs));

DROP POLICY IF EXISTS "payroll_results_v2_access" ON public.payroll_results;
CREATE POLICY "payroll_results_v2_access" ON public.payroll_results FOR ALL USING (payroll_run_id IN (SELECT id FROM public.payroll_runs));

DROP POLICY IF EXISTS "payroll_events_v2_access" ON public.payroll_events;
CREATE POLICY "payroll_events_v2_access" ON public.payroll_events FOR ALL USING (public.is_org_member(org_id));

-- 6. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_allocations_emp ON public.employee_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON public.payroll_items(payroll_run_id, employee_id);
