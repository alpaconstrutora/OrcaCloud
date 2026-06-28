-- migration: 20261203000002_client_portal_get_planning.sql
-- Portal do Cliente — nova aba "Obra/Cronograma" (integração com Planejamento)
-- Expõe ao cliente, via token anon, o avanço da obra do projeto de PLANEJAMENTO
-- vinculado a ele. Payload "enxuto" (físico apenas): progresso, datas, hierarquia
-- (outline) e datas/percentuais por tarefa — SEM valores monetários (budgetedValue,
-- plannedValue, actualValue são descartados). Mesmo padrão SECURITY DEFINER das
-- demais RPCs fn_portal_* / client_portal_get_data.

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

    -- Projeto de planejamento do cliente (mais recente)
    SELECT p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_tok.client_id::text
      AND p.settings->>'classification' = 'PLANEJAMENTO'
      AND p.settings->>'organizationId' = v_tok.org_id::text
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_proj.settings IS NULL THEN
        RETURN json_build_object('valid', TRUE, 'found', FALSE);
    END IF;

    v_settings := v_proj.settings;
    v_sched    := v_settings->'schedule';

    -- itemSchedules enxuto: só campos físicos (sem valores R$)
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
