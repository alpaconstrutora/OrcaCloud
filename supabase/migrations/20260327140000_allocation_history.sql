-- ============================================================
-- Gestão Mensal de Alocações - Histórico
-- ============================================================

-- 1. Adicionar coluna de período de referência
-- Formato: YYYY-MM (ex: 2026-03)
ALTER TABLE public.employee_allocations 
ADD COLUMN IF NOT EXISTS reference_period TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM');

-- 2. Ajustar a unicidade
-- Agora permitimos o mesmo colaborador na mesma obra, desde que em períodos diferentes
ALTER TABLE public.employee_allocations 
DROP CONSTRAINT IF EXISTS employee_allocations_unique_period;

ALTER TABLE public.employee_allocations 
ADD CONSTRAINT employee_allocations_unique_period 
UNIQUE (employee_id, project_id, reference_period);

-- 3. Índices para performance em filtros mensais
CREATE INDEX IF NOT EXISTS idx_allocations_period ON public.employee_allocations(reference_period);
CREATE INDEX IF NOT EXISTS idx_allocations_emp_period ON public.employee_allocations(employee_id, reference_period);

-- 4. Comentário para documentação do Schema
COMMENT ON COLUMN public.employee_allocations.reference_period IS 'Mês de referência da alocação no formato YYYY-MM';
