-- ==========================================================================
-- Oportunidade = vitrine: publicar exige a versão do Imovib; portal e marketplace só com
-- números da versão
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, itens 2.1, 2.6 e 5.2
-- (decisões D2 e D4 de 21/11/2026).
--
-- 1. fn_investor_opportunity_versao_valida (gatilho): publicada passa a exigir estudo E versão
--    com o cálculo congelado (snapshot ? 'calculo'), e o parecer do estudo não pode ser
--    "reprovar" (5.2). Antes: sem estudo, publicava com os números digitados.
-- 2. fn_investor_portal_get_opportunities: lista EXPLÍCITA de campos de vitrine no lugar de
--    to_jsonb(o) (o portal recebia risks_json, team_json, simulation_params_json, custos
--    digitados...) + indicadores e resultados da versão + local e obra do empreendimento.
-- 3. get_public_marketplace (anônimo): os mesmos números da versão, sem os digitados; local do
--    empreendimento; fotos como antes (saem na Fase 3). Ganha REVOKE de PUBLIC.
--
-- Local: empreendimento com imovib_study_id = estudo da oportunidade E da mesma organização,
-- o mais antigo (a mesma escolha de investorPortalService.comLocal).
--
-- Esta migration é compatível com o código ANTERIOR (só tira campos do payload; o app antigo
-- mostra "—"). As colunas digitadas saem em aplicar_20271121961000, depois do deploy.
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada.
--   P2: as três funções mantêm SECURITY (INVOKER no gatilho; DEFINER nas duas de portal) com
--       search_path fixo. Gatilho: REVOKE de PUBLIC, anon, authenticated. Portal: o token é
--       validado dentro (só oportunidade publicada das organizações do investidor); EXECUTE só
--       anon/authenticated. Marketplace: público por definição (página sem login, por slug);
--       devolve só oportunidade publicada; REVOKE de PUBLIC + GRANT a anon/authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: reaplicar fn_investor_opportunity_versao_valida de aplicar_20271115970000,
--   fn_investor_portal_get_opportunities de aplicar_20271116300000 e get_public_marketplace
--   de 20261109000003.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_investor_opportunity_versao_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_parecer text;
BEGIN
    IF NEW.imovib_study_id IS NULL THEN
        NEW.imovib_version_id := NULL;
        IF COALESCE(NEW.is_published, FALSE) THEN
            RAISE EXCEPTION 'Para publicar, vincule o estudo do Imovib: o investidor só vê os números da versão congelada.'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    SELECT s.recommendation INTO v_parecer
    FROM public.imovib_studies s
    WHERE s.id = NEW.imovib_study_id AND s.organization_id = NEW.organization_id;
    IF NOT FOUND THEN
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

    IF COALESCE(NEW.is_published, FALSE) THEN
        IF NEW.imovib_version_id IS NULL THEN
            RAISE EXCEPTION 'Para publicar, escolha a versão congelada do estudo que o investidor vai ver.'
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.imovib_study_versions v
            WHERE v.id = NEW.imovib_version_id AND v.snapshot ? 'calculo'
        ) THEN
            RAISE EXCEPTION 'Esta versão é anterior ao cálculo congelado: congele uma versão nova do estudo para publicar.'
                USING ERRCODE = '23514';
        END IF;
        IF v_parecer = 'reprovar' THEN
            RAISE EXCEPTION 'O parecer do estudo é "Reprovar": a oportunidade não pode ser publicada.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_opportunity_versao_valida() FROM PUBLIC, anon, authenticated;

-- Campos da vitrine + números da versão + local do empreendimento. Usada pelas duas RPCs abaixo.
-- Interna: ninguém da API executa.
CREATE OR REPLACE FUNCTION public.fn_oportunidade_na_vitrine(o public.investor_opportunities)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object(
        'id', o.id,
        'organization_id', o.organization_id,
        'title', o.title,
        'subtitle', o.subtitle,
        'open_date', o.open_date,
        'link', o.link,
        'status', o.status,
        'opportunity_type', o.opportunity_type,
        'thumbnail_url', o.thumbnail_url,
        'ticket_min', o.ticket_min,
        'is_published', o.is_published,
        'imovib_study_id', o.imovib_study_id,
        'imovib_version_id', o.imovib_version_id,
        'gallery_urls', o.gallery_urls,
        'distances_json', o.distances_json,
        'team_json', o.team_json,
        'created_at', o.created_at,
        'indicadores_da_versao', v.snapshot -> 'calculo' -> 'investidor' -> 'indicadores',
        'resultados_da_versao', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
            'duracao', v.results -> 'duracao', 'custoObra', v.results -> 'custoObra', 'terreno', v.results -> 'terreno') END,
        'local', CASE WHEN emp.id IS NULL THEN NULL ELSE jsonb_build_object(
            'cidade', emp.endereco_city, 'uf', emp.endereco_state, 'obra_id', emp.project_id) END
    )
    FROM (SELECT 1) AS um
    LEFT JOIN public.imovib_study_versions v ON v.id = o.imovib_version_id AND v.study_id = o.imovib_study_id
    LEFT JOIN LATERAL (
        SELECT e.id, e.endereco_city, e.endereco_state, e.project_id
        FROM public.empreendimentos e
        WHERE o.imovib_study_id IS NOT NULL
          AND e.imovib_study_id = o.imovib_study_id
          AND e.organization_id = o.organization_id
        ORDER BY e.created_at
        LIMIT 1
    ) emp ON TRUE;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_oportunidade_na_vitrine(public.investor_opportunities) FROM PUBLIC, anon, authenticated;

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
            (SELECT jsonb_agg(public.fn_oportunidade_na_vitrine(o) ORDER BY o.created_at DESC)
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

CREATE OR REPLACE FUNCTION public.get_public_marketplace(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_org_id   uuid;
    v_org_info json;
    v_opps     json;
BEGIN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE lower(slug) = lower(p_slug)
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN json_build_object('error', 'organization_not_found');
    END IF;

    SELECT json_build_object('id', id, 'name', name, 'logo_url', logo_url, 'website', website)
    INTO v_org_info
    FROM public.organizations
    WHERE id = v_org_id;

    -- Vitrine sem o que é do investidor logado (equipe, distâncias, galeria privada) + fotos.
    SELECT coalesce(json_agg(item ORDER BY item->>'created_at' DESC), '[]'::json)
    INTO v_opps
    FROM (
        SELECT (
            (public.fn_oportunidade_na_vitrine(o) - ARRAY['team_json', 'distances_json', 'gallery_urls', 'imovib_study_id', 'imovib_version_id', 'link'])
            || jsonb_build_object('photos', (
                SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'file_path', d.file_path, 'description', d.description) ORDER BY d.created_at), '[]'::jsonb)
                FROM public.opportunity_documents d
                WHERE d.opportunity_id = o.id AND d.category = 'foto'
            ))
        )::json AS item
        FROM public.investor_opportunities o
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
    ) sub;

    RETURN json_build_object('organization', v_org_info, 'opportunities', v_opps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_marketplace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;

COMMIT;
