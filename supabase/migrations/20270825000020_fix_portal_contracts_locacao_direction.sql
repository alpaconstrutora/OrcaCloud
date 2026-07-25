-- ─────────────────────────────────────────────────────────────────────────────
-- Portal do Cliente — contratos de LOCAÇÃO não apareciam
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexto: fn_portal_get_contracts (20261228000019) filtrava
-- `direction = 'OUTGOING'` como proxy de "contrato emitido ao cliente".
-- Em 20270815000001 `direction` passou a ser a direção FINANCEIRA e locação
-- virou INCOMING (aluguel é receita do locador). A RPC nunca foi revisitada:
-- todo contrato CL-* ficava invisível no portal, apesar de Ativo e com
-- domain='LOCACAO' — a UI de Gerenciar Negociação prometia a exposição
-- (DealModal.tsx) e o backend não entregava.
--
-- Correção:
--   1) O corte de "contrato do cliente" é o `domain`, não o `direction`.
--   2) A categoria do cliente virou catálogo gerenciável (client_categories),
--      então a comparação por string exata ('Locação') era frágil → ILIKE.
--      Categoria não reconhecida ⇒ v_domain NULL ⇒ não restringe domínio.
--
-- Idempotente (CREATE OR REPLACE). Aplicar MANUALMENTE no Supabase.
-- APLICADA em 2026-07-25.

CREATE OR REPLACE FUNCTION public.fn_portal_get_contracts(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_tok      public.client_portal_tokens;
    v_category TEXT;
    v_domain   TEXT;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- Domínio de contrato derivado da categoria do cliente (catálogo editável).
    SELECT category INTO v_category FROM public.clients WHERE id = v_tok.client_id;
    v_domain := CASE
        WHEN v_category ILIKE 'venda%'  THEN 'VENDAS'
        WHEN v_category ILIKE 'loca%'   THEN 'LOCACAO'
        WHEN v_category ILIKE 'servi%'  THEN 'SERVICOS'
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
                  -- NÃO usar `direction` aqui: é direção financeira
                  -- (LOCACAO=INCOMING desde 20270815000001), não "quem emitiu".
                  AND domain IN ('VENDAS', 'LOCACAO', 'SERVICOS')
                  AND status <> 'Rascunho'
                  AND (v_domain IS NULL OR domain = v_domain)
            ) c
        )
    );
END;
$$;

-- RPC nova/substituída: revogar PUBLIC antes de conceder (GRANT to authenticated
-- sozinho não bloqueia anon). O portal é acessado por token anônimo.
REVOKE ALL ON FUNCTION public.fn_portal_get_contracts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_portal_get_contracts(TEXT) TO anon, authenticated;
