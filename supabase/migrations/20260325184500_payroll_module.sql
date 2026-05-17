-- ============================================================
-- Módulo: Folha de Pagamento Interna
-- ============================================================

-- 1. Rubricas Configuráveis
CREATE TABLE IF NOT EXISTS public.payroll_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- Ex: SALARIO, HE50, INSS
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('PROVENTO', 'DESCONTO', 'ENCARGO')),
    incidence_inss BOOLEAN DEFAULT false,
    incidence_fgts BOOLEAN DEFAULT false,
    incidence_irrf BOOLEAN DEFAULT false,
    is_variable BOOLEAN DEFAULT false, -- Se depende de horas ou eventos mensais
    formula TEXT, -- Opcional: descrição da fórmula para documentação
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ciclos de Folha (Runs)
CREATE TABLE IF NOT EXISTS public.payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'PROCESSANDO', 'FECHADO')),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES auth.users(id),
    total_gross NUMERIC(15,2) DEFAULT 0,
    total_net NUMERIC(15,2) DEFAULT 0,
    total_cost NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Itens da Folha (Rubricas por Colaborador) - VERSIONADO
CREATE TABLE IF NOT EXISTS public.payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    rubric_id UUID NOT NULL REFERENCES public.payroll_rubrics(id),
    base_value NUMERIC(15,2) NOT NULL DEFAULT 0, -- Salário base ou valor hora
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,   -- Horas, dias ou un
    calculated_value NUMERIC(15,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Resultados Consolidados por Colaborador
CREATE TABLE IF NOT EXISTS public.payroll_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    gross_value NUMERIC(15,2) NOT NULL,
    deductions_value NUMERIC(15,2) NOT NULL,
    net_value NUMERIC(15,2) NOT NULL,
    company_cost NUMERIC(15,2) NOT NULL, -- Inclui encargos (FGTS, etc)
    base_inss NUMERIC(15,2) NOT NULL,
    base_fgts NUMERIC(15,2) NOT NULL,
    base_irrf NUMERIC(15,2) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(run_id, employee_id, version)
);

-- 5. Tabelas Fiscais (INSS / IRRF)
CREATE TABLE IF NOT EXISTS public.payroll_fiscal_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('INSS', 'IRRF')),
    year INTEGER NOT NULL,
    min_value NUMERIC(15,2) NOT NULL,
    max_value NUMERIC(15,2), -- NULL se for a última faixa
    rate NUMERIC(5,4) NOT NULL,    -- 0.075, 0.09, etc
    deduction NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Eventos de Folha (Lançamentos Avulsos)
CREATE TABLE IF NOT EXISTS public.payroll_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rubric_id UUID NOT NULL REFERENCES public.payroll_rubrics(id),
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    value NUMERIC(15,2) NOT NULL,
    quantity NUMERIC(10,2) DEFAULT 1,
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'FECHADO')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Auditoria
CREATE TABLE IF NOT EXISTS public.payroll_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DATA (PADRÕES BRASILEIROS 2024)
-- ============================================================

-- Rubricas Mínimas
INSERT INTO public.payroll_rubrics (code, name, type, incidence_inss, incidence_fgts, incidence_irrf, is_variable) VALUES
('SALARIO', 'Salário Base', 'PROVENTO', true, true, true, false),
('HE50', 'Hora Extra 50%', 'PROVENTO', true, true, true, true),
('HE100', 'Hora Extra 100%', 'PROVENTO', true, true, true, true),
('AD_NOTURNO', 'Adicional Noturno', 'PROVENTO', true, true, true, true),
('BONUS', 'Bônus / Premiação', 'PROVENTO', true, true, true, true),
('INSS', 'Desconto INSS', 'DESCONTO', false, false, false, false),
('IRRF', 'Desconto IRRF', 'DESCONTO', false, false, false, false),
('FGTS', 'FGTS (Encargo)', 'ENCARGO', false, false, false, false);

-- Faixas INSS 2024 (Progressivo)
INSERT INTO public.payroll_fiscal_ranges (type, year, min_value, max_value, rate, deduction) VALUES
('INSS', 2024, 0, 1412.00, 0.0750, 0),
('INSS', 2024, 1412.01, 2666.68, 0.0900, 21.18),
('INSS', 2024, 2666.69, 4000.03, 0.1200, 101.18),
('INSS', 2024, 4000.04, 7786.02, 0.1400, 181.18);

-- Faixas IRRF 2024 (Progressivo)
INSERT INTO public.payroll_fiscal_ranges (type, year, min_value, max_value, rate, deduction) VALUES
('IRRF', 2024, 0, 2259.20, 0, 0),
('IRRF', 2024, 2259.21, 2826.65, 0.0750, 169.44),
('IRRF', 2024, 2826.66, 3751.05, 0.1500, 381.44),
('IRRF', 2024, 3751.06, 4664.68, 0.2250, 662.77),
('IRRF', 2024, 4664.69, 999999, 0.2750, 896.00);

-- RLS
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_org_access" ON public.payroll_runs FOR ALL USING (public.is_org_member(org_id));
CREATE POLICY "payroll_items_run_access" ON public.payroll_items FOR ALL USING (run_id IN (SELECT id FROM public.payroll_runs));
CREATE POLICY "payroll_results_run_access" ON public.payroll_results FOR ALL USING (run_id IN (SELECT id FROM public.payroll_runs));
CREATE POLICY "payroll_events_org_access" ON public.payroll_events FOR ALL USING (public.is_org_member(org_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON public.payroll_runs(org_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run_emp ON public.payroll_items(run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_results_run ON public.payroll_results(run_id, employee_id);
