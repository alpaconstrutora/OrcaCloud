-- ==========================================================================
-- Investidor "Disponível em todas as organizações": oportunidades de todas elas
-- ==========================================================================
-- Plano: docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 7 (16/11/2026).
-- Pedido do usuário: "em minha organização > investidor : existe abaixo de organizações um checkbox
-- chamado Disponível em todas as organizações. Então todas as oportunidades de todas as
-- organizações deveriam estar disponíveis para o investidor".
--
-- Resumo, marcos, SPEs e espelho já liam fn_orgs_do_investidor (PR #316); as oportunidades liam só
-- a organização do LINK. Agora, nas quatro funções da oportunidade:
--   fn_investor_portal_get_opportunities  lista as publicadas de qualquer organização do investidor;
--   fn_investor_portal_get_versao         idem; estudo e capa (organização) = os da OPORTUNIDADE;
--   fn_investor_portal_get_dataroom       idem; documentos da organização da oportunidade;
--   fn_investor_portal_submit_interest    idem; o interesse é gravado na organização da OPORTUNIDADE
--                                         (antes ia para a do link — a SPE não veria o lead).
-- Investidor sem a marca: fn_orgs_do_investidor devolve só a organização dele = como antes.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: as quatro seguem SECURITY DEFINER com o token validado dentro, REVOKE PUBLIC + GRANT
--      anon/authenticated (leitura do portal por link). fn_orgs_do_investidor continua interna
--      (EXECUTE revogado de PUBLIC/anon/authenticated): é chamada de dentro delas.
--
-- Reverter: aplicar de novo as definições de aplicar_20271115980000 (get_versao),
--   aplicar_20271116100000 (get_dataroom), 20261230000005 (get_opportunities) e
--   20261230000006 (submit_interest).
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
            (SELECT jsonb_agg(row_to_json(o) ORDER BY o.created_at DESC)
             FROM public.investor_opportunities o
             WHERE o.organization_id = ANY(v_orgs)
               AND o.is_published = TRUE),
            '[]'::jsonb
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_opportunities(TEXT) TO anon, authenticated;

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

    -- Fase 7: as organizações do investidor (a dele + as compartilhadas, se "Disponível em todas").
    v_orgs := public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = ANY(v_orgs)
      AND is_published = TRUE;
    IF NOT FOUND OR v_opp.imovib_study_id IS NULL THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    -- O estudo Ã© da organizaÃ§Ã£o do link (e da oportunidade).
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
        -- Parecer, critÃ©rios e notas de fonte sÃ£o internos (CHAVES_INTERNAS_DO_ESTUDO no front);
        -- cenÃ¡rios e listas do relatÃ³rio saem em chaves prÃ³prias, recortadas.
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
        -- Fase 6: os nÃºmeros congelados â€” SÃ“ a parte do investidor (a ediÃ§Ã£o interna, com parecer, fica no banco).
        'calculo', v_ver.snapshot -> 'calculo' -> 'investidor',
        'versao', jsonb_build_object('id', v_ver.id, 'label', v_ver.label, 'created_at', v_ver.created_at),
        'organizacao', jsonb_build_object('name', v_org.name, 'logo_url', v_org.logo_url)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_versao(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_dataroom(p_token text, p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities o
    WHERE o.id = p_opportunity_id
      AND o.organization_id = ANY(public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id, 'opportunity_id', d.opportunity_id, 'name', d.name, 'description', d.description,
                'file_path', d.file_path, 'file_size', d.file_size, 'mime_type', d.mime_type,
                'category', d.category, 'created_at', d.created_at) ORDER BY d.created_at DESC)
            FROM public.opportunity_documents d
            WHERE d.opportunity_id = p_opportunity_id
              AND d.organization_id = v_opp.organization_id
              AND d.category <> 'foto'
        ), '[]'::jsonb)
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_dataroom(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_submit_interest(p_token text, p_opportunity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'investidor'::text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_opp    public.investor_opportunities;
    v_id     UUID;
    v_role   TEXT;
BEGIN
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'name_required');
    END IF;

    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'token_invalid');
    END IF;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE id = p_opportunity_id
      AND organization_id = ANY(public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND is_published = TRUE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'opportunity_not_found');
    END IF;

    v_role := CASE
        WHEN p_role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')
        THEN p_role
        ELSE 'outro'
    END;

    -- O interesse vai para a organização da OPORTUNIDADE (é ela quem atende o lead).
    INSERT INTO public.opportunity_interests (
        organization_id, opportunity_id, contact_name, contact_email, contact_phone, role, message, stage
    ) VALUES (
        v_opp.organization_id,
        p_opportunity_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'valid', true,
        'id', v_id,
        'organization_id', v_opp.organization_id,
        'opportunity_id', p_opportunity_id
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
