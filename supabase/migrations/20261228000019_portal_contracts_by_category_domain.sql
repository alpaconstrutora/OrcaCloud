-- migration: 20261228000004_portal_contracts_by_category_domain.sql
-- Portal do Cliente — aba Contratos passa a respeitar o domínio do contrato
-- conforme o tipo (category) do cliente: Vendas → VENDAS, Locação → LOCACAO,
-- Serviços → SERVICOS. Depende de contracts.domain (migration 20261228000003).
-- Os três domínios de contrato nunca se misturam no portal.

CREATE OR REPLACE FUNCTION public.fn_portal_get_contracts(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok      public.client_portal_tokens;
    v_category TEXT;
    v_domain   TEXT;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- Domínio de contrato derivado da categoria do cliente
    SELECT category INTO v_category FROM public.clients WHERE id = v_tok.client_id;
    v_domain := CASE v_category
        WHEN 'Vendas'   THEN 'VENDAS'
        WHEN 'Locação'  THEN 'LOCACAO'
        WHEN 'Serviços' THEN 'SERVICOS'
        ELSE NULL
    END;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT json_agg(c ORDER BY c.created_at DESC)
            FROM (
                SELECT id, number, title, contract_type, status,
                       original_value, current_value, start_date, end_date,
                       signature_status, signature_url, signed_contract_url,
                       direction, domain, minuta_versions, created_at
                FROM public.contracts
                WHERE client_id = v_tok.client_id
                  AND organization_id = v_tok.org_id
                  AND direction = 'OUTGOING'
                  AND status <> 'Rascunho'
                  AND (v_domain IS NULL OR domain = v_domain)
            ) c
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_contracts(TEXT) TO anon, authenticated;
