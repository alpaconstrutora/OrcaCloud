-- migration: 20261231000008_portal_planning_financial_servicos.sql
-- Cronograma Físico-Financeiro no Portal do Cliente, exclusivo para clientes
-- category = 'Serviços'. fn_build_planning_json passa a receber o client_id e
-- decidir no servidor (nunca na UI) se inclui valores monetários no payload.
--
-- Efeito colateral (correção): um rename mecânico de timestamps (commit
-- 77d29cf) fez fn_portal_get_planning "reverter" para uma versão antiga sem
-- chain/budget (o antigo 20261203000002 virou 20261203000008, executando
-- DEPOIS de 20261203000006). Esta migration restaura fn_portal_get_planning
-- como wrapper fino de fn_build_planning_json, igual ao desenho original.

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
        'plannedValue', CASE WHEN v_financial THEN s->'plannedValue' END,
        'actualValue',  CASE WHEN v_financial THEN s->'actualValue' END,
        'budgetedValue', CASE WHEN v_financial THEN s->'budgetedValue' END
    )) INTO v_items
    FROM jsonb_array_elements(COALESCE(v_sched->'itemSchedules', '[]'::jsonb)) s;

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

-- wrapper público por token (portal anon) — restaurado para usar o builder
-- compartilhado (chain + budget + gate financeiro), em vez da versão antiga
-- reintroduzida pelo rename de timestamps.
CREATE OR REPLACE FUNCTION public.fn_portal_get_planning(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN public.fn_build_planning_json(v_tok.client_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_planning(TEXT) TO anon, authenticated;
