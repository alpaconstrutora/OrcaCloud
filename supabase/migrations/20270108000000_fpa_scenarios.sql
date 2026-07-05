-- ============================================================
-- FP&A Module - Fase 3: Cenários e Simulação What-If
-- OrçaCloud SaaS - Migration 20270108000000
-- ============================================================

-- 1. Alterar a tabela fpa_budgets
ALTER TABLE public.fpa_budgets
ADD COLUMN IF NOT EXISTS parent_budget_id UUID REFERENCES public.fpa_budgets(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scenario_type TEXT CHECK (scenario_type IN ('OPTIMISTIC', 'PESSIMISTIC', 'CUSTOM'));

-- 2. Atualizar a constraint do 'type'
ALTER TABLE public.fpa_budgets DROP CONSTRAINT IF EXISTS fpa_budgets_type_check;
ALTER TABLE public.fpa_budgets ADD CONSTRAINT fpa_budgets_type_check 
CHECK (type IN ('ANUAL', 'OBRA', 'DEPARTAMENTO', 'REVISADO', 'FORECAST', 'SCENARIO'));

-- 3. Criar RPC para duplicar o orçamento com ajustes percentuais
CREATE OR REPLACE FUNCTION public.fpa_duplicate_budget_with_adjustment(
  p_budget_id UUID,
  p_new_name TEXT,
  p_scenario_type TEXT,
  p_adjustment_percent NUMERIC
) RETURNS UUID AS $$
DECLARE
  v_new_budget_id UUID;
  v_base_budget public.fpa_budgets%ROWTYPE;
BEGIN
  -- Buscar o orçamento base
  SELECT * INTO v_base_budget
  FROM public.fpa_budgets
  WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget base não encontrado';
  END IF;

  -- Inserir o novo header (Cenário)
  INSERT INTO public.fpa_budgets (
    empresa_id,
    project_id,
    cost_center_id,
    name,
    type,
    year,
    status,
    version,
    parent_budget_id,
    scenario_type
  ) VALUES (
    v_base_budget.empresa_id,
    v_base_budget.project_id,
    v_base_budget.cost_center_id,
    p_new_name,
    'SCENARIO',
    v_base_budget.year,
    'RASCUNHO',
    v_base_budget.version + 1,
    p_budget_id,
    p_scenario_type
  ) RETURNING id INTO v_new_budget_id;

  -- Copiar as linhas ajustando o valor
  INSERT INTO public.fpa_budget_lines (
    budget_id,
    financial_category_id,
    month,
    planned_amount,
    notes
  )
  SELECT 
    v_new_budget_id,
    financial_category_id,
    month,
    planned_amount * (1 + (p_adjustment_percent / 100.0)),
    'Ajustado via cenário ' || p_scenario_type
  FROM public.fpa_budget_lines
  WHERE budget_id = p_budget_id;

  RETURN v_new_budget_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fpa_duplicate_budget_with_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.fpa_duplicate_budget_with_adjustment TO service_role;
