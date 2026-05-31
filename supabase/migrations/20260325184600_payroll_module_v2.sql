-- ============================================================
-- Módulo: Folha de Pagamento - ESPECIFICAÇÃO V2
-- ============================================================

-- 1. Ajustes em Tabelas Existentes
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0;

ALTER TABLE public.time_entries 
    ADD COLUMN IF NOT EXISTS overtime_50 NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overtime_100 NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS night_hours NUMERIC DEFAULT 0;

-- 2. Novas Tabelas de Infraestrutura
CREATE TABLE IF NOT EXISTS public.worksites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    worksite_id UUID REFERENCES public.worksites(id) ON DELETE CASCADE,
    allocation_percent NUMERIC NOT NULL CHECK (allocation_percent BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Eventos e Runs
-- Note: Reutilizando estrutura ou adaptando para o nome exato solicitado

-- GUARD: aborta se houver dados de folha — evita perda acidental em prod.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payroll_runs')
     AND (SELECT COUNT(*) FROM public.payroll_runs) > 0 THEN
    RAISE EXCEPTION 'payroll_module_v2: payroll_runs tem dados — DROP TABLE abortado para evitar perda. Faça backup antes de prosseguir.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.payroll_events CASCADE;
CREATE TABLE public.payroll_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- Código da rubrica (SALARIO, BONUS, etc)
    amount NUMERIC NOT NULL,
    reference_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.payroll_runs CASCADE;
CREATE TABLE public.payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.payroll_items CASCADE;
CREATE TABLE public.payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL, -- provento, desconto, encargo
    amount NUMERIC NOT NULL,
    base_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.payroll_results CASCADE;
CREATE TABLE public.payroll_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    gross NUMERIC NOT NULL,
    discounts NUMERIC NOT NULL,
    net NUMERIC NOT NULL,
    employer_cost NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS e Segurança
ALTER TABLE public.worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worksites_org_access" ON public.worksites FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "allocations_org_access" ON public.employee_allocations FOR ALL USING (
    employee_id IN (SELECT id FROM public.employees WHERE org_id IN (SELECT id FROM public.organizations WHERE public.is_org_member(id)))
);

-- Reaplicar RLS para novas tabelas de payroll
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_v2_access" ON public.payroll_runs FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "payroll_items_v2_access" ON public.payroll_items FOR ALL USING (payroll_run_id IN (SELECT id FROM public.payroll_runs));
CREATE POLICY "payroll_results_v2_access" ON public.payroll_results FOR ALL USING (payroll_run_id IN (SELECT id FROM public.payroll_runs));
CREATE POLICY "payroll_events_v2_access" ON public.payroll_events FOR ALL USING (public.is_org_member(org_id));

-- Index de Performance
CREATE INDEX IF NOT EXISTS idx_allocations_emp ON public.employee_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON public.payroll_items(payroll_run_id, employee_id);
