-- migration: 20261231000006_project_measurements_rollup.sql
-- Fase 4 (EVM) — agrega medições de empreitada por item de orçamento, para o
-- cronograma. A ponte já existe: contract_items.budget_item_id = BudgetEntry.id
-- (= id da tarefa no cronograma). Aqui só somamos value_executed das medições,
-- classificando por estágio do ciclo (medido / aprovado / pago):
--   medido   = tudo que foi medido e não cancelado
--   aprovado = medições Processada + Paga (entram no AC do EVM)
--   pago     = medições Paga
-- Evita o fan-out N+M no cliente (listContracts → listMeasurements → getItems).

CREATE OR REPLACE FUNCTION public.fn_project_measurements_by_budget_item(p_project_id UUID)
RETURNS TABLE (
    budget_item_id TEXT,
    measured NUMERIC,
    approved NUMERIC,
    paid NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ci.budget_item_id,
        COALESCE(SUM(mi.value_executed) FILTER (WHERE m.status <> 'Cancelada'), 0)                     AS measured,
        COALESCE(SUM(mi.value_executed) FILTER (WHERE m.status IN ('Processada', 'Paga')), 0)          AS approved,
        COALESCE(SUM(mi.value_executed) FILTER (WHERE m.status = 'Paga'), 0)                           AS paid
    FROM public.contract_measurement_items mi
    JOIN public.contract_measurements m ON m.id = mi.measurement_id
    JOIN public.contract_items ci       ON ci.id = mi.contract_item_id
    JOIN public.contracts c             ON c.id = ci.contract_id
    WHERE c.project_id = p_project_id
      AND ci.budget_item_id IS NOT NULL
      AND public.is_org_member(c.organization_id)
    GROUP BY ci.budget_item_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_project_measurements_by_budget_item(UUID) TO authenticated;
