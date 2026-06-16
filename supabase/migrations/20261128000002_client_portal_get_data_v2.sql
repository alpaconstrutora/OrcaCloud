-- Atualiza client_portal_get_data para buscar clientPortalTabs
-- mesmo quando o projeto não está vinculado ao cliente

CREATE OR REPLACE FUNCTION public.client_portal_get_data(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_tok     public.client_portal_tokens;
    v_cli     public.clients;
    v_proj    RECORD;
    v_tabs    JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Token inválido ou expirado');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- 1ª tentativa: projeto diretamente vinculado ao cliente
    SELECT p.id, p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_cli.id::text
    LIMIT 1;

    -- Extrai clientPortalTabs do projeto do cliente (se encontrado e configurado)
    IF v_proj.id IS NOT NULL AND (v_proj.settings ? 'clientPortalTabs') THEN
        v_tabs := v_proj.settings->'clientPortalTabs';
    ELSE
        -- Fallback: qualquer projeto da org que tenha clientPortalTabs configurado
        SELECT p.settings->'clientPortalTabs' INTO v_tabs
        FROM public.projects p
        WHERE p.settings->>'organizationId' = v_tok.org_id::text
          AND p.settings ? 'clientPortalTabs'
          AND jsonb_array_length(p.settings->'clientPortalTabs') > 0
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    RETURN json_build_object(
        'valid',       TRUE,
        'client',      row_to_json(v_cli),
        'project',     CASE WHEN v_proj.id IS NOT NULL
                            THEN json_build_object('id', v_proj.id, 'name', v_proj.name, 'settings', v_proj.settings)
                            ELSE NULL END,
        'portal_tabs', v_tabs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.client_portal_get_data(TEXT) TO anon, authenticated;
