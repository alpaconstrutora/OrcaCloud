-- ============================================================
-- Portal de Treinamentos — passo 3: ajuda, tour e checklist
-- Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
--
-- O portal novo usa a MESMA central de ajuda dos outros portais externos
-- (aplicar_20271003000050 + aplicar_20271014610000): padrão em código
-- (utils/portalHelpDefaults.ts) e sobrescritas por organização em
-- portal_help_items. O que muda no banco:
--   • CHECK de `portal` nas duas tabelas aceita 'treinamentos';
--   • portal_help_orgs_of resolve as organizações do treinando por
--     academy_portal_users (e-mail do JWT);
--   • portal_help_get_mine e portal_tour_mark aceitam 'treinamentos'.
-- Não há casca por token: o Portal de Treinamentos só entra por e-mail.
--
-- REGRA #7: núcleo com REVOKE de PUBLIC, anon e authenticated; get_mine só
-- authenticated; tour_mark anon+authenticated (os outros portais têm link).
-- ============================================================

SET lock_timeout = '3s';

ALTER TABLE public.portal_help_items DROP CONSTRAINT IF EXISTS portal_help_items_portal_check;
ALTER TABLE public.portal_help_items ADD CONSTRAINT portal_help_items_portal_check
    CHECK (portal IN ('parceiro', 'fornecedor', 'corretor', 'cliente', 'treinamentos'));

ALTER TABLE public.portal_tour_progress DROP CONSTRAINT IF EXISTS portal_tour_progress_portal_check;
ALTER TABLE public.portal_tour_progress ADD CONSTRAINT portal_tour_progress_portal_check
    CHECK (portal IN ('parceiro', 'fornecedor', 'corretor', 'cliente', 'treinamentos'));

CREATE OR REPLACE FUNCTION public.portal_help_orgs_of(p_email TEXT, p_portal TEXT)
 RETURNS UUID[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT coalesce(array_agg(DISTINCT org), '{}') FROM (
        SELECT pw.organization_id AS org
          FROM public.partner_users pu
          JOIN public.partner_workspaces pw ON pw.id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = p_email
           AND pu.is_active = TRUE AND pw.is_active = TRUE AND pw.organization_id IS NOT NULL
        UNION
        SELECT t.org_id
          FROM public.partner_users pu
          JOIN public.partner_portal_tokens t ON t.workspace_id = pu.partner_workspace_id
         WHERE p_portal = 'parceiro' AND lower(pu.email) = p_email AND pu.is_active = TRUE
        UNION
        SELECT bp.organization_id
          FROM public.broker_profiles bp
         WHERE p_portal = 'corretor' AND lower(bp.email) = p_email AND bp.is_active = TRUE
           AND bp.organization_id IS NOT NULL
        UNION
        SELECT s.organization_id
          FROM public.suppliers s
         WHERE p_portal = 'fornecedor' AND lower(s.email) = p_email AND s.organization_id IS NOT NULL
        UNION
        SELECT sh.target_org_id
          FROM public.supplier_org_shares sh
          JOIN public.suppliers s ON s.id = sh.supplier_id
         WHERE p_portal = 'fornecedor' AND lower(s.email) = p_email
        UNION
        SELECT c.organization_id
          FROM public.clients c
         WHERE p_portal = 'cliente' AND lower(c.email) = p_email AND c.organization_id IS NOT NULL
        UNION
        -- Portal de Treinamentos: a identidade é academy_portal_users.
        SELECT u.org_id
          FROM public.academy_portal_users u
         WHERE p_portal = 'treinamentos' AND u.email = p_email AND u.is_active = TRUE
        UNION
        SELECT om.organization_id
          FROM public.organization_members om
         WHERE lower(om.email) = p_email
    ) x WHERE org IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.portal_help_orgs_of(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_help_get_mine(p_portal TEXT, p_org UUID DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_orgs  UUID[];
    v_org   UUID;
BEGIN
    IF v_email = '' OR p_portal NOT IN ('parceiro', 'fornecedor', 'corretor', 'cliente', 'treinamentos') THEN
        RETURN jsonb_build_object('orgs', '[]'::jsonb, 'help', NULL);
    END IF;

    v_orgs := public.portal_help_orgs_of(v_email, p_portal);

    IF p_org IS NOT NULL AND p_org = ANY (v_orgs) THEN
        v_org := p_org;
    ELSIF array_length(v_orgs, 1) = 1 THEN
        v_org := v_orgs[1];
    END IF;

    RETURN jsonb_build_object(
        'orgs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name)
            FROM public.organizations o WHERE o.id = ANY (v_orgs)
        ), '[]'::jsonb),
        'help', CASE WHEN v_org IS NULL THEN NULL ELSE
            public.portal_help_org_json(v_org, p_portal)
            || jsonb_build_object('seen', public.portal_tour_seen_json(v_org, p_portal, v_email)) END
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_help_get_mine(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_help_get_mine(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_tour_mark(
    p_portal TEXT, p_token TEXT, p_org UUID, p_tour_id TEXT, p_status TEXT, p_step INTEGER DEFAULT NULL)
 RETURNS VOID
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org   UUID;
    v_ident TEXT;
    v_kind  TEXT;
BEGIN
    IF p_portal IS NULL OR p_portal NOT IN ('parceiro', 'fornecedor', 'corretor', 'cliente', 'treinamentos')
       OR p_status IS NULL OR p_status NOT IN ('concluido', 'pulado', 'visto')
       OR p_tour_id IS NULL OR p_tour_id !~ '^[a-z0-9:._-]{1,96}$' THEN
        RAISE EXCEPTION 'portal_tour_mark: parâmetros inválidos' USING ERRCODE = '22023';
    END IF;

    IF coalesce(p_token, '') <> '' THEN
        SELECT o_org, o_ident INTO v_org, v_ident FROM public.portal_link_identidade(p_portal, p_token);
        IF v_org IS NULL THEN
            RAISE EXCEPTION 'portal_tour_mark: link inválido ou expirado' USING ERRCODE = '42501';
        END IF;
        v_kind := 'link';
    ELSE
        v_ident := lower(coalesce(auth.jwt() ->> 'email', ''));
        IF v_ident = '' OR p_org IS NULL OR NOT (p_org = ANY (public.portal_help_orgs_of(v_ident, p_portal))) THEN
            RAISE EXCEPTION 'portal_tour_mark: sem acesso a esta organização' USING ERRCODE = '42501';
        END IF;
        v_org := p_org;
        v_kind := 'email';
    END IF;

    INSERT INTO public.portal_tour_progress AS p (organization_id, portal, identity_kind, identity, tour_id, status, step_reached)
    VALUES (v_org, p_portal, v_kind, v_ident, p_tour_id, p_status, p_step)
    ON CONFLICT (organization_id, portal, identity, tour_id) DO UPDATE
       SET status = EXCLUDED.status,
           step_reached = EXCLUDED.step_reached,
           times = p.times + 1,
           updated_at = NOW();
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_tour_mark(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_tour_mark(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER) TO anon, authenticated;
