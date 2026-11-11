-- ==========================================================================
-- Imovib: outras fontes de capital (mútuo, CRI, SCP, investidor)
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 4.4
-- (decisão D3 de 11/11/2026: entra nesta rodada, na forma simples).
--
-- Cada linha é um dinheiro de terceiros que entra no caixa do estudo no mês
-- `entry_month` e sai de um de dois jeitos:
--   remuneration = 'juros'        → devolvido pelo cronograma de
--                                   utils/debtAmortization.ts (BULLET, PRICE ou
--                                   SAC, `term_months` parcelas, `grace_months`
--                                   de carência), a `rate_annual` % a.a.;
--   remuneration = 'participacao' → recebe `profit_share_percent` % de cada
--                                   distribuição do caixa (item 4.3).
-- O cálculo é utils/imovibFontes.ts; o motor lê `study.funding_sources`.
--
-- A função do Portal do Investidor (item 0.6) passa a devolver as fontes: o
-- portal roda o mesmo motor e, sem elas, mostraria outro VPL para o mesmo
-- estudo (regra 13 do plano).
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): não há OR. As quatro policies da
--      tabela usam só imovib_unit_instance_org_check(study_id) — membro da
--      organização DONA do estudo, a mesma regra de imovib_scenarios. Na
--      função: as duas travas de antes (token ativo e não expirado E
--      oportunidade PUBLICADA da org do token ligada ao estudo); o que passa a
--      sair são as fontes desse estudo, só as colunas que o motor lê.
--   P2 (quem mais executa?): a função mantém REVOKE de PUBLIC e GRANT a anon e
--      authenticated (portal por link, sem login; a autorização é o token).
--      Tabela: REVOKE de anon, GRANT só a authenticated.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: DROP TABLE public.imovib_funding_sources; e reaplicar a função de
--   aplicar_20271111700000_investor_portal_estudo_mesma_estrutura.sql (o cliente
--   aceita a resposta sem `funding_sources`).

BEGIN;

CREATE TABLE IF NOT EXISTS public.imovib_funding_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id uuid NOT NULL REFERENCES public.imovib_studies(id) ON DELETE CASCADE,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'outro'
        CHECK (kind IN ('mutuo', 'cri', 'scp', 'investidor', 'outro')),
    amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
    entry_month integer NOT NULL DEFAULT 1 CHECK (entry_month >= 1),
    remuneration text NOT NULL DEFAULT 'juros'
        CHECK (remuneration IN ('juros', 'participacao')),
    rate_annual numeric,
    profit_share_percent numeric CHECK (profit_share_percent IS NULL OR (profit_share_percent >= 0 AND profit_share_percent <= 100)),
    amortization text NOT NULL DEFAULT 'BULLET'
        CHECK (amortization IN ('BULLET', 'PRICE', 'SAC')),
    term_months integer CHECK (term_months IS NULL OR term_months >= 1),
    grace_months integer CHECK (grace_months IS NULL OR grace_months >= 0),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_imovib_funding_sources_study ON public.imovib_funding_sources(study_id);

ALTER TABLE public.imovib_funding_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imovib_funding_sources_select ON public.imovib_funding_sources;
CREATE POLICY imovib_funding_sources_select ON public.imovib_funding_sources
    FOR SELECT TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_funding_sources_insert ON public.imovib_funding_sources;
CREATE POLICY imovib_funding_sources_insert ON public.imovib_funding_sources
    FOR INSERT TO authenticated
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_funding_sources_update ON public.imovib_funding_sources;
CREATE POLICY imovib_funding_sources_update ON public.imovib_funding_sources
    FOR UPDATE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id))
    WITH CHECK (public.imovib_unit_instance_org_check(study_id));

DROP POLICY IF EXISTS imovib_funding_sources_delete ON public.imovib_funding_sources;
CREATE POLICY imovib_funding_sources_delete ON public.imovib_funding_sources
    FOR DELETE TO authenticated
    USING (public.imovib_unit_instance_org_check(study_id));

REVOKE ALL ON TABLE public.imovib_funding_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.imovib_funding_sources TO authenticated;

-- Portal do Investidor: a mesma função de aplicar_20271111700000, mais `funding_sources`.
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
