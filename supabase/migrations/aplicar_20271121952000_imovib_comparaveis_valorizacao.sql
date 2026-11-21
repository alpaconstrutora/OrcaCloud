-- ==========================================================================
-- Imovib: comparáveis com valorização (substituem os concorrentes da Oportunidade)
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 1.3.
--
-- Os concorrentes da Oportunidade (investor_opportunity_competitors: preço/m², velocidade
-- de vendas, valorização, distância) passam a ser os comparáveis do estudo. Velocidade sai
-- de total/vendidas/lançamento (utils/imovibMercado.ts, vsoDoComparavel); distância já
-- existe; faltava a valorização ao ano. A tabela dos concorrentes sai na Fase 2 (item 2.7).
--
-- fn_investor_portal_get_versao: recriada IGUAL à de aplicar_20271116200000, só com
-- 'appreciation_pct' no recorte dos comparáveis — o mesmo de CAMPOS_PARA_O_INVESTIDOR
-- (utils/imovibVersoes.ts; __tests__/investorPortalEstudo.test.ts compara os dois).
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada.
--   P2: a função recriada mantém SECURITY DEFINER + search_path fixo, REVOKE de PUBLIC e
--       GRANT a anon/authenticated (é a leitura do link do investidor; o token é validado
--       dentro, e só sai oportunidade publicada das organizações do investidor).
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: reaplicar a função de aplicar_20271116200000 e
--   ALTER TABLE imovib_market_comparables DROP COLUMN appreciation_pct;

BEGIN;

ALTER TABLE public.imovib_market_comparables
    ADD COLUMN IF NOT EXISTS appreciation_pct numeric;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_versao(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_orgs   UUID[];
    v_opp    public.investor_opportunities;
    v_ver    public.imovib_study_versions;
    v_org    public.organizations;
    v_rel    JSONB;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    -- As organizações do investidor (a dele + as compartilhadas, se "Disponível em todas").
    v_orgs := public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = ANY(v_orgs)
      AND is_published = TRUE;
    IF NOT FOUND OR v_opp.imovib_study_id IS NULL THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    -- O estudo é da organização da oportunidade.
    IF NOT EXISTS (SELECT 1 FROM public.imovib_studies s WHERE s.id = v_opp.imovib_study_id AND s.organization_id = v_opp.organization_id) THEN
        RETURN '{"valid":false,"error":"forbidden"}'::jsonb;
    END IF;

    IF v_opp.imovib_version_id IS NULL THEN
        RETURN '{"valid":false,"error":"sem_versao"}'::jsonb;
    END IF;

    SELECT * INTO v_ver
    FROM public.imovib_study_versions
    WHERE id = v_opp.imovib_version_id AND study_id = v_opp.imovib_study_id;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    SELECT * INTO v_org FROM public.organizations WHERE id = v_opp.organization_id;
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
            'comparaveis', public.fn_investidor_lista_recortada(v_rel -> 'comparaveis', ARRAY['id', 'name', 'distance_km', 'launch_date', 'total_units', 'sold_units', 'price_sqm', 'appreciation_pct']),
            'riscos', public.fn_investidor_lista_recortada(v_rel -> 'riscos', ARRAY['id', 'category', 'description', 'probability', 'impact', 'mitigation', 'status', 'sort_order']),
            'dueDiligence', public.fn_investidor_lista_recortada(v_rel -> 'dueDiligence', ARRAY['id', 'item_key', 'label', 'status', 'notes', 'sort_order']),
            'socios', public.fn_investidor_lista_recortada(v_rel -> 'socios', ARRAY['id', 'name', 'share_percent', 'capital_percent', 'sort_order'])
        ),
        -- Os números congelados: SÓ a parte do investidor (a edição interna, com parecer, fica no banco).
        'calculo', v_ver.snapshot -> 'calculo' -> 'investidor',
        'versao', jsonb_build_object('id', v_ver.id, 'label', v_ver.label, 'created_at', v_ver.created_at),
        'organizacao', jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) TO anon, authenticated;

COMMIT;
