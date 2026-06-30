-- ==========================================================================
-- Fix: Portal do Investidor - manifestar interesse via token publico
-- ==========================================================================
-- O portal por token roda como anon e nao deve inserir direto em
-- opportunity_interests. Esta RPC valida o token, garante que a oportunidade
-- pertence a org do token e esta publicada, deriva organization_id no banco e
-- registra o interesse.

CREATE OR REPLACE FUNCTION public.fn_investor_portal_submit_interest(
    p_token          TEXT,
    p_opportunity_id UUID,
    p_name           TEXT,
    p_email          TEXT DEFAULT NULL,
    p_phone          TEXT DEFAULT NULL,
    p_role           TEXT DEFAULT 'investidor',
    p_message        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_opp    public.investor_opportunities;
    v_id     UUID;
    v_role   TEXT;
BEGIN
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'name_required');
    END IF;

    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'token_invalid');
    END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = v_tok.org_id
      AND is_published = TRUE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'opportunity_not_found');
    END IF;

    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

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
        v_tok.org_id,
        p_opportunity_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'valid', true,
        'id', v_id,
        'organization_id', v_tok.org_id,
        'opportunity_id', p_opportunity_id
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
