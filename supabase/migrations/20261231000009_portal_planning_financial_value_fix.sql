-- migration: 20261231000009_portal_planning_financial_value_fix.sql
-- Corrige fn_build_planning_json: plannedValue/budgetedValue/actualValue em
-- schedule.itemSchedules NUNCA são persistidos (o admin, em FinancialSchedule.tsx,
-- sempre calcula na hora a partir do orçamento: quantity * sinapiItem.price * (1+bdi/100)).
-- A migration anterior (20261231000008) lia esses campos como se existissem no
-- JSON salvo, então o payload sempre voltava sem valores e o portal mostrava
-- "cronograma ainda não disponível" para clientes Serviços.
-- Agora calculamos plannedValue/budgetedValue direto do budget do projeto, casando
-- por id do item (mesma fonte de verdade do admin).

CREATE OR REPLACE FUNCTION public.fn_build_planning_json(p_client_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_proj      RECORD;
    v_settings  JSONB;
    v_sched     JSONB;
    v_items     JSONB;
    v_budget    JSONB;
    v_financial BOOLEAN;
BEGIN
    SELECT (category = 'Serviços') INTO v_financial
    FROM public.clients WHERE id = p_client_id;
    v_financial := COALESCE(v_financial, FALSE);

    WITH RECURSIVE chain AS (
        SELECT id AS plan_id, id AS node_id,
               settings->>'linkedProjectId' AS next_id, 0 AS depth
        FROM public.projects
        WHERE settings->>'classification' = 'PLANEJAMENTO'
        UNION ALL
        SELECT c.plan_id, p.id, p.settings->>'linkedProjectId', c.depth + 1
        FROM chain c
        JOIN public.projects p ON p.id::text = c.next_id
        WHERE c.next_id IS NOT NULL AND c.depth < 6
    ),
    matched AS (
        SELECT DISTINCT c.plan_id
        FROM chain c
        JOIN public.projects n ON n.id = c.node_id
        WHERE n.settings->>'clientId' = p_client_id::text
           OR n.id IN (SELECT project_id FROM public.contracts
                       WHERE client_id = p_client_id AND project_id IS NOT NULL)
    )
    SELECT p.name, p.settings, p.budget INTO v_proj
    FROM public.projects p
    JOIN matched m ON m.plan_id = p.id
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_proj.settings IS NULL THEN
        RETURN json_build_object('valid', TRUE, 'found', FALSE);
    END IF;

    v_settings := v_proj.settings;
    v_sched    := v_settings->'schedule';

    SELECT jsonb_agg(jsonb_build_object(
        'id', s->>'id', 'startDate', s->>'startDate', 'endDate', s->>'endDate',
        'duration', s->'duration', 'manualRealPct', s->'manualRealPct',
        'plannedValue', CASE WHEN v_financial THEN
            round(COALESCE((budget_match.b->'quantity')::numeric, 0)
                * COALESCE((budget_match.b->'sinapiItem'->>'price')::numeric, 0)
                * (1 + COALESCE((budget_match.b->>'bdi')::numeric, 0) / 100), 2)
            END,
        'budgetedValue', CASE WHEN v_financial THEN
            round(COALESCE((budget_match.b->'quantity')::numeric, 0)
                * COALESCE((budget_match.b->'sinapiItem'->>'price')::numeric, 0), 2)
            END
    )) INTO v_items
    FROM jsonb_array_elements(COALESCE(v_sched->'itemSchedules', '[]'::jsonb)) s
    LEFT JOIN LATERAL (
        SELECT bi
        FROM jsonb_array_elements(COALESCE(to_jsonb(v_proj.budget), '[]'::jsonb)) bi
        WHERE bi->>'id' = s->>'id'
        LIMIT 1
    ) budget_match(b) ON TRUE;

    SELECT jsonb_agg(jsonb_build_object(
        'id', b->>'id', 'group', b->>'group', 'phase', b->>'phase'
    )) INTO v_budget
    FROM jsonb_array_elements(COALESCE(to_jsonb(v_proj.budget), '[]'::jsonb)) b;

    RETURN json_build_object(
        'valid', TRUE, 'found', TRUE,
        'name', v_proj.name,
        'progress', v_settings->'obraProgress',
        'phase', v_settings->>'obraPhase',
        'startDate', v_sched->>'startDate',
        'endDate', v_sched->>'endDate',
        'outline', v_sched->'outline',
        'itemSchedules', COALESCE(v_items, '[]'::jsonb),
        'budget', COALESCE(v_budget, '[]'::jsonb),
        'financialEnabled', v_financial
    );
END;
$$;
