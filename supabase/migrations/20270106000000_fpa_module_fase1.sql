-- ============================================================
-- FP&A Module - Fase 1: Base Gerencial e Orçamento
-- OrçaCloud SaaS - Migration 20270106000000
-- ============================================================

-- 1. Criação da Tabela Mestre de Orçamentos
CREATE TABLE IF NOT EXISTS public.fpa_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ANUAL', 'OBRA', 'DEPARTAMENTO', 'REVISADO', 'FORECAST')),
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'EM_REVISAO', 'APROVADO', 'BLOQUEADO', 'ARQUIVADO')),
    version INTEGER NOT NULL DEFAULT 1,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Criação da Tabela Detalhe de Linhas de Orçamento
CREATE TABLE IF NOT EXISTS public.fpa_budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.fpa_budgets(id) ON DELETE CASCADE,
    financial_category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    planned_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(budget_id, financial_category_id, month)
);

-- 3. Triggers de Updated At
CREATE OR REPLACE FUNCTION public.update_fpa_budget_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fpa_budgets_updated_at
BEFORE UPDATE ON public.fpa_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_fpa_budget_updated_at();

CREATE TRIGGER trg_fpa_budget_lines_updated_at
BEFORE UPDATE ON public.fpa_budget_lines
FOR EACH ROW EXECUTE FUNCTION public.update_fpa_budget_updated_at();

-- 4. View: Budget vs Actual Aggregation
-- Aggregates actuals from internal_transactions and compares with fpa_budget_lines
CREATE OR REPLACE VIEW public.vw_fpa_budget_vs_actual AS
WITH actuals AS (
    SELECT
        it.organization_id,
        COALESCE(p.empresa_id, c.id) AS empresa_id,
        it.project_id,
        it.cost_center_id,
        fc.id AS financial_category_id,
        EXTRACT(YEAR FROM it.transaction_date)::INTEGER AS year,
        EXTRACT(MONTH FROM it.transaction_date)::INTEGER AS month,
        SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END) AS actual_amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.name = it.category
    LEFT JOIN public.projects p ON p.id = it.project_id
    LEFT JOIN public.companies c ON c.org_id = it.organization_id
    WHERE it.status = 'CONCILIATED'
    GROUP BY it.organization_id, COALESCE(p.empresa_id, c.id), it.project_id, it.cost_center_id, fc.id, year, month
)
SELECT 
    b.id AS budget_id,
    b.empresa_id,
    b.project_id,
    b.cost_center_id,
    b.name AS budget_name,
    b.year,
    bl.month,
    fc.name AS category_name,
    fc.dre_group,
    bl.planned_amount,
    COALESCE(a.actual_amount, 0) AS actual_amount,
    (COALESCE(a.actual_amount, 0) - bl.planned_amount) AS variance_amount,
    CASE 
        WHEN bl.planned_amount = 0 THEN 0
        ELSE ROUND(((COALESCE(a.actual_amount, 0) - bl.planned_amount) / NULLIF(bl.planned_amount, 0)) * 100, 2)
    END AS variance_percent
FROM public.fpa_budget_lines bl
JOIN public.fpa_budgets b ON b.id = bl.budget_id
LEFT JOIN public.financial_categories fc ON fc.id = bl.financial_category_id
LEFT JOIN actuals a ON 
    a.empresa_id = b.empresa_id 
    AND (a.project_id = b.project_id OR (a.project_id IS NULL AND b.project_id IS NULL))
    AND (a.cost_center_id = b.cost_center_id OR (a.cost_center_id IS NULL AND b.cost_center_id IS NULL))
    AND a.financial_category_id = bl.financial_category_id
    AND a.year = b.year 
    AND a.month = bl.month;

-- 5. RLS Policies
ALTER TABLE public.fpa_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fpa_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read fpa_budgets" 
ON public.fpa_budgets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert fpa_budgets" 
ON public.fpa_budgets FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update fpa_budgets" 
ON public.fpa_budgets FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to read fpa_budget_lines" 
ON public.fpa_budget_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert fpa_budget_lines" 
ON public.fpa_budget_lines FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update fpa_budget_lines" 
ON public.fpa_budget_lines FOR UPDATE TO authenticated USING (true);
