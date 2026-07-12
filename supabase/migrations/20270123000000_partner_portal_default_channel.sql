-- ==========================================================================
-- Migration: canal "Geral" automatico no acesso via link do Portal do Parceiro
--
-- A aba Conversas ficava permanentemente vazia -- nunca existiu nenhuma acao
-- de UI (admin ou parceiro) que criasse a primeira linha em
-- partner_conversations. O lado autenticado (partnerService.listConversations)
-- ja foi corrigido para criar um canal "Geral" sob demanda; esta migration
-- espelha a mesma logica na RPC usada pelo acesso via link (sessao anon).
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.partner_portal_get_conversations(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_count INT;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT COUNT(*) INTO v_count FROM public.partner_conversations WHERE partner_workspace_id = v_ws;

    IF v_count = 0 THEN
        INSERT INTO public.partner_conversations (partner_workspace_id, name)
        VALUES (v_ws, 'Geral');
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(c) ORDER BY c.created_at ASC)
            FROM public.partner_conversations c
            WHERE c.partner_workspace_id = v_ws
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_conversations(TEXT) TO anon, authenticated;
