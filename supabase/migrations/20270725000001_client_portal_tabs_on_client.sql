-- ============================================================
-- Fix definitivo: Configurador de abas do Portal do Cliente não
--   persistia nem refletia no link do cliente.
--
-- Causa raiz: a config `clientPortalTabs` era gravada/lida num projeto
-- OBRA vinculado ao cliente por `settings.clientId` — "ponte manual"
-- que frequentemente NÃO existe. Sem ela, o admin gravava no projeto
-- errado (não persistia) e a RPC não achava (não refletia).
--
-- Correção: a config passa a viver no próprio cliente
-- (`clients.portal_tabs`), chave canônica que sempre existe. A RPC lê
-- de lá como fonte primária, com fallback ao legado (projeto vinculado
-- e, por fim, qualquer projeto da org) para clientes já configurados
-- antes desta migration.
-- ============================================================

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS portal_tabs JSONB;

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

    -- Projeto vinculado ao cliente (para os demais dados do portal) —
    -- seleção determinística; ainda serve de fallback do legado de abas.
    SELECT p.id, p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_cli.id::text
    ORDER BY
        (p.settings ? 'clientPortalTabs') DESC,
        (UPPER(COALESCE(p.settings->>'classification', '')) = 'OBRA') DESC,
        p.updated_at DESC NULLS LAST
    LIMIT 1;

    -- 1º) Fonte canônica: coluna do próprio cliente
    IF v_cli.portal_tabs IS NOT NULL AND jsonb_typeof(v_cli.portal_tabs) = 'array' THEN
        v_tabs := v_cli.portal_tabs;
    -- 2º) Legado: clientPortalTabs no projeto vinculado
    ELSIF v_proj.id IS NOT NULL AND (v_proj.settings ? 'clientPortalTabs') THEN
        v_tabs := v_proj.settings->'clientPortalTabs';
    ELSE
        -- 3º) Legado: qualquer projeto da org com clientPortalTabs configurado
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
