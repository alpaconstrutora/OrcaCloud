-- ==========================================================================
-- Imovib: pendências da governança — versão e parecer gravados pelo banco
-- ==========================================================================
-- Plano: docs/planos/2026-11-12-imovib-governanca-pendencias.md, itens 1, 2, 3 e 5.
--
-- 1. imovib_study_versions: gatilho BEFORE INSERT grava created_at = now() e
--    created_by = auth.uid() (antes vinham da tela: data retroativa, outro autor).
-- 2. imovib_studies.recommended_by_user_id; gatilho BEFORE UPDATE grava quem e
--    quando registrou o parecer (auth.uid(), now(), nome do membro na organização
--    do estudo) — só quando o parecer ou a justificativa mudam. Parecer limpo zera
--    quem, quando e os números do momento. Sem auth.uid() (SQL direto, migração)
--    o gatilho não mexe.
-- 3. study_id da versão: ON DELETE CASCADE → RESTRICT (decisão do usuário, 12/11:
--    estudo com versão congelada não se apaga).
-- 5. imovib_studies.recommendation_snapshot: os indicadores que embasaram o parecer.
--
-- REGRA #7
--   P1: nenhuma policy criada nem alterada.
--   P2: duas funções de gatilho novas, SECURITY INVOKER (rodam com quem grava; a
--      leitura de organization_members segue a RLS dela: o próprio membro se lê).
--      Gatilho não se chama por RPC; mesmo assim REVOKE EXECUTE de PUBLIC.
--      fn_investor_portal_get_study (SECURITY DEFINER, anon) devolve a linha do
--      estudo com row_to_json(s) menos as colunas internas — as duas colunas novas
--      entram nessa lista. O resto da função é a definição em produção em 12/11
--      (pg_get_functiondef), sem outra mudança.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TRIGGER trg_imovib_versao_carimbo ON public.imovib_study_versions;
--           DROP TRIGGER trg_imovib_parecer_autor ON public.imovib_studies;
--           DROP FUNCTION public.fn_imovib_versao_carimbo(), public.fn_imovib_parecer_autor();
--           ALTER TABLE public.imovib_study_versions DROP CONSTRAINT imovib_study_versions_study_id_fkey,
--             ADD CONSTRAINT imovib_study_versions_study_id_fkey FOREIGN KEY (study_id) REFERENCES public.imovib_studies(id) ON DELETE CASCADE;
--           ALTER TABLE public.imovib_studies DROP COLUMN recommendation_snapshot, DROP COLUMN recommended_by_user_id;

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. Versão: data e autor pelo banco
CREATE OR REPLACE FUNCTION public.fn_imovib_versao_carimbo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.created_at := now();
    IF auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_versao_carimbo() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_imovib_versao_carimbo ON public.imovib_study_versions;
CREATE TRIGGER trg_imovib_versao_carimbo
    BEFORE INSERT ON public.imovib_study_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_versao_carimbo();

-- 3. Estudo com versão não se apaga
ALTER TABLE public.imovib_study_versions DROP CONSTRAINT IF EXISTS imovib_study_versions_study_id_fkey;
ALTER TABLE public.imovib_study_versions ADD CONSTRAINT imovib_study_versions_study_id_fkey
    FOREIGN KEY (study_id) REFERENCES public.imovib_studies(id) ON DELETE RESTRICT;

-- 2 e 5. Parecer: quem, quando e os números do momento
ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS recommended_by_user_id uuid,
    ADD COLUMN IF NOT EXISTS recommendation_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.fn_imovib_parecer_autor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_nome text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.recommendation IS NOT DISTINCT FROM OLD.recommendation
       AND NEW.recommendation_notes IS NOT DISTINCT FROM OLD.recommendation_notes THEN
        RETURN NEW;
    END IF;
    IF NEW.recommendation IS NULL THEN
        NEW.recommended_by := NULL;
        NEW.recommended_by_user_id := NULL;
        NEW.recommended_at := NULL;
        NEW.recommendation_snapshot := NULL;
        NEW.recommendation_notes := NULL;
        RETURN NEW;
    END IF;
    SELECT COALESCE(NULLIF(trim(om.name), ''), NULLIF(trim(om.email), ''))
      INTO v_nome
      FROM public.organization_members om
     WHERE om.user_id = auth.uid() AND om.organization_id = NEW.organization_id
     LIMIT 1;
    NEW.recommended_by_user_id := auth.uid();
    NEW.recommended_at := now();
    NEW.recommended_by := COALESCE(v_nome, NEW.recommended_by);
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_imovib_parecer_autor() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_imovib_parecer_autor ON public.imovib_studies;
CREATE TRIGGER trg_imovib_parecer_autor
    BEFORE UPDATE ON public.imovib_studies
    FOR EACH ROW EXECUTE FUNCTION public.fn_imovib_parecer_autor();

-- Portal do Investidor: as colunas novas também ficam fora
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_study(p_token text, p_study_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok        public.investor_portal_tokens;
    v_org_id     UUID;
    v_opp        public.investor_opportunities;
    v_study      JSONB;
    v_blocks     JSONB;
    v_capex      JSONB;
    v_instances  JSONB;
    v_fontes     JSONB;
    v_emp        public.empreendimentos;
    v_estrutura  JSONB := NULL;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    v_org_id := v_tok.org_id;

    SELECT * INTO v_opp
    FROM public.investor_opportunities
    WHERE imovib_study_id = p_study_id
      AND organization_id = v_org_id
      AND is_published = TRUE
    LIMIT 1;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    -- Fase 10: parecer, critérios e notas de fonte são internos: não vão ao portal.
    SELECT row_to_json(s)::jsonb - ARRAY['premise_notes', 'recommendation', 'recommendation_notes',
           'recommended_by', 'recommended_at', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure',
           'recommendation_snapshot', 'recommended_by_user_id']
      INTO v_study
    FROM public.imovib_studies s
    WHERE s.id = p_study_id AND s.organization_id = v_org_id;

    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    SELECT COALESCE(
        (SELECT jsonb_agg(
            jsonb_build_object(
                'id',                    b.id,
                'study_id',              b.study_id,
                'name',                  b.name,
                'construction_cost_sqm', b.construction_cost_sqm,
                'sales_price_sqm',       b.sales_price_sqm,
                'units',                 COALESCE(
                    (SELECT jsonb_agg(row_to_json(u))
                     FROM public.imovib_units u
                     WHERE u.block_id = b.id),
                    '[]'::jsonb
                )
            )
            ORDER BY b.created_at ASC
         )),
        '[]'::jsonb
    ) INTO v_blocks
    FROM public.imovib_blocks b
    WHERE b.study_id = p_study_id;

    SELECT COALESCE(
        (SELECT jsonb_agg(row_to_json(c) ORDER BY c.category ASC, c.created_at ASC)
         FROM public.imovib_capex_items c
         WHERE c.study_id = p_study_id),
        '[]'::jsonb
    ) INTO v_capex;

    SELECT COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'study_id', i.study_id, 'block_id', i.block_id, 'unit_id', i.unit_id,
            'name', i.name, 'floor', i.floor, 'private_area', i.private_area,
            'position_type', i.position_type, 'sun_orientation', i.sun_orientation,
            'price', i.price, 'status', i.status,
            'created_at', i.created_at, 'updated_at', i.updated_at))
         FROM public.imovib_unit_instances i
         WHERE i.study_id = p_study_id),
        '[]'::jsonb
    ) INTO v_instances;

    SELECT COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'id', f.id, 'study_id', f.study_id, 'name', f.name, 'kind', f.kind,
            'amount', f.amount, 'entry_month', f.entry_month, 'remuneration', f.remuneration,
            'rate_annual', f.rate_annual, 'profit_share_percent', f.profit_share_percent,
            'amortization', f.amortization, 'term_months', f.term_months,
            'grace_months', f.grace_months, 'sort_order', f.sort_order)
            ORDER BY f.sort_order ASC, f.created_at ASC)
         FROM public.imovib_funding_sources f
         WHERE f.study_id = p_study_id),
        '[]'::jsonb
    ) INTO v_fontes;

    SELECT * INTO v_emp
    FROM public.empreendimentos e
    WHERE e.imovib_study_id = p_study_id
      AND e.organization_id = v_org_id
    ORDER BY e.created_at ASC
    LIMIT 1;

    IF FOUND THEN
        v_estrutura := jsonb_build_object(
            'empreendimento', jsonb_build_object('name', v_emp.name),
            'torres', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'id', t.id, 'empreendimento_id', t.empreendimento_id, 'name', t.name,
                    'imovib_block_id', t.imovib_block_id, 'construction_cost_sqm', t.construction_cost_sqm,
                    'sales_price_sqm', t.sales_price_sqm, 'sort_order', t.sort_order) ORDER BY t.id)
                 FROM public.empreendimento_towers t
                 WHERE t.empreendimento_id = v_emp.id),
                '[]'::jsonb),
            'unidades', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'id', u.id, 'tower_id', u.tower_id, 'typology', u.typology,
                    'private_area', u.private_area, 'common_area', u.common_area,
                    'price', u.price, 'is_vendavel', u.is_vendavel) ORDER BY u.id)
                 FROM public.empreendimento_units u
                 JOIN public.empreendimento_towers t ON t.id = u.tower_id
                 WHERE t.empreendimento_id = v_emp.id),
                '[]'::jsonb)
        );
    END IF;

    v_study := v_study || jsonb_build_object(
        'blocks', v_blocks,
        'capex_items', v_capex,
        'unit_instances', v_instances,
        'funding_sources', v_fontes,
        'estrutura_do_empreendimento', v_estrutura
    );

    RETURN jsonb_build_object(
        'valid', TRUE,
        'study', v_study
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_investor_portal_get_study(TEXT, UUID) TO anon, authenticated;

COMMIT;
