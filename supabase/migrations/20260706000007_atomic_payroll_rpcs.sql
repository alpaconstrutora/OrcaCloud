-- Migration: RPCs atômicas para saveAllocations e updateEmployeeRecurringRubrics
-- Date: 2026-07-06
-- Problema: ambas as funções faziam DELETE seguido de INSERT sem transação.
--   Se o INSERT falhasse, o DELETE já tinha ocorrido → colaborador sem alocações/rubricas.
-- Solução: encapsular em funções SECURITY DEFINER com BEGIN implícito do plpgsql.

-- ── 1. Alocações de obra ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_employee_allocations(
    p_employee_id UUID,
    p_period      TEXT,
    p_allocations JSONB   -- array de {project_id, allocation_percent}
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.employee_allocations
    WHERE employee_id = p_employee_id
      AND reference_period = p_period;

    IF jsonb_array_length(p_allocations) > 0 THEN
        INSERT INTO public.employee_allocations
               (employee_id, project_id, allocation_percent, reference_period)
        SELECT p_employee_id,
               (item->>'project_id')::UUID,
               (item->>'allocation_percent')::NUMERIC,
               p_period
        FROM   jsonb_array_elements(p_allocations) AS item;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_employee_allocations(UUID, TEXT, JSONB)
    TO authenticated;

-- ── 2. Rubricas automáticas do colaborador ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_employee_rubrics(
    p_employee_id  UUID,
    p_rubric_codes TEXT[],
    p_org_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.employee_automatic_rubrics
    WHERE employee_id = p_employee_id;

    IF array_length(p_rubric_codes, 1) > 0 THEN
        INSERT INTO public.employee_automatic_rubrics (employee_id, rubric_code, org_id)
        SELECT p_employee_id, code, p_org_id
        FROM   unnest(p_rubric_codes) AS code;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_employee_rubrics(UUID, TEXT[], UUID)
    TO authenticated;
