-- ==========================================================================
-- Fix: endurece seguranca dos tokens do Portal do Investidor
-- ==========================================================================
-- Problemas corrigidos:
-- 1) anon podia selecionar investor_portal_tokens e listar tokens ativos.
-- 2) investor_portal_generate_token era SECURITY DEFINER sem validar permissao
--    do usuario nem vinculo entre investidor e organizacao.

DROP POLICY IF EXISTS "investor_tokens_anon_select" ON public.investor_portal_tokens;

CREATE OR REPLACE FUNCTION public.investor_portal_can_manage_tokens(p_org_id uuid)
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

REVOKE EXECUTE ON FUNCTION public.investor_portal_can_manage_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.investor_portal_can_manage_tokens(uuid) TO authenticated;

DROP POLICY IF EXISTS "investor_tokens_auth_all" ON public.investor_portal_tokens;
CREATE POLICY "investor_tokens_auth_all" ON public.investor_portal_tokens
    FOR ALL TO authenticated
    USING (public.investor_portal_can_manage_tokens(org_id))
    WITH CHECK (public.investor_portal_can_manage_tokens(org_id));

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
    IF NOT public.investor_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.investors i
        WHERE i.id = p_investor_id
          AND i.organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'investor_not_found_for_org'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.investor_portal_tokens (org_id, investor_id, token)
    VALUES (p_org_id, p_investor_id, v_token)
    ON CONFLICT (investor_id) DO UPDATE
        SET org_id       = p_org_id,
            token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();

    RETURN v_token;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.investor_portal_generate_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.investor_portal_generate_token(UUID, UUID) TO authenticated;
