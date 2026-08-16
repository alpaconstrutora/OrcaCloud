-- ==========================================================================
-- Portal do Investidor — aba SPE (somente leitura, escopo do próprio token)
-- ==========================================================================
-- A tela do gestor (SpeManager) lista TODAS as SPEs da organização e TODOS os
-- sócios de cada uma — inclusive nome e e-mail de outros investidores. Isso não
-- pode ser reaproveitado no acesso por token.
--
-- Esta RPC devolve apenas:
--   • as SPEs em que o investidor DO TOKEN é sócio;
--   • a participação DELE (cotas, %, capital chamado e integralizado);
--   • a contagem de sócios, sem identificar ninguém.
-- Nenhum dado de outro investidor sai daqui.

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_spes(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_org_id UUID;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_org_id := v_tok.org_id;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'spes', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',                   se.id,
                    'name',                 se.name,
                    'cnpj',                 se.cnpj,
                    'capital_social',       se.capital_social,
                    'project_id',           se.project_id,
                    'project_name',         pr.name,
                    -- participação do investidor do token, nunca de outro
                    'quota_count',          sp.quota_count,
                    'ownership_pct',        sp.ownership_pct,
                    'capital_calls_total',  sp.capital_calls_total,
                    'capital_paid',         sp.capital_paid,
                    -- quantos sócios ao todo, sem identificar nenhum
                    'partners_count',       (SELECT COUNT(*) FROM public.spe_partners x WHERE x.spe_entity_id = se.id)
                )
                ORDER BY se.name
             )
             FROM public.spe_partners sp
             JOIN public.spe_entities se ON se.id = sp.spe_entity_id
             LEFT JOIN public.projects pr ON pr.id = se.project_id
             WHERE sp.investor_id = v_inv_id
               AND se.organization_id = v_org_id),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_investor_portal_get_spes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_spes(TEXT) TO anon, authenticated;
