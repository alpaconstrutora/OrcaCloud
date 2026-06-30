-- ==========================================================================
-- Fix: Portal do Investidor - summary deve usar participacoes relacionais
-- ==========================================================================
-- Antes, fn_investor_portal_get_summary retornava projects apenas por
-- projects.investor_id. Isso deixava a carteira vazia quando o investidor
-- estava vinculado via investor_participations, que e a fonte relacional atual.

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_summary(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok      public.investor_portal_tokens;
    v_inv_id   UUID;
    v_org_id   UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'participations', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',               ip.id,
                    'project_id',       ip.project_id,
                    'project_name',     p.name,
                    'ownership_pct',    ip.ownership_pct,
                    'committed_amount', ip.committed_amount,
                    'quota_count',      ip.quota_count
                )
                ORDER BY p.name
             )
             FROM public.investor_participations ip
             JOIN public.projects p ON p.id = ip.project_id
             WHERE ip.investor_id = v_inv_id
               AND ip.organization_id = v_org_id
               AND p.organization_id = v_org_id),
            '[]'::jsonb
        ),
        'contributions', COALESCE(
            (SELECT jsonb_agg(row_to_json(ic) ORDER BY ic.created_at DESC)
             FROM public.investor_contributions ic
             WHERE ic.investor_id = v_inv_id
               AND ic.organization_id = v_org_id),
            '[]'::jsonb
        ),
        'projects', COALESCE(
            (WITH project_ids AS (
                SELECT ip.project_id
                FROM public.investor_participations ip
                WHERE ip.investor_id = v_inv_id
                  AND ip.organization_id = v_org_id

                UNION

                SELECT pr_legacy.id AS project_id
                FROM public.projects pr_legacy
                WHERE pr_legacy.investor_id = v_inv_id
                  AND pr_legacy.organization_id = v_org_id
            )
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id',              pr.id,
                    'organization_id', pr.organization_id,
                    'name',            pr.name,
                    'investor_id',     pr.investor_id,
                    'settings',        pr.settings
                )
                ORDER BY pr.name
             )
             FROM public.projects pr
             JOIN project_ids pi ON pi.project_id = pr.id
             WHERE pr.organization_id = v_org_id
               AND pr.settings->>'classification' = 'OBRA'),
            '[]'::jsonb
        )
    );
END;
$X$;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_summary(TEXT) TO anon, authenticated;
