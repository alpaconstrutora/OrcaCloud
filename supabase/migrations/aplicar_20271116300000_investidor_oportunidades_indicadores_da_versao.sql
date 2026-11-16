-- ==========================================================================
-- Portal do Investidor › Oportunidades: VGV, ROI e TIR da versão publicada
-- ==========================================================================
-- Pedido do usuário (16/11/2026), olhando a lista do portal do Tiago com VGV, ROI e TIR em "—":
-- "VGV, ROI, TIR e Ticket mínimo não são gerados no imovib?" → "sim" (fazer a lista ler a versão).
--
-- A lista lia só as colunas digitadas à mão na oportunidade. A versão congelada do Imovib já guarda
-- os indicadores em snapshot.calculo.investidor.indicadores (migration 20271115980000). Agora cada
-- oportunidade da lista leva também `indicadores_da_versao` = esse objeto (null sem versão), e a
-- tela calcula VGV/ROI/TIR dele (utils/oportunidadeNumerosDaVersao.ts). Só a parte `investidor` do
-- cálculo sai — a mesma que fn_investor_portal_get_versao já entrega; nada interno.
--
-- Única mudança na função: o LEFT JOIN da versão e o campo a mais. Token, organizações do investidor
-- (fn_orgs_do_investidor, migration 20271116200000) e filtro de publicada continuam iguais.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: segue SECURITY DEFINER com o token validado dentro, REVOKE PUBLIC + GRANT anon/authenticated
--      (leitura do portal por link). A versão lida é a da oportunidade publicada que o token já
--      autoriza; o gatilho de 20271115970000 garante que ela é do mesmo estudo da oportunidade.
--
-- Reverter: aplicar de novo a definição de fn_investor_portal_get_opportunities em
--   aplicar_20271116200000_investidor_oportunidades_das_orgs.sql.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_opportunities(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_orgs UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_orgs := public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',         TRUE,
        'opportunities', COALESCE(
            (SELECT jsonb_agg(
                        to_jsonb(o) || jsonb_build_object(
                            'indicadores_da_versao', v.snapshot->'calculo'->'investidor'->'indicadores')
                        ORDER BY o.created_at DESC)
             FROM public.investor_opportunities o
             LEFT JOIN public.imovib_study_versions v ON v.id = o.imovib_version_id
             WHERE o.organization_id = ANY(v_orgs)
               AND o.is_published = TRUE),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) TO anon, authenticated;
