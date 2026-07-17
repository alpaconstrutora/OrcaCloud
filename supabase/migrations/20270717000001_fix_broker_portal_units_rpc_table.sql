-- ==========================================================================
-- Fix: fn_broker_portal_get_units consultava tabela inexistente
-- Date: 2026-07-17
-- ==========================================================================
-- BUG (pre-existente, desde 20261224000002):
-- A RPC consultava `public.properties`, que NAO existe (PGRST205; o proprio
-- PostgREST sugere 'projects'). O comentario original dizia usar "a mesma
-- tabela do commercialService.listProperties" -- mas essa e' commercial_properties.
--
-- Efeito: no portal do corretor via LINK (token), o carregamento usa
-- Promise.all([getUnitsByToken, getProposalsByToken]). Como a RPC de unidades
-- erra em runtime (42P01 undefined_table), o Promise.all inteiro rejeita e o
-- portal aparece TODO ZERADO (unidades, propostas e comissoes).
--
-- Correcao: apontar para public.commercial_properties (schema real verificado:
-- tem organization_id, parent_id, current_price, specs, purpose, status).
-- row_to_json devolve todas as colunas -> superset do que o front consome.
--
-- So' substitui o corpo da funcao. Idempotente. NUNCA `supabase db push`.
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
             FROM public.commercial_properties p
             WHERE p.organization_id = v_tok.org_id),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_units(TEXT) TO anon, authenticated;
