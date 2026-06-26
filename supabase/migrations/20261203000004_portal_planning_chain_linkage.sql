-- migration: 20261203000004_portal_planning_chain_linkage.sql
-- fn_portal_get_planning: vínculo cliente↔planejamento por CADEIA de linkedProjectId.
-- Dados reais: planejamentos têm clientId=null e vinculam a um ORÇAMENTO, que por sua
-- vez vincula a uma OBRA — e é a OBRA que carrega o clientId. Cadeia típica:
--   planejamento → orçamento → obra(clientId)
-- A versão anterior só casava 1 nível. Aqui percorremos a cadeia de linkedProjectId
-- para frente (até 6 saltos) e casamos o planejamento se QUALQUER nó da cadeia
-- pertencer ao cliente — por settings.clientId OU por contrato (contracts.project_id).

CREATE OR REPLACE FUNCTION public.fn_portal_get_planning(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok      public.client_portal_tokens;
    v_proj     RECORD;
    v_settings JSONB;
    v_sched    JSONB;
    v_items    JSONB;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    WITH RECURSIVE chain AS (
        -- raiz: cada planejamento (e o 1º nó da sua cadeia = ele mesmo)
        SELECT id AS plan_id, id AS node_id,
               settings->>'linkedProjectId' AS next_id, 0 AS depth
        FROM public.projects
        WHERE settings->>'classification' = 'PLANEJAMENTO'
        UNION ALL
        -- segue linkedProjectId para frente
        SELECT c.plan_id, p.id, p.settings->>'linkedProjectId', c.depth + 1
        FROM chain c
        JOIN public.projects p ON p.id::text = c.next_id
        WHERE c.next_id IS NOT NULL AND c.depth < 6
    ),
    matched AS (
        SELECT DISTINCT c.plan_id
        FROM chain c
        JOIN public.projects n ON n.id = c.node_id
        WHERE n.settings->>'clientId' = v_tok.client_id::text
           OR n.id IN (
               SELECT project_id FROM public.contracts
               WHERE client_id = v_tok.client_id AND project_id IS NOT NULL
           )
    )
    SELECT p.name, p.settings INTO v_proj
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
        'id',            s->>'id',
        'startDate',     s->>'startDate',
        'endDate',       s->>'endDate',
        'duration',      s->'duration',
        'manualRealPct', s->'manualRealPct'
    ))
    INTO v_items
    FROM jsonb_array_elements(COALESCE(v_sched->'itemSchedules', '[]'::jsonb)) s;

    RETURN json_build_object(
        'valid',     TRUE,
        'found',     TRUE,
        'name',      v_proj.name,
        'progress',  v_settings->'obraProgress',
        'phase',     v_settings->>'obraPhase',
        'startDate', v_sched->>'startDate',
        'endDate',   v_sched->>'endDate',
        'outline',   v_sched->'outline',
        'itemSchedules', COALESCE(v_items, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_planning(TEXT) TO anon, authenticated;
