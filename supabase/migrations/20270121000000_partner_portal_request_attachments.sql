-- ==========================================================================
-- Migration: permite anexos em solicitações criadas via link público
-- (Edge Function partner-portal-upload faz o upload; esta RPC só precisa
-- aceitar os paths resultantes e validar que pertencem ao workspace certo).
-- ==========================================================================

DROP FUNCTION IF EXISTS public.partner_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.partner_portal_create_request(
    p_token TEXT,
    p_title TEXT,
    p_description TEXT,
    p_type TEXT,
    p_priority TEXT,
    p_attachment_paths TEXT[] DEFAULT '{}'::text[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_row public.partner_requests;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    -- Impede referenciar arquivos de outro workspace (o path sempre começa com
    -- partner-uploads/{workspace_id}/, gerado pela Edge Function de upload).
    IF EXISTS (
        SELECT 1 FROM unnest(p_attachment_paths) p
        WHERE p NOT LIKE ('partner-uploads/' || v_ws::text || '/%')
    ) THEN
        RAISE EXCEPTION 'invalid_attachment_path' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.partner_requests (
        partner_workspace_id, title, description, type, priority, status, created_by_email, attachment_paths
    ) VALUES (
        v_ws, p_title, p_description, p_type, p_priority, 'ABERTO', 'link-publico@portal-parceiro', p_attachment_paths
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated;
