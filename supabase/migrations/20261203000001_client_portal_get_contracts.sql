-- migration: 20261203000001_client_portal_get_contracts.sql
-- Portal do Cliente — corrige aba "Contratos" vazia
-- Causa: portal acessa como anon (token público) e a tabela contracts não tem
-- policy RLS para anon (removida em 20260423_fix_rls_critical). A query direta
-- retornava [] silenciosamente. Solução: RPC SECURITY DEFINER validada por token,
-- mesmo padrão de fn_portal_get_requests / client_portal_get_data.

CREATE OR REPLACE FUNCTION public.fn_portal_get_contracts(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT json_agg(c ORDER BY c.created_at DESC)
            FROM (
                SELECT id, number, title, contract_type, status,
                       original_value, current_value, start_date, end_date,
                       signature_status, signature_url, signed_contract_url,
                       direction, minuta_versions, created_at
                FROM public.contracts
                WHERE client_id = v_tok.client_id
                  AND organization_id = v_tok.org_id
                  AND direction = 'OUTGOING'
                  AND status <> 'Rascunho'
            ) c
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_contracts(TEXT) TO anon, authenticated;
