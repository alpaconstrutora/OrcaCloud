-- ==========================================================================
-- Fix: Portal do Investidor - expor apenas oportunidades publicadas por token
-- ==========================================================================
-- O frontend ja escondia rascunhos para nao-admin, mas a RPC por token ainda
-- retornava todas as oportunidades da organizacao. A filtragem precisa ocorrer
-- no banco para rascunhos internos nao chegarem ao navegador do investidor.

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
             WHERE o.organization_id = v_org_id
               AND o.is_published = TRUE),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) TO anon, authenticated;

-- Acesso ao estudo vinculado tambem deve depender de oportunidade publicada.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_study(p_token TEXT, p_study_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_org_id   UUID;
    v_opp      public.investor_opportunities;
    v_study    JSONB;
    v_blocks   JSONB;
    v_capex    JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    v_org_id := v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE imovib_study_id = p_study_id
      AND organization_id = v_org_id
      AND is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    SELECT row_to_json(s)::jsonb INTO v_study
    FROM public.imovib_studies s
    WHERE s.id = p_study_id AND s.organization_id = v_org_id;

    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    SELECT COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id',                    b.id,
                'study_id',              b.study_id,
                'name',                  b.name,
                'construction_cost_sqm', b.construction_cost_sqm,
                'sales_price_sqm',       b.sales_price_sqm,
                'units',                 COALESCE(
                    (SELECT jsonb_agg(row_to_json(u))
                     FROM public.imovib_units u
                     WHERE u.block_id = b.id),
                    '[]'::jsonb
                )
            )
            ORDER BY b.created_at ASC
         )),
        '[]'::jsonb
    ) INTO v_blocks
    FROM public.imovib_blocks b
    WHERE b.study_id = p_study_id;

    SELECT COALESCE(
        (SELECT jsonb_agg(row_to_json(c) ORDER BY c.category ASC, c.created_at ASC)
         FROM public.imovib_capex_items c
         WHERE c.study_id = p_study_id),
        '[]'::jsonb
    ) INTO v_capex;

    v_study := v_study || jsonb_build_object('blocks', v_blocks, 'capex_items', v_capex);

    RETURN jsonb_build_object(
        'valid', TRUE,
        'study', v_study
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) TO anon, authenticated;
