-- ==========================================================================
-- Migration: broker_portal_tokens — acesso público por token (sem login)
-- Espelha o padrão de client_portal_tokens (20261128000001)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.broker_portal_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    broker_id    UUID NOT NULL REFERENCES public.broker_profiles(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (broker_id)  -- um token por corretor; upsert regenera
);

ALTER TABLE public.broker_portal_tokens ENABLE ROW LEVEL SECURITY;

-- anon pode SELECT apenas tokens ativos (necessário para validação na rota pública)
CREATE POLICY "broker_tokens_anon_select" ON public.broker_portal_tokens
    FOR SELECT TO anon
    USING (is_active = TRUE AND expires_at > NOW());

-- membros da org gerenciam tokens da sua org
CREATE POLICY "broker_tokens_auth_all" ON public.broker_portal_tokens
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS broker_portal_tokens_token_idx
    ON public.broker_portal_tokens (token) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS broker_portal_tokens_broker_idx
    ON public.broker_portal_tokens (broker_id);

-- ==========================================================================
-- RPC: gerar / regenerar token (chamado pelo admin autenticado)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.broker_portal_generate_token(
    p_broker_id UUID,
    p_org_id    UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    INSERT INTO public.broker_portal_tokens (org_id, broker_id, token)
    VALUES (p_org_id, p_broker_id, v_token)
    ON CONFLICT (broker_id) DO UPDATE
        SET token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();
    RETURN v_token;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.broker_portal_generate_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: validar token e obter dados do corretor (anon, SECURITY DEFINER)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.broker_portal_get_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.broker_portal_tokens;
    v_bp  public.broker_profiles;
BEGIN
    SELECT * INTO v_tok
    FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    UPDATE public.broker_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid',  TRUE,
        'broker', row_to_json(v_bp)::jsonb,
        'org_id', v_tok.org_id
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.broker_portal_get_data(TEXT) TO anon, authenticated;
