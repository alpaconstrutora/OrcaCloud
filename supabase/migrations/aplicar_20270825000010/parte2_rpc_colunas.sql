
-- ##########################################################################
-- PARTE 2 de 3 — RPC anon das colunas (rodar sozinha)
-- ##########################################################################
SET lock_timeout = '3s';

-- --------------------------------------------------------------------------
-- RPC anon: colunas visíveis da org dona do token.
-- Retorna columns=null quando a org nunca configurou — o front cai no default
-- (todas as colunas), que é o comportamento de hoje.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_price_columns(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok  public.broker_portal_tokens;
    v_cols JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT visible_columns INTO v_cols
    FROM public.broker_portal_price_columns
    WHERE org_id = v_tok.org_id;

    RETURN jsonb_build_object('valid', TRUE, 'columns', v_cols);
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_price_columns(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_price_columns(TEXT) TO anon, authenticated;
