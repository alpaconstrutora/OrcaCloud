-- migration: 20261203000006_planning_admin_and_shared.sql
-- (1) Refatora a lógica de fn_portal_get_planning para uma função interna
--     compartilhada fn_build_planning_json(client_id) — mesma busca por cadeia de
--     linkedProjectId + payload enxuto (itemSchedules/budget sem custos).
-- (2) fn_portal_get_planning(token) vira um wrapper fino (valida token → client_id).
-- (3) NOVA fn_planning_for_client(client_id) p/ o app autenticado (prévia do admin),
--     com checagem de organização (membro da org do cliente).

-- ── (1) builder interno compartilhado ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_build_planning_json(p_client_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_proj     RECORD;
    v_settings JSONB;
    v_sched    JSONB;
    v_items    JSONB;
    v_budget   JSONB;
BEGIN
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
        'duration', s->'duration', 'manualRealPct', s->'manualRealPct'
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
        'budget', COALESCE(v_budget, '[]'::jsonb)
    );
END;
$$;

-- ── (2) wrapper público por token (portal anon) ──────────────────────────────
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

-- ── (3) wrapper autenticado por client_id (prévia do admin) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_planning_for_client(p_client_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_org UUID;
BEGIN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
    IF v_org IS NULL THEN RETURN json_build_object('valid', FALSE); END IF;

    -- caller precisa ser membro da org do cliente
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_org
          AND om.email = auth.jwt()->>'email'
    ) THEN
        RETURN json_build_object('valid', FALSE);
    END IF;

    RETURN public.fn_build_planning_json(p_client_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_planning_for_client(UUID) TO authenticated;
