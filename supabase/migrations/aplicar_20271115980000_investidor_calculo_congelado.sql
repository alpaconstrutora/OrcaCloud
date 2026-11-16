-- ==========================================================================
-- Imovib → investidor: os números congelados da versão vão ao portal (só a parte do investidor)
-- ==========================================================================
-- Plano: docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 6 (pedido do
-- usuário, 15/11: os números de uma versão publicada nunca mudam).
--
-- A versão passa a guardar no snapshot o RESULTADO do cálculo (`calculo`): `investidor` (capa,
-- seções do relatório sem parecer, indicadores e dados dos gráficos) e `interno` (seções com o
-- parecer). Sem esta migration, `calculo` iria ao portal DENTRO de `study` — inclusive o
-- `interno`. Agora sai de `study` e só `calculo.investidor` vai, em chave própria.
-- Aplicar ANTES do front da Fase 6 (que já grava `calculo` ao congelar).
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: só fn_investor_portal_get_versao muda (mesma assinatura): SECURITY DEFINER com o token
--      validado dentro, REVOKE PUBLIC + GRANT anon/authenticated, como antes.
--
-- Reverter: aplicar de novo a função de aplicar_20271115970000_investidor_versao_por_oportunidade.sql.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_versao(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_org_id UUID;
    v_opp    public.investor_opportunities;
    v_ver    public.imovib_study_versions;
    v_org    public.organizations;
    v_rel    JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    v_org_id := v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = v_org_id
      AND is_published = TRUE;
    IF NOT FOUND OR v_opp.imovib_study_id IS NULL THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    -- O estudo é da organização do link (e da oportunidade).
    IF NOT EXISTS (SELECT 1 FROM public.imovib_studies s WHERE s.id = v_opp.imovib_study_id AND s.organization_id = v_org_id) THEN
        RETURN '{"valid":false,"error":"forbidden"}'::jsonb;
    END IF;

    IF v_opp.imovib_version_id IS NULL THEN
        RETURN '{"valid":false,"error":"sem_versao"}'::jsonb;
    END IF;

    SELECT * INTO v_ver
    FROM public.imovib_study_versions
    WHERE id = v_opp.imovib_version_id AND study_id = v_opp.imovib_study_id;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    SELECT * INTO v_org FROM public.organizations WHERE id = v_org_id;
    v_rel := v_ver.snapshot -> 'relatorio';

    RETURN jsonb_build_object(
        'valid', TRUE,
        -- Parecer, critérios e notas de fonte são internos (CHAVES_INTERNAS_DO_ESTUDO no front);
        -- cenários e listas do relatório saem em chaves próprias, recortadas.
        'study', v_ver.snapshot - ARRAY['premise_notes', 'recommendation', 'recommendation_notes',
           'recommended_by', 'recommended_at', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure',
           'recommendation_snapshot', 'recommended_by_user_id', 'cenarios', 'relatorio', 'calculo'],
        'cenarios', public.fn_investidor_lista_recortada(v_ver.snapshot -> 'cenarios', ARRAY['id', 'name', 'kind', 'choques', 'sort_order']),
        'relatorio', jsonb_build_object(
            'comparaveis', public.fn_investidor_lista_recortada(v_rel -> 'comparaveis', ARRAY['id', 'name', 'distance_km', 'launch_date', 'total_units', 'sold_units', 'price_sqm']),
            'riscos', public.fn_investidor_lista_recortada(v_rel -> 'riscos', ARRAY['id', 'category', 'description', 'probability', 'impact', 'mitigation', 'status', 'sort_order']),
            'dueDiligence', public.fn_investidor_lista_recortada(v_rel -> 'dueDiligence', ARRAY['id', 'item_key', 'label', 'status', 'notes', 'sort_order']),
            'socios', public.fn_investidor_lista_recortada(v_rel -> 'socios', ARRAY['id', 'name', 'share_percent', 'capital_percent', 'sort_order'])
        ),
        -- Fase 6: os números congelados — SÓ a parte do investidor (a edição interna, com parecer, fica no banco).
        'calculo', v_ver.snapshot -> 'calculo' -> 'investidor',
        'versao', jsonb_build_object('id', v_ver.id, 'label', v_ver.label, 'created_at', v_ver.created_at),
        'organizacao', jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) TO anon, authenticated;
