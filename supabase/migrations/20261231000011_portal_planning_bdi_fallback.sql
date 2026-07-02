-- migration: 20261231000011_portal_planning_bdi_fallback.sql
-- Corrige o cálculo de plannedValue: BDI só era aplicado quando o ITEM
-- individual tinha `bdi` salvo (raro — a maioria dos itens usa o BDI global
-- do orçamento). Sem fallback, plannedValue saía sem margem/BDI na maioria
-- dos casos, mostrando ao cliente o custo puro em vez do valor de venda.
-- Replica a cascata do admin (FinancialSchedule.tsx:1674-1687, effectiveBudgetBdi):
--   item.bdi ?? bdi da versão de orçamento FIXADA (basedOnBudgetVersionId)
--           ?? bdi da versão ATIVA do projeto vinculado
--           ?? bdi do projeto vinculado (linkedProjectId)
--           ?? bdi do próprio planejamento
--           ?? 0

CREATE OR REPLACE FUNCTION public.fn_build_planning_json(p_client_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_proj          RECORD;
    v_settings      JSONB;
    v_sched         JSONB;
    v_items         JSONB;
    v_budget        JSONB;
    v_financial     BOOLEAN;
    v_budget_src    JSONB;
    v_linked_settings JSONB;
    v_linked_versions JSONB;
    v_pinned_bdi    NUMERIC;
    v_global_bdi    NUMERIC;
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

    v_budget_src := CASE
        WHEN jsonb_typeof(v_settings->'basedOnBudgetSnapshot') = 'array'
             AND jsonb_array_length(v_settings->'basedOnBudgetSnapshot') > 0
            THEN v_settings->'basedOnBudgetSnapshot'
        ELSE COALESCE(to_jsonb(v_proj.budget), '[]'::jsonb)
    END;

    -- BDI global: mesma cascata do admin (versão fixada > versão ativa > projeto vinculado > próprio).
    IF v_settings->>'linkedProjectId' IS NOT NULL THEN
        SELECT settings INTO v_linked_settings
        FROM public.projects WHERE id = (v_settings->>'linkedProjectId')::uuid;
    END IF;
    v_linked_versions := COALESCE(v_linked_settings->'versions', '[]'::jsonb);

    IF v_settings->>'basedOnBudgetVersionId' IS NOT NULL THEN
        SELECT (ver->'settings'->>'bdi')::numeric INTO v_pinned_bdi
        FROM jsonb_array_elements(v_linked_versions) ver
        WHERE ver->>'id' = v_settings->>'basedOnBudgetVersionId'
        LIMIT 1;
    END IF;
    IF v_pinned_bdi IS NULL THEN
        SELECT (ver->'settings'->>'bdi')::numeric INTO v_pinned_bdi
        FROM jsonb_array_elements(v_linked_versions) ver
        WHERE ver->>'id' = v_linked_settings->>'activeVersionId'
        LIMIT 1;
    END IF;

    v_global_bdi := COALESCE(
        v_pinned_bdi,
        (v_linked_settings->>'bdi')::numeric,
        (v_settings->>'bdi')::numeric,
        0
    );

    SELECT jsonb_agg(jsonb_build_object(
        'id', s->>'id', 'startDate', s->>'startDate', 'endDate', s->>'endDate',
        'duration', s->'duration', 'manualRealPct', s->'manualRealPct',
        'plannedValue', CASE WHEN v_financial THEN
            round(COALESCE((budget_match.b->'quantity')::numeric, 0)
                * COALESCE((budget_match.b->'sinapiItem'->>'price')::numeric, 0)
                * (1 + COALESCE((budget_match.b->>'bdi')::numeric, v_global_bdi) / 100), 2)
            END,
        'budgetedValue', CASE WHEN v_financial THEN
            round(COALESCE((budget_match.b->'quantity')::numeric, 0)
                * COALESCE((budget_match.b->'sinapiItem'->>'price')::numeric, 0), 2)
            END
    )) INTO v_items
    FROM jsonb_array_elements(COALESCE(v_sched->'itemSchedules', '[]'::jsonb)) s
    LEFT JOIN LATERAL (
        SELECT bi
        FROM jsonb_array_elements(v_budget_src) bi
        WHERE bi->>'id' = s->>'id'
        LIMIT 1
    ) budget_match(b) ON TRUE;

    SELECT jsonb_agg(jsonb_build_object(
        'id', b->>'id', 'group', b->>'group', 'phase', b->>'phase'
    )) INTO v_budget
    FROM jsonb_array_elements(v_budget_src) b;

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
