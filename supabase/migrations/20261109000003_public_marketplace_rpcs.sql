-- RPCs públicas para o marketplace de oportunidades
-- Acesso anônimo (anon) via SECURITY DEFINER — sem expor tabelas a anon
-- Date: 2026-11-09

-- ─── 1. get_public_marketplace ────────────────────────────────────────────────
-- Retorna dados da organização + oportunidades publicadas + fotos
-- Chamada pelo PublicMarketplaceView sem autenticação

CREATE OR REPLACE FUNCTION public.get_public_marketplace(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_org_id   uuid;
    v_org_info json;
    v_opps     json;
BEGIN
    -- Resolve organização pelo slug (case-insensitive)
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE lower(slug) = lower(p_slug)
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN json_build_object('error', 'organization_not_found');
    END IF;

    -- Dados públicos da organização
    SELECT json_build_object(
        'id',        id,
        'name',      name,
        'logo_url',  logo_url,
        'website',   website
    ) INTO v_org_info
    FROM public.organizations
    WHERE id = v_org_id;

    -- Oportunidades publicadas com fotos aninhadas
    SELECT coalesce(json_agg(opp_with_photos ORDER BY opp_with_photos->>'created_at' DESC), '[]'::json)
    INTO v_opps
    FROM (
        SELECT json_build_object(
            'id',                       o.id,
            'organization_id',          o.organization_id,
            'title',                    o.title,
            'subtitle',                 o.subtitle,
            'status',                   o.status,
            'opportunity_type',         o.opportunity_type,
            'location_city',            o.location_city,
            'location_state',           o.location_state,
            'thumbnail_url',            o.thumbnail_url,
            'land_area_m2',             o.land_area_m2,
            'built_area_m2',            o.built_area_m2,
            'floors',                   o.floors,
            'vgv',                      o.vgv,
            'roi_pct',                  o.roi_pct,
            'tir_pct',                  o.tir_pct,
            'cost_estimate',            o.cost_estimate,
            'cost_per_m2',              o.cost_per_m2,
            'ticket_min',               o.ticket_min,
            'expected_start',           o.expected_start,
            'duration_months',          o.duration_months,
            'scenario_cost_cons_pct',   o.scenario_cost_cons_pct,
            'scenario_vgv_cons_pct',    o.scenario_vgv_cons_pct,
            'scenario_cost_opt_pct',    o.scenario_cost_opt_pct,
            'scenario_vgv_opt_pct',     o.scenario_vgv_opt_pct,
            'scenario_notes',           o.scenario_notes,
            'is_published',             o.is_published,
            'created_at',               o.created_at,
            'photos', (
                SELECT coalesce(json_agg(
                    json_build_object(
                        'id',          d.id,
                        'file_path',   d.file_path,
                        'description', d.description
                    ) ORDER BY d.created_at
                ), '[]'::json)
                FROM public.opportunity_documents d
                WHERE d.opportunity_id = o.id
                  AND d.category = 'foto'
            )
        ) AS opp_with_photos
        FROM public.investor_opportunities o
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
    ) sub;

    RETURN json_build_object(
        'organization',  v_org_info,
        'opportunities', v_opps
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;

-- ─── 2. submit_public_interest ────────────────────────────────────────────────
-- Registra manifestação de interesse de visitante anônimo
-- Valida que a oportunidade existe e está publicada; deriva organization_id

CREATE OR REPLACE FUNCTION public.submit_public_interest(
    p_opportunity_id uuid,
    p_name           text,
    p_email          text    DEFAULT NULL,
    p_phone          text    DEFAULT NULL,
    p_role           text    DEFAULT 'investidor',
    p_message        text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id  uuid;
    v_opp     RECORD;
    v_id      uuid;
    v_role    text;
BEGIN
    -- Validação básica
    IF trim(p_name) = '' OR p_name IS NULL THEN
        RETURN json_build_object('error', 'name_required');
    END IF;

    -- Normaliza role; cai em 'outro' se inválido
    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

    -- Verifica oportunidade publicada
    SELECT id, organization_id INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND is_published = true
    LIMIT 1;

    IF v_opp.id IS NULL THEN
        RETURN json_build_object('error', 'opportunity_not_found');
    END IF;

    v_org_id := v_opp.organization_id;

    -- Insere interesse (stage = 'lead' por padrão)
    INSERT INTO public.opportunity_interests (
        organization_id,
        opportunity_id,
        contact_name,
        contact_email,
        contact_phone,
        role,
        message,
        stage
    ) VALUES (
        v_org_id,
        p_opportunity_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead'
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('id', v_id, 'organization_id', v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_interest(uuid, text, text, text, text, text) TO anon, authenticated;
