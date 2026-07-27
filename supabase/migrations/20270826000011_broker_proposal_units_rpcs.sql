-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs do Portal do Corretor cientes da CESTA de unidades
-- (complemento de 20270826000010_broker_proposal_units.sql)
--
-- As duas RPCs abaixo são os únicos caminhos por onde uma proposta chega ao
-- corretor/comprador SEM sessão autenticada (link público). Sem a chave `units`
-- aqui, a página pública e o PDF continuariam mostrando só a unidade principal
-- de uma cesta de 3.
--
-- Não mexe em fn_validate_sales_simulation nem fn_broker_portal_get_units: a
-- cesta tem UM desconto e UM fluxo, então a validação de política segue
-- recebendo o payload consolidado, exatamente como antes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. fn_proposal_public — proposta pelo token do link público
--
-- `property_name` (join singular com a unidade principal) é PRESERVADO: quem
-- já lê esse campo continua funcionando. A novidade é `units`, ordenada por
-- sort_order, com o nome, o preço de tabela e a cota de cada unidade.
-- Propostas legadas devolvem `units` com um único item (o backfill garante).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_proposal_public(p_token UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT row_to_json(t) FROM (
        SELECT
            pr.id,
            pr.version,
            pr.status,
            pr.buyer_name,
            pr.unit_price,
            pr.discount_pct,
            pr.total_value,
            pr.down_payment,
            pr.monthly_installments,
            pr.monthly_value,
            pr.balloon_value,
            pr.financing_value,
            pr.payment_plan,
            pr.notes,
            pr.created_at,
            pr.updated_at,
            cp.name AS property_name,
            o.name  AS organization_name,
            COALESCE((
                SELECT json_agg(u ORDER BY u.sort_order, u.unit_name)
                FROM (
                    SELECT ucp.name       AS unit_name,
                           pu.property_id,
                           pu.unit_price,
                           pu.allocated_value,
                           pu.is_primary,
                           pu.sort_order
                    FROM public.broker_portal_proposal_units pu
                    LEFT JOIN public.commercial_properties ucp ON ucp.id = pu.property_id
                    WHERE pu.proposal_id = pr.id
                ) u
            ), '[]'::json) AS units
        FROM public.broker_portal_proposals pr
        LEFT JOIN public.commercial_properties cp ON cp.id = pr.property_id
        LEFT JOIN public.organizations o          ON o.id = pr.organization_id
        WHERE pr.share_token = p_token
        LIMIT 1
    ) t;
$$;

REVOKE ALL ON FUNCTION public.fn_proposal_public(UUID) FROM PUBLIC;
-- Link público: anon PRECISA executar (é o ponto). O gate é o token secreto (uuid
-- v4, ~122 bits): sem o token não há linha. A função nunca lista, só resolve 1.
GRANT EXECUTE ON FUNCTION public.fn_proposal_public(UUID) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. fn_broker_portal_get_proposals — "Minhas propostas" no link do corretor
--
-- Devolvia row_to_json(p) cru. Agora mescla a chave `units` no mesmo objeto,
-- para a lista do portal poder rotular "Unidade 101 +2".
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_proposals(p_token TEXT)
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
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT * INTO v_bp FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid',     TRUE,
        'proposals', COALESCE(
            (SELECT jsonb_agg(
                        to_jsonb(p) || jsonb_build_object(
                            'units', COALESCE((
                                SELECT jsonb_agg(
                                           jsonb_build_object(
                                               'unit_name',       ucp.name,
                                               'property_id',     pu.property_id,
                                               'unit_price',      pu.unit_price,
                                               'allocated_value', pu.allocated_value,
                                               'is_primary',      pu.is_primary,
                                               'sort_order',      pu.sort_order
                                           )
                                           ORDER BY pu.sort_order, ucp.name
                                       )
                                FROM public.broker_portal_proposal_units pu
                                LEFT JOIN public.commercial_properties ucp ON ucp.id = pu.property_id
                                WHERE pu.proposal_id = p.id
                            ), '[]'::jsonb)
                        )
                    )
             FROM public.broker_portal_proposals p
             WHERE p.organization_id = v_tok.org_id
               AND p.broker_email = v_bp.email),
            '[]'::jsonb
        )
    );
END;
$X$;

REVOKE ALL ON FUNCTION public.fn_broker_portal_get_proposals(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_broker_portal_get_proposals(TEXT) TO anon, authenticated;
