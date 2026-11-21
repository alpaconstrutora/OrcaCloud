-- ==========================================================================
-- Captação ligada ao dinheiro real: oportunidade ↔ SPE; meta da versão; interesse → sócio
-- ==========================================================================
-- Plano: docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 4.
--
-- Antes: meta e "já captado" eram dois números digitados (saíram na 961000); nada ligava a
-- oportunidade à SPE, às cotas ou às chamadas de capital, e um interesse "fechado" não virava nada.
--
-- 1. investor_opportunities.spe_entity_id (FK SET NULL); o gatilho de validação confere que a
--    SPE é da organização da oportunidade.
-- 2. Vitrine ganha 'captacao':
--      meta          = Σ fontes 'investidor'/'scp' da VERSÃO (snapshot.funding_sources); sem elas,
--                      a exposição máxima congelada (o capital próprio que o projeto exige);
--      chamado       = Σ spe_partners.capital_calls_total da SPE;
--      integralizado = Σ spe_partners.capital_paid da SPE (pagamentos de chamada + lançamentos).
--    A mesma regra no app: utils/oportunidadeCaptacao.ts (metaDaCaptacao). O marketplace anônimo
--    NÃO recebe 'captacao'.
-- 3. opportunity_interests ganha investor_id (o investidor do link) e valor_pretendido.
-- 4. fn_investor_portal_submit_interest: grava investor_id do token e o valor. A assinatura muda
--    (p_valor): a antiga sai antes, para não ficarem duas.
--
-- REGRA #7
--   P1: nenhuma policy nova.
--   P2: gatilho SECURITY INVOKER (REVOKE de todos); vitrine interna (REVOKE de todos);
--       submit_interest SECURITY DEFINER, token validado dentro, REVOKE PUBLIC + GRANT anon/auth.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (depois da 970000)
-- NUNCA supabase db push.
-- Reverter: DROP COLUMN spe_entity_id / investor_id / valor_pretendido; reaplicar as funções de
--   aplicar_20271121960000, aplicar_20271121970000 e aplicar_20271116200000 (submit_interest).

BEGIN;

ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS spe_entity_id uuid REFERENCES public.spe_entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_investor_opportunities_spe ON public.investor_opportunities(spe_entity_id);

ALTER TABLE public.opportunity_interests
    ADD COLUMN IF NOT EXISTS investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS valor_pretendido numeric;
ALTER TABLE public.opportunity_interests DROP CONSTRAINT IF EXISTS opportunity_interests_valor_pretendido_check;
ALTER TABLE public.opportunity_interests ADD CONSTRAINT opportunity_interests_valor_pretendido_check
    CHECK (valor_pretendido IS NULL OR valor_pretendido >= 0);

-- ── 1. Gatilho: + SPE da mesma organização ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_investor_opportunity_versao_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_parecer text;
BEGIN
    IF NEW.spe_entity_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.spe_entities e WHERE e.id = NEW.spe_entity_id AND e.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION 'A SPE escolhida é de outra organização.' USING ERRCODE = '23514';
    END IF;

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

-- ── 2. Vitrine com a captação ──────────────────────────────────────────────
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
        'spe_entity_id', o.spe_entity_id,
        'distances_json', o.distances_json,
        'team_json', o.team_json,
        'created_at', o.created_at,
        'indicadores_da_versao', v.snapshot -> 'calculo' -> 'investidor' -> 'indicadores',
        'resultados_da_versao', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
            'duracao', v.results -> 'duracao', 'custoObra', v.results -> 'custoObra', 'terreno', v.results -> 'terreno') END,
        'local', CASE WHEN emp.id IS NULL THEN NULL ELSE jsonb_build_object(
            'cidade', emp.endereco_city, 'uf', emp.endereco_state, 'obra_id', emp.project_id) END,
        'fotos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('url', f.url, 'legenda', f.legenda) ORDER BY f.grupo, f.ordem)
            FROM (
                SELECT 1 AS grupo, d.ordem, d.imagem_url AS url, COALESCE(d.legenda, d.tipologia) AS legenda
                FROM public.empreendimento_tipologia_decorado d WHERE d.empreendimento_id = emp.id
                UNION ALL
                SELECT 2, 0, p.imagem_url, 'Planta — ' || p.tipologia
                FROM public.empreendimento_tipologia_plantas p WHERE p.empreendimento_id = emp.id
                UNION ALL
                SELECT 3, vi.andar_de, vi.imagem_url, COALESCE(vi.legenda, 'Vista — ' || t.name)
                FROM public.empreendimento_tower_vistas vi
                JOIN public.empreendimento_towers t ON t.id = vi.tower_id
                WHERE t.empreendimento_id = emp.id
            ) f
        ), '[]'::jsonb),
        'captacao', jsonb_build_object(
            'fontes_de_investidor', (
                SELECT sum((fs ->> 'amount')::numeric)
                FROM jsonb_array_elements(COALESCE(v.snapshot -> 'funding_sources', '[]'::jsonb)) fs
                WHERE fs ->> 'kind' IN ('investidor', 'scp')),
            'exposicao_maxima', v.snapshot -> 'calculo' -> 'investidor' -> 'indicadores' -> 'exposicaoMaxima',
            'chamado', (SELECT sum(p.capital_calls_total) FROM public.spe_partners p WHERE p.spe_entity_id = o.spe_entity_id),
            'integralizado', (SELECT sum(p.capital_paid) FROM public.spe_partners p WHERE p.spe_entity_id = o.spe_entity_id),
            'com_spe', o.spe_entity_id IS NOT NULL)
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

-- Marketplace anônimo: sem captação nem SPE.
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

    SELECT coalesce(json_agg(item ORDER BY item->>'created_at' DESC), '[]'::json)
    INTO v_opps
    FROM (
        SELECT (public.fn_oportunidade_na_vitrine(o) - ARRAY['team_json', 'distances_json', 'imovib_study_id', 'imovib_version_id', 'link', 'captacao', 'spe_entity_id'])::json AS item
        FROM public.investor_opportunities o
        WHERE o.organization_id = v_org_id
          AND o.is_published = true
    ) sub;

    RETURN json_build_object('organization', v_org_info, 'opportunities', v_opps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_marketplace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketplace(text) TO anon, authenticated;

-- ── 4. Interesse pelo link grava o investidor e o valor ─────────────────────
DROP FUNCTION IF EXISTS public.fn_investor_portal_submit_interest(text, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_investor_portal_submit_interest(p_token text, p_opportunity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'investidor'::text, p_message text DEFAULT NULL::text, p_valor numeric DEFAULT NULL::numeric)
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
    IF p_valor IS NOT NULL AND p_valor < 0 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'valor_invalido');
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

    -- O interesse vai para a organização da OPORTUNIDADE; o investidor é o do link (Fase 4).
    INSERT INTO public.opportunity_interests (
        organization_id, opportunity_id, investor_id, contact_name, contact_email, contact_phone, role, message, stage, valor_pretendido
    ) VALUES (
        v_opp.organization_id,
        p_opportunity_id,
        v_tok.investor_id,
        trim(p_name),
        nullif(trim(coalesce(p_email, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        v_role,
        nullif(trim(coalesce(p_message, '')), ''),
        'lead',
        p_valor
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

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(text, uuid, text, text, text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_submit_interest(text, uuid, text, text, text, text, text, numeric) TO anon, authenticated;

COMMIT;
