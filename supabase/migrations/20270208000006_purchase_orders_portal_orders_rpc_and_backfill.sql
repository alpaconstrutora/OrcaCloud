-- ============================================================
-- Migration: 20270208000006_purchase_orders_portal_orders_rpc_and_backfill.sql
-- Parte 1/2 do fix do purchase_orders (ver project_rls_authenticated_layer_gap).
-- ADITIVA e SEGURA de aplicar a qualquer momento (não liga RLS ainda).
--
--   (a) Backfill dos 6 POs com organization_id NULO — deriva do projeto
--       (project_id sempre presente). Necessário para qualquer org-scoping.
--   (b) RPC fn_portal_get_orders(token, project_id) SECURITY DEFINER — permite
--       o Portal do Cliente (token/anon) ler o realizado por PO SEM depender de
--       policy de tabela. Pré-requisito para ligar RLS (parte 2) sem quebrar o
--       cálculo de progresso financeiro do portal. Mesmo padrão de
--       fn_portal_get_contracts. Autoriza que o project_id pertence ao
--       cliente/org do token (projects.settings->>'clientId').
-- ============================================================

-- (a) Backfill organization_id nulo a partir do projeto
UPDATE public.purchase_orders po
SET organization_id = p.organization_id
FROM public.projects p
WHERE po.project_id = p.id
  AND po.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

-- (b) RPC por token + projeto, retorna só o necessário p/ o progresso (status, items)
CREATE OR REPLACE FUNCTION public.fn_portal_get_orders(p_token TEXT, p_project_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    -- Autorização: o projeto pedido tem que pertencer ao cliente/org do token.
    IF NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id
          AND p.organization_id = v_tok.org_id
          AND p.settings->>'clientId' = v_tok.client_id::text
    ) THEN
        RETURN json_build_object('valid', TRUE, 'data', '[]'::json);
    END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN json_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT json_agg(json_build_object('status', o.status, 'items', o.items))
            FROM public.purchase_orders o
            WHERE o.project_id = p_project_id
        ), '[]'::json)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_orders(TEXT, UUID) TO anon, authenticated;
