-- ==========================================================================
-- Portal do Investidor por link: o estudo chega com a MESMA estrutura do app
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 0.6.
--
-- Por quê: fn_investor_portal_get_study montava o estudo só com
-- imovib_blocks/imovib_units (estrutura antiga) e as rubricas. Faltavam:
--   • o espelho de vendas (imovib_unit_instances) — o motor tira o VGV dele
--     quando existe;
--   • a estrutura do empreendimento vinculado (torres e unidades) — desde
--     19/10/2026 é ela que o app usa para estudo vinculado.
-- Medido em 11/11/2026: a oportunidade publicada "Quintino Bocaiúva" (estudo
-- Bruninho) tem preço/m² 0 no bloco e R$ 9.999.998 no espelho (16 unidades). O
-- app calcula VGV de R$ 10,0 mi; o portal por link calculava VGV 0.
--
-- O que muda: a função devolve também `unit_instances` (as colunas que o motor
-- lê, INSTANCIA_VGV_COLS em services/imovibService.ts) e, para estudo vinculado
-- a empreendimento da MESMA organização, `estrutura_do_empreendimento` no
-- formato que o cliente passa a derivarEstruturaDoEmpreendimento
-- (utils/imovibEstrutura.ts). Com dois empreendimentos no mesmo estudo vale o
-- mais antigo — a mesma regra de carregarVinculos no imovibService.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. A função só lê depois de
--      validar o token (ativo, não expirado) E achar oportunidade PUBLICADA da
--      org do token ligada a este estudo — as mesmas duas travas de antes. O
--      que passa a sair (preço por unidade do espelho e das unidades do
--      empreendimento) é só o do estudo dessa oportunidade, e só as colunas que
--      o motor lê para calcular o VGV que o portal já mostra.
--   P2 (quem mais executa?): a ACL tinha `=X` (PUBLIC). REVOKE de PUBLIC aqui e
--      GRANT explícito a anon e authenticated, que são quem chama (portal por
--      link, sem login). A autorização é o token, dentro da função.
--   P3 (Edge Function): não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: reaplicar a definição de
--   20261230000005_fix_investor_portal_published_opportunities.sql (só a função
--   fn_investor_portal_get_study) — o cliente aceita as duas respostas.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_study(p_token TEXT, p_study_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tok        public.investor_portal_tokens;
    v_org_id     UUID;
    v_opp        public.investor_opportunities;
    v_study      JSONB;
    v_blocks     JSONB;
    v_capex      JSONB;
    v_instances  JSONB;
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

    SELECT row_to_json(s)::jsonb INTO v_study
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

    SELECT * INTO v_emp
    FROM public.empreendimentos e
    WHERE e.imovib_study_id = p_study_id
      AND e.organization_id = v_org_id
    ORDER BY e.created_at ASC
    LIMIT 1;

    IF FOUND THEN
        v_estrutura := jsonb_build_object(
            'empreendimento', jsonb_build_object(
                'id', v_emp.id, 'name', v_emp.name, 'organization_id', v_emp.organization_id,
                'imovib_study_id', v_emp.imovib_study_id, 'blueprint_study_id', v_emp.blueprint_study_id,
                'terreno_area', v_emp.terreno_area),
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
