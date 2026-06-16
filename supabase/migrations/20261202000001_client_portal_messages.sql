-- migration: 20261202000001_client_portal_messages.sql
-- Portal do Cliente — Fase F: Canal de Comunicação
-- Mensagens admin→cliente visíveis no portal (comunicados, alertas de status, vencimento)

CREATE TABLE IF NOT EXISTS public.client_portal_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    sender_name     TEXT NOT NULL DEFAULT 'Equipe',
    type            TEXT NOT NULL DEFAULT 'comunicado'
        CHECK (type IN ('comunicado', 'status_update', 'vencimento', 'sistema')),
    title           TEXT NOT NULL,
    body            TEXT,
    reference_type  TEXT,   -- 'chamado' | 'os' | null
    reference_id    UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpm_org    ON public.client_portal_messages (organization_id);
CREATE INDEX IF NOT EXISTS idx_cpm_client ON public.client_portal_messages (client_id);
CREATE INDEX IF NOT EXISTS idx_cpm_read   ON public.client_portal_messages (client_id, is_read);

ALTER TABLE public.client_portal_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_client_portal_messages" ON public.client_portal_messages;
CREATE POLICY "org_access_client_portal_messages" ON public.client_portal_messages
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = auth.jwt()->>'email'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs anon: validam token e operam mensagens do cliente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_portal_get_messages(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    RETURN json_build_object(
        'valid', TRUE,
        'unread', (
            SELECT COUNT(*) FROM public.client_portal_messages
            WHERE client_id = v_tok.client_id AND is_read = FALSE
        ),
        'data', (
            SELECT json_agg(m ORDER BY m.created_at DESC)
            FROM public.client_portal_messages m
            WHERE m.client_id = v_tok.client_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_get_messages(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_mark_message_read(p_token TEXT, p_message_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('success', FALSE, 'error', 'Token inválido'); END IF;

    UPDATE public.client_portal_messages
    SET is_read = TRUE
    WHERE id = p_message_id AND client_id = v_tok.client_id;

    RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_mark_message_read(UUID, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_portal_mark_all_read(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('success', FALSE); END IF;

    UPDATE public.client_portal_messages
    SET is_read = TRUE
    WHERE client_id = v_tok.client_id AND is_read = FALSE;

    RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_portal_mark_all_read(TEXT) TO anon, authenticated;
