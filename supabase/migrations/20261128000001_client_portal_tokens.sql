-- ============================================================
-- Portal do Cliente: tokens de acesso público por link
-- Espelha portal_tokens (colaboradores) mas vincula a clients
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (client_id)   -- um token por cliente (upsert regenera)
);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_client ON public.client_portal_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_token  ON public.client_portal_tokens(token) WHERE is_active = TRUE;

ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Membros da org gerenciam os tokens
CREATE POLICY "client_portal_tokens_org_access" ON public.client_portal_tokens
    FOR ALL USING (public.is_org_member(org_id));

-- Leitura pública (necessária para validar sem login)
CREATE POLICY "client_portal_tokens_public_select" ON public.client_portal_tokens
    FOR SELECT USING (is_active = TRUE AND expires_at > NOW());

-- ============================================================
-- RPC: validar token e retornar dados do cliente
-- ============================================================

CREATE OR REPLACE FUNCTION public.client_portal_validate_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_tok   public.client_portal_tokens;
    v_cli   public.clients;
BEGIN
    SELECT * INTO v_tok
    FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Token inválido ou expirado');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN json_build_object(
        'valid',      TRUE,
        'client_id',  v_cli.id,
        'org_id',     v_cli.organization_id,
        'name',       v_cli.name,
        'email',      v_cli.email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.client_portal_validate_token(TEXT) TO anon, authenticated;

-- ============================================================
-- RPC: gerar / renovar token para cliente
-- ============================================================

CREATE OR REPLACE FUNCTION public.client_portal_generate_token(
    p_client_id UUID,
    p_org_id    UUID
)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
BEGIN
    v_token := gen_random_uuid()::text;

    INSERT INTO public.client_portal_tokens (org_id, client_id, token)
    VALUES (p_org_id, p_client_id, v_token)
    ON CONFLICT (client_id)
    DO UPDATE SET token = v_token, expires_at = NOW() + INTERVAL '90 days',
                  is_active = TRUE, last_used_at = NULL;

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.client_portal_generate_token(UUID, UUID) TO authenticated;

-- ============================================================
-- RPC: carregar dados completos do cliente para o portal público
-- Retorna client JSON + project settings JSON (sem exigir auth)
-- ============================================================

CREATE OR REPLACE FUNCTION public.client_portal_get_data(p_token TEXT)
RETURNS JSON AS $$
DECLARE
    v_tok     public.client_portal_tokens;
    v_cli     public.clients;
    v_proj    RECORD;
BEGIN
    SELECT * INTO v_tok
    FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN json_build_object('valid', FALSE, 'error', 'Token inválido ou expirado');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = v_tok.client_id;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- Tenta carregar o projeto de obra vinculado ao cliente
    SELECT p.id, p.name, p.settings INTO v_proj
    FROM public.projects p
    WHERE p.settings->>'clientId' = v_cli.id::text
      AND p.settings->>'classification' = 'OBRA'
    LIMIT 1;

    RETURN json_build_object(
        'valid',      TRUE,
        'client',     row_to_json(v_cli),
        'project',    CASE WHEN v_proj.id IS NOT NULL
                           THEN json_build_object('id', v_proj.id, 'name', v_proj.name, 'settings', v_proj.settings)
                           ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.client_portal_get_data(TEXT) TO anon, authenticated;
