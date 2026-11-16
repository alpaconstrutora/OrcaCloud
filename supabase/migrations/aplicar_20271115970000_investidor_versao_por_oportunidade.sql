-- ==========================================================================
-- Imovib → investidor: a versão é lida pela OPORTUNIDADE, só com o que vai ao investidor
-- ==========================================================================
-- Plano: docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md (revisão das Fases 2–4).
-- Corrige três achados da revisão independente sobre aplicar_20271115960000:
--
-- 1. As listas do relatório iam ao portal como estavam no snapshot: notas e vínculo dos sócios,
--    notas e fonte dos comparáveis, responsável do risco, quem conferiu a due diligence. Agora
--    cada lista é montada só com os campos que o relatório usa (os mesmos de
--    CAMPOS_PARA_O_INVESTIDOR em utils/imovibVersoes.ts).
-- 2. Duas oportunidades publicadas do mesmo estudo: a RPC por estudo devolvia a versão da mais
--    nova. Nova fn_investor_portal_get_versao(token, oportunidade). A antiga,
--    fn_investor_portal_get_study(token, estudo), fica (o app publicado ainda a chama) e passa a
--    delegar para a nova com a oportunidade publicada mais nova — sai quando o app novo estiver no ar.
-- 3. O estudo tem de ser da organização da oportunidade (a RPC antiga conferia; a da versão não).
--    Também no gatilho: com o estudo de outra organização, a mensagem dizia "não é deste estudo".
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: fn_investor_opportunity_versao_valida segue de gatilho, SECURITY INVOKER, EXECUTE revogado
--      de PUBLIC/anon/authenticated. fn_investor_portal_get_versao é SECURITY DEFINER com o token
--      validado dentro (organização do token = da oportunidade = do estudo), REVOKE PUBLIC +
--      GRANT anon/authenticated (leitura do portal por link). fn_investor_portal_get_study idem.
--
-- Reverter: aplicar de novo as funções de aplicar_20271115960000_investidor_versao_publicada.sql;
--   DROP FUNCTION public.fn_investor_portal_get_versao(text, uuid);
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.fn_investor_opportunity_versao_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.imovib_study_id IS NULL THEN
        NEW.imovib_version_id := NULL;
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.imovib_studies s
        WHERE s.id = NEW.imovib_study_id AND s.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'O estudo do Imovib é de outra organização: só se publica estudo da organização da oportunidade.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.imovib_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.imovib_study_versions v
        WHERE v.id = NEW.imovib_version_id AND v.study_id = NEW.imovib_study_id
    ) THEN
        RAISE EXCEPTION 'A versão escolhida não é deste estudo do Imovib.'
            USING ERRCODE = '23514';
    END IF;

    IF COALESCE(NEW.is_published, FALSE) AND NEW.imovib_version_id IS NULL THEN
        RAISE EXCEPTION 'Para publicar uma oportunidade com estudo do Imovib, escolha a versão congelada que o investidor vai ver.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_opportunity_versao_valida() FROM PUBLIC, anon, authenticated;

-- Lista do snapshot só com os campos pedidos (lista ausente ou não-array = vazia).
CREATE OR REPLACE FUNCTION public.fn_investidor_lista_recortada(p_lista jsonb, p_campos text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(
               (SELECT COALESCE(jsonb_object_agg(k, e -> k), '{}'::jsonb) FROM unnest(p_campos) k WHERE e ? k)
               ORDER BY n), '[]'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lista) = 'array' THEN p_lista ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(e, n);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investidor_lista_recortada(jsonb, text[]) FROM PUBLIC, anon, authenticated;

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
           'recommendation_snapshot', 'recommended_by_user_id', 'cenarios', 'relatorio'],
        'cenarios', public.fn_investidor_lista_recortada(v_ver.snapshot -> 'cenarios', ARRAY['id', 'name', 'kind', 'choques', 'sort_order']),
        'relatorio', jsonb_build_object(
            'comparaveis', public.fn_investidor_lista_recortada(v_rel -> 'comparaveis', ARRAY['id', 'name', 'distance_km', 'launch_date', 'total_units', 'sold_units', 'price_sqm']),
            'riscos', public.fn_investidor_lista_recortada(v_rel -> 'riscos', ARRAY['id', 'category', 'description', 'probability', 'impact', 'mitigation', 'status', 'sort_order']),
            'dueDiligence', public.fn_investidor_lista_recortada(v_rel -> 'dueDiligence', ARRAY['id', 'item_key', 'label', 'status', 'notes', 'sort_order']),
            'socios', public.fn_investidor_lista_recortada(v_rel -> 'socios', ARRAY['id', 'name', 'share_percent', 'capital_percent', 'sort_order'])
        ),
        'versao', jsonb_build_object('id', v_ver.id, 'label', v_ver.label, 'created_at', v_ver.created_at),
        'organizacao', jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) TO anon, authenticated;

-- Compatibilidade com o app publicado (chama pelo estudo): a oportunidade publicada mais nova do
-- estudo, na organização do link, pelo mesmo caminho recortado.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_study(p_token text, p_study_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID;
    v_opp_id UUID;
BEGIN
    SELECT org_id INTO v_org_id
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT id INTO v_opp_id
    FROM public.investor_opportunities
    WHERE imovib_study_id = p_study_id AND organization_id = v_org_id AND is_published = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN public.fn_investor_portal_get_versao(p_token, v_opp_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) TO anon, authenticated;
