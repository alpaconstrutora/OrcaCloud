-- ==========================================================================
-- Migration: RPCs de dados via token — Portal do Corretor (acesso anon)
-- Cada RPC valida o token, encontra o broker_profile e retorna dados filtrados.
-- Espelha fn_portal_get_contracts / fn_portal_get_requests do portal do cliente.
-- ==========================================================================

-- ==========================================================================
-- Unidades disponíveis (estoque público — todas da org, visíveis ao corretor)
-- Usa a tabela properties (mesma usada pelo commercialService.listProperties)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_units(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'units', COALESCE(
            (SELECT jsonb_agg(row_to_json(p))
             FROM public.properties p
             WHERE p.organization_id = v_tok.org_id),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Propostas do corretor (filtradas pelo email do perfil)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_proposals(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid',     TRUE,
        'proposals', COALESCE(
            (SELECT jsonb_agg(row_to_json(p))
             FROM public.broker_portal_proposals p
             WHERE p.organization_id = v_tok.org_id
               AND p.broker_email = v_bp.email),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_proposals(TEXT) TO anon, authenticated;

-- ==========================================================================
-- Comissões do corretor
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_commissions(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid',       TRUE,
        'commissions', COALESCE(
            (SELECT jsonb_agg(row_to_json(c))
             FROM public.broker_portal_commissions c
             WHERE c.organization_id = v_tok.org_id
               AND c.broker_email = v_bp.email),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_commissions(TEXT) TO anon, authenticated;
