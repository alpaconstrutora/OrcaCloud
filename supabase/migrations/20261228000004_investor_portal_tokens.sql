-- ==========================================================================
-- Migration: investor_portal_tokens — acesso público por token (sem login)
-- Espelha o padrão de broker_portal_tokens (20261224000001)
-- ==========================================================================

-- ── Coluna settings em investors (config de abas + metadados do portal) ─────
ALTER TABLE public.investors
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.investors.settings IS
    'Configurações do portal do investidor. Chave investorPortalTabs: lista de IDs de abas visíveis.';

-- ── Tabela de tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_portal_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investor_id  UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    last_used_at TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (investor_id)  -- um token por investidor; upsert regenera
);

ALTER TABLE public.investor_portal_tokens ENABLE ROW LEVEL SECURITY;

-- anon pode SELECT apenas tokens ativos (necessário para validação na rota pública)
DROP POLICY IF EXISTS "investor_tokens_anon_select" ON public.investor_portal_tokens;
CREATE POLICY "investor_tokens_anon_select" ON public.investor_portal_tokens
    FOR SELECT TO anon
    USING (is_active = TRUE AND expires_at > NOW());

-- membros da org gerenciam tokens da sua org
DROP POLICY IF EXISTS "investor_tokens_auth_all" ON public.investor_portal_tokens;
CREATE POLICY "investor_tokens_auth_all" ON public.investor_portal_tokens
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

CREATE INDEX IF NOT EXISTS investor_portal_tokens_token_idx
    ON public.investor_portal_tokens (token) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS investor_portal_tokens_investor_idx
    ON public.investor_portal_tokens (investor_id);

-- ==========================================================================
-- RPC: gerar / regenerar token (chamado pelo admin autenticado)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.investor_portal_generate_token(
    p_investor_id UUID,
    p_org_id      UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    INSERT INTO public.investor_portal_tokens (org_id, investor_id, token)
    VALUES (p_org_id, p_investor_id, v_token)
    ON CONFLICT (investor_id) DO UPDATE
        SET token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();
    RETURN v_token;
END;
$X$;

GRANT EXECUTE ON FUNCTION public.investor_portal_generate_token(UUID, UUID) TO authenticated;

-- ==========================================================================
-- RPC: validar token e obter dados do investidor (anon, SECURITY DEFINER)
-- Retorna o investidor com settings (inclui investorPortalTabs configuradas).
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.investor_portal_get_data(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok public.investor_portal_tokens;
    v_inv public.investors;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    UPDATE public.investor_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    SELECT * INTO v_inv FROM public.investors WHERE id = v_tok.investor_id;
    IF NOT FOUND THEN
        RETURN '{"valid":false}'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'valid',    TRUE,
        'investor', row_to_json(v_inv)::jsonb,
        'org_id',   v_tok.org_id
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.investor_portal_get_data(TEXT) TO anon, authenticated;
