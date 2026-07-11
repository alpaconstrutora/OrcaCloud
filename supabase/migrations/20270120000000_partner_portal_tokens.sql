-- ==========================================================================
-- Migration: partner_portal_tokens — acesso ao Portal do Parceiro via link
-- (sem login por senha), espelhando o padrão JÁ CORRIGIDO usado no Portal
-- do Investidor (20261228000004 + 20261230000003) -- não o padrão original
-- do Portal do Cliente, que tem uma policy de SELECT anônima na própria
-- tabela de tokens permitindo enumerar tokens ativos.
-- ==========================================================================

-- ── Tabela de tokens (1 link por workspace de parceiro) ──────────────────
CREATE TABLE IF NOT EXISTS public.partner_portal_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id)
);

ALTER TABLE public.partner_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS partner_portal_tokens_token_idx
    ON public.partner_portal_tokens (token) WHERE is_active = TRUE;

-- Sem policy de SELECT para anon: toda leitura via token passa pelas RPCs
-- SECURITY DEFINER abaixo, nunca por select direto na tabela.

CREATE OR REPLACE FUNCTION public.partner_portal_can_manage_tokens(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = p_org_id
          AND (
              om.user_id = auth.uid()
              OR lower(om.email) = lower(auth.jwt()->>'email')
          )
          AND om.role IN ('owner', 'admin')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_can_manage_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_can_manage_tokens(uuid) TO authenticated;

DROP POLICY IF EXISTS "partner_tokens_auth_all" ON public.partner_portal_tokens;
CREATE POLICY "partner_tokens_auth_all" ON public.partner_portal_tokens
    FOR ALL TO authenticated
    USING (public.partner_portal_can_manage_tokens(org_id))
    WITH CHECK (public.partner_portal_can_manage_tokens(org_id));

-- ==========================================================================
-- RPC: gerar/regenerar token (admin/owner autenticado da org)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_generate_token(
    p_workspace_id UUID,
    p_org_id       UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.partner_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.partner_workspaces pw
        WHERE pw.id = p_workspace_id AND pw.organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'workspace_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.partner_portal_tokens (org_id, workspace_id, token)
    VALUES (p_org_id, p_workspace_id, v_token)
    ON CONFLICT (workspace_id) DO UPDATE
        SET org_id       = p_org_id,
            token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();

    RETURN v_token;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_generate_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_generate_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: validar token e revogar (admin, autenticado)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_revoke_token(p_workspace_id UUID, p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
BEGIN
    IF NOT public.partner_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    UPDATE public.partner_portal_tokens
    SET is_active = FALSE
    WHERE workspace_id = p_workspace_id AND org_id = p_org_id;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_revoke_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_revoke_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: bootstrap dos dados do workspace via token (anon)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.partner_portal_tokens;
    v_ws  RECORD;
BEGIN
    SELECT * INTO v_tok FROM public.partner_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT pw.*, s.name AS supplier_name INTO v_ws
    FROM public.partner_workspaces pw
    JOIN public.suppliers s ON s.id = pw.supplier_id
    WHERE pw.id = v_tok.workspace_id;

    IF NOT FOUND OR NOT v_ws.is_active THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    UPDATE public.partner_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'org_id', v_tok.org_id,
        'workspace', jsonb_build_object(
            'id', v_ws.id,
            'organization_id', v_ws.organization_id,
            'supplier_id', v_ws.supplier_id,
            'supplier_name', v_ws.supplier_name,
            'is_active', v_ws.is_active
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_data(TEXT) TO anon, authenticated;

-- Helper interno reaproveitado pelas RPCs abaixo: workspace_id se o token for válido, senão NULL
CREATE OR REPLACE FUNCTION public.partner_portal_workspace_from_token(p_token TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT workspace_id FROM public.partner_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
$$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_workspace_from_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_workspace_from_token(TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: documentos compartilhados via token (mesma desambiguação de FK já
-- corrigida em partnerService.listSharedDocuments)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_shared_documents(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(t) ORDER BY t.shared_at DESC)
            FROM (
                SELECT
                    psd.id, psd.partner_workspace_id, psd.document_id, psd.shared_by, psd.shared_at,
                    jsonb_build_object(
                        'id', d.id, 'nome', d.nome, 'descricao', d.descricao, 'categoria', d.categoria,
                        'tipo_documento', d.tipo_documento, 'status', d.status,
                        'active_version', jsonb_build_object(
                            'id', v.id, 'storage_path', v.storage_path,
                            'mime_type', v.mime_type, 'tamanho', v.tamanho, 'version_number', v.version_number
                        )
                    ) AS document
                FROM public.partner_shared_documents psd
                JOIN public.opura_documents d ON d.id = psd.document_id
                LEFT JOIN public.opura_document_versions v ON v.id = d.active_version_id
                WHERE psd.partner_workspace_id = v_ws
            ) t
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_shared_documents(TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: contratos do fornecedor via token
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_contracts(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_supplier UUID;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT supplier_id INTO v_supplier FROM public.partner_workspaces WHERE id = v_ws;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC)
            FROM public.contracts c
            WHERE c.supplier_id = v_supplier
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_contracts(TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: solicitações — listar e criar via token (texto apenas, sem anexo:
-- upload de arquivo continua exclusivo do fluxo autenticado com convite)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_requests(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
            FROM public.partner_requests r
            WHERE r.partner_workspace_id = v_ws
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_requests(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_portal_create_request(
    p_token TEXT,
    p_title TEXT,
    p_description TEXT,
    p_type TEXT,
    p_priority TEXT
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

    INSERT INTO public.partner_requests (
        partner_workspace_id, title, description, type, priority, status, created_by_email
    ) VALUES (
        v_ws, p_title, p_description, p_type, p_priority, 'ABERTO', 'link-publico@portal-parceiro'
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_create_request(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ==========================================================================
-- RPC: chat — conversas, mensagens e envio via token
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.partner_portal_get_conversations(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

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

CREATE OR REPLACE FUNCTION public.partner_portal_get_messages(p_token TEXT, p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.partner_conversations
        WHERE id = p_conversation_id AND partner_workspace_id = v_ws
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'data', COALESCE((
            SELECT jsonb_agg(row_to_json(m) ORDER BY m.created_at ASC)
            FROM public.partner_messages m
            WHERE m.conversation_id = p_conversation_id
        ), '[]'::jsonb)
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_get_messages(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_portal_send_message(
    p_token TEXT,
    p_conversation_id UUID,
    p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_ws UUID := public.partner_portal_workspace_from_token(p_token);
    v_supplier_name TEXT;
    v_row public.partner_messages;
BEGIN
    IF v_ws IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.partner_conversations
        WHERE id = p_conversation_id AND partner_workspace_id = v_ws
    ) THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    SELECT s.name INTO v_supplier_name
    FROM public.partner_workspaces pw JOIN public.suppliers s ON s.id = pw.supplier_id
    WHERE pw.id = v_ws;

    INSERT INTO public.partner_messages (
        conversation_id, sender_email, sender_name, sender_type, message, attachments
    ) VALUES (
        p_conversation_id, 'link-publico@portal-parceiro', COALESCE(v_supplier_name, 'Parceiro'),
        'EXTERNAL', p_message, '{}'::text[]
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('valid', TRUE, 'data', row_to_json(v_row));
END;
$X$;

GRANT EXECUTE ON FUNCTION public.partner_portal_send_message(TEXT, UUID, TEXT) TO anon, authenticated;

-- ==========================================================================
-- Fix adjacente: partner_messages_select/insert estavam liberadas para
-- QUALQUER usuário authenticated do sistema (sem checar organização nem
-- vínculo com o workspace) -- achado ao construir o acesso via token.
-- ==========================================================================
DROP POLICY IF EXISTS "partner_messages_select" ON public.partner_messages;
CREATE POLICY "partner_messages_select" ON public.partner_messages
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT c.id FROM public.partner_conversations c
            JOIN public.partner_workspaces pw ON pw.id = c.partner_workspace_id
            WHERE public.is_org_member(pw.organization_id)
               OR pw.id IN (
                   SELECT partner_workspace_id FROM public.partner_users
                   WHERE email = auth.jwt() ->> 'email' AND is_active = TRUE
               )
        )
    );

DROP POLICY IF EXISTS "partner_messages_insert" ON public.partner_messages;
CREATE POLICY "partner_messages_insert" ON public.partner_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        conversation_id IN (
            SELECT c.id FROM public.partner_conversations c
            JOIN public.partner_workspaces pw ON pw.id = c.partner_workspace_id
            WHERE public.is_org_member(pw.organization_id)
               OR pw.id IN (
                   SELECT partner_workspace_id FROM public.partner_users
                   WHERE email = auth.jwt() ->> 'email' AND is_active = TRUE
               )
        )
    );
