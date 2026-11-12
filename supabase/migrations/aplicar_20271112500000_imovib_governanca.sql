-- ==========================================================================
-- Imovib: governança do estudo — memorial, parecer, critérios e versões congeladas
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, itens 10.1 a 10.3.
-- Decisão D5 (12/11, usuário: "sim"): versão congelada é imutável — não se edita
-- nem se apaga.
--
-- Colunas novas em imovib_studies, opcionais:
--   premise_notes          { campo: { fonte, data } } — fonte e data de cada premissa;
--   recommendation         parecer: 'aprovar', 'aprovar_com_condicoes', 'renegociar', 'reprovar';
--   recommendation_notes   justificativa; recommended_by (nome de quem deu); recommended_at;
--   hurdle_irr_spread      folga mínima da TIR sobre a TMA (p.p.); vazio = padrão do sistema;
--   hurdle_margin_percent  margem líquida mínima sobre o VGV (%); vazio = padrão;
--   hurdle_max_exposure    exposição máxima aceita (R$); vazio = sem critério.
--
-- Tabela imovib_study_versions: o estudo inteiro (snapshot) e os indicadores do
-- momento (results). Só SELECT e INSERT: sem policy nem GRANT de UPDATE/DELETE,
-- então "authenticated" não altera nem apaga versão. Apagar o ESTUDO apaga as
-- versões dele (ON DELETE CASCADE): a versão é do estudo, não sobrevive a ele.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As duas policies usam só
--      imovib_unit_instance_org_check(study_id) — membro da organização DONA do
--      estudo, a mesma regra das outras tabelas filhas do Imovib.
--   P2 (quem mais executa?): fn_investor_portal_get_study (SECURITY DEFINER, anon
--      e authenticated) devolve a linha do estudo com row_to_json(s) — passaria o
--      parecer interno a quem abre o link do investidor. Reescrita aqui para tirar
--      as colunas novas; o resto da função é a definição em produção em 12/11
--      (lida com pg_get_functiondef), sem outra mudança. EXECUTE continua só para
--      anon e authenticated (REVOKE de PUBLIC). As versões não entram no portal.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_study_versions;
--           ALTER TABLE public.imovib_studies DROP COLUMN premise_notes, DROP COLUMN recommendation,
--             DROP COLUMN recommendation_notes, DROP COLUMN recommended_by, DROP COLUMN recommended_at,
--             DROP COLUMN hurdle_irr_spread, DROP COLUMN hurdle_margin_percent, DROP COLUMN hurdle_max_exposure;
--           (a função volta com o SELECT row_to_json(s)::jsonb INTO v_study de antes)

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS premise_notes jsonb,
    ADD COLUMN IF NOT EXISTS recommendation text,
    ADD COLUMN IF NOT EXISTS recommendation_notes text,
    ADD COLUMN IF NOT EXISTS recommended_by text,
    ADD COLUMN IF NOT EXISTS recommended_at timestamptz,
    ADD COLUMN IF NOT EXISTS hurdle_irr_spread numeric,
    ADD COLUMN IF NOT EXISTS hurdle_margin_percent numeric,
    ADD COLUMN IF NOT EXISTS hurdle_max_exposure numeric;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_recommendation_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_recommendation_check
    CHECK (recommendation IS NULL OR recommendation IN ('aprovar', 'aprovar_com_condicoes', 'renegociar', 'reprovar'));

CREATE TABLE IF NOT EXISTS public.imovib_study_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    label text NOT NULL,
    notes text,
    snapshot jsonb NOT NULL,
    results jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_imovib_study_versions_study ON public.imovib_study_versions(study_id, created_at);

ALTER TABLE public.imovib_study_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_study_versions_select ON public.imovib_study_versions;
CREATE POLICY imovib_study_versions_select ON public.imovib_study_versions
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_study_versions_insert ON public.imovib_study_versions;
CREATE POLICY imovib_study_versions_insert ON public.imovib_study_versions
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_study_versions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.imovib_study_versions TO authenticated;

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
           'recommended_by', 'recommended_at', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure']
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
