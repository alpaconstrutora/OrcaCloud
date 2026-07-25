-- ============================================================
-- Fix: Configurador de abas do Portal do Cliente não refletia
--      na visão do cliente (link público).
--
-- Causa: o app grava `clientPortalTabs` no projeto OBRA vinculado
-- ao cliente (settings.clientId + classification=OBRA). Mas esta
-- RPC selecionava o projeto com `... clientId = cliente LIMIT 1`,
-- SEM ORDER BY e SEM preferir OBRA — quando o cliente tinha mais de
-- um projeto com clientId, o LIMIT 1 podia devolver um projeto
-- diferente daquele em que o admin escreveu, e o fallback pegava a
-- config de "qualquer projeto da org" (podendo ser de outro cliente
-- ou uma versão antiga).
--
-- Correção: escolher deterministicamente o MESMO projeto que o app
-- escreve — priorizando (1) quem tem `clientPortalTabs`, (2) OBRA,
-- (3) mais recente. Assim leitura e escrita convergem no mesmo lugar.
-- ============================================================

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

    -- Projeto vinculado ao cliente — seleção DETERMINÍSTICA, alinhada
    -- com a escrita do app (projeto OBRA com clientId). Prioriza:
    --   1. quem já tem clientPortalTabs configurado (é onde o app grava)
    --   2. classificação OBRA (o app grava no .find(isObra))
    --   3. atualização mais recente
    SELECT p.id, p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_cli.id::text
    ORDER BY
        (p.settings ? 'clientPortalTabs') DESC,
        (UPPER(COALESCE(p.settings->>'classification', '')) = 'OBRA') DESC,
        p.updated_at DESC NULLS LAST
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
