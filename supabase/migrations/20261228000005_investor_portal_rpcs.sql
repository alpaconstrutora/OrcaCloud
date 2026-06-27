-- ==========================================================================
-- Migration: RPCs de dados via token — Portal do Investidor (acesso anon)
-- Cada RPC valida o token, encontra o investor e retorna dados filtrados.
-- Espelha fn_broker_portal_get_* (20261224000002) e fn_portal_get_* do cliente.
--
-- Armadilha registrada: investors pode ter organization_id NULL.
-- As RPCs não rejeitam org NULL — o filtro é feito por investor_id (via token).
-- ==========================================================================

-- ==========================================================================
-- Resumo financeiro do investidor: participações + aportes + projetos vinculados
-- (alimenta abas Dashboard, Cotas, Financeiro)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_summary(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_inv_id   UUID;
    v_org_id   UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'participations', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               ip.id,
                    'project_id',       ip.project_id,
                    'project_name',     p.name,
                    'ownership_pct',    ip.ownership_pct,
                    'committed_amount', ip.committed_amount,
                    'quota_count',      ip.quota_count
                )
             )
             FROM public.investor_participations ip
             JOIN public.projects p ON p.id = ip.project_id
             WHERE ip.investor_id = v_inv_id
               AND ip.organization_id = v_org_id),
            '[]'::jsonb
        ),
        'contributions', COALESCE(
            (SELECT jsonb_agg(row_to_json(ic))
             FROM public.investor_contributions ic
             WHERE ic.investor_id = v_inv_id
               AND ic.organization_id = v_org_id
             ORDER BY ic.created_at DESC),
            '[]'::jsonb
        ),
        'projects', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',             pr.id,
                    'name',           pr.name,
                    'investor_id',    pr.investor_id,
                    'settings',       pr.settings
                )
             )
             FROM public.projects pr
             WHERE pr.investor_id = v_inv_id
               AND pr.settings->>'classification' = 'OBRA'),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Documentos / Relatórios do investidor (aba Documentos)
-- Retorna relatórios da org filtrados pelo investor_id do token.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_reports(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',   TRUE,
        'reports', COALESCE(
            (SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
             FROM public.investor_reports r
             WHERE r.organization_id = v_org_id
               AND (r.investor_id = v_inv_id OR r.investor_id IS NULL)),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_reports(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Comunicados da org visíveis ao investidor (aba Comunicados)
-- Retorna comunicados publicados + flag se já foi aceito pelo investidor.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_announcements(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',         TRUE,
        'announcements', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',                     ia.id,
                    'title',                  ia.title,
                    'body',                   ia.body,
                    'type',                   ia.type,
                    'published_at',           ia.published_at,
                    'requires_acknowledgment', ia.requires_acknowledgment,
                    'project_id',             ia.project_id,
                    'created_at',             ia.created_at,
                    'acknowledged',           (ack.id IS NOT NULL),
                    'vote_option',            ack.vote_option
                )
                ORDER BY ia.published_at DESC
             )
             FROM public.investor_announcements ia
             LEFT JOIN public.investor_acknowledgments ack
                 ON ack.announcement_id = ia.id AND ack.investor_id = v_inv_id
             WHERE ia.organization_id = v_org_id
               AND ia.published_at IS NOT NULL),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_announcements(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Aceitar/votar comunicado via token (anon com SECURITY DEFINER)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_acknowledge(
    p_token           TEXT,
    p_announcement_id UUID,
    p_vote_option     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
    v_ann    public.investor_announcements;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"token_invalid"}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    -- Garante que o comunicado pertence à org do token
    SELECT * INTO v_ann
    FROM public.investor_announcements
    WHERE id = p_announcement_id AND organization_id = v_org_id;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    INSERT INTO public.investor_acknowledgments (announcement_id, investor_id, vote_option)
    VALUES (p_announcement_id, v_inv_id, p_vote_option)
    ON CONFLICT (announcement_id, investor_id) DO UPDATE
        SET vote_option      = EXCLUDED.vote_option,
            acknowledged_at  = NOW();

    RETURN '{"valid":true}'::jsonb;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_acknowledge(TEXT, UUID, TEXT) TO anon, authenticated;

-- ==========================================================================
-- Oportunidades de investimento da org (aba Oportunidades)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_opportunities(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',         TRUE,
        'opportunities', COALESCE(
            (SELECT jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC)
             FROM public.investor_opportunities o
             WHERE o.organization_id = v_org_id),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Marcos da obra (aba Evolução/Timeline) para projetos do investidor
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_milestones(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',      TRUE,
        'milestones', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',             pm.id,
                    'project_id',     pm.project_id,
                    'project_name',   pr.name,
                    'name',           pm.name,
                    'planned_date',   pm.planned_date,
                    'completed_date', pm.completed_date,
                    'status',         pm.status,
                    'physical_pct',   pm.physical_pct,
                    'order_index',    pm.order_index
                )
                ORDER BY pr.name, pm.order_index
             )
             FROM public.project_milestones pm
             JOIN public.projects pr ON pr.id = pm.project_id
             WHERE pm.organization_id = v_org_id
               AND pr.investor_id = v_inv_id),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_milestones(TEXT) TO anon, authenticated;
