-- Fase D (o que deveria existir) de docs/planos/2026-11-21-portal-do-investidor-consolidacao.md — D1, D2, D3.
--
-- REGRA #7, pergunta 1: sem policy nova.
-- Pergunta 2: fn_spe_distribuir_resultado é SECURITY INVOKER (grava pela RLS de investor_contributions: só
-- owner/admin da org); as do link são SECURITY DEFINER com o token conferido dentro, EXECUTE anon/authenticated.
--
-- Reversão: DROP das funções novas; recriar fn_investor_portal_get_reports (aplicar_20271121998000),
-- fn_investor_portal_get_announcements e fn_investor_portal_acknowledge (as do banco em 21/11, só org do token).

-- ═══ D2 — distribuir resultado pela SPE: um lançamento por sócio, proporcional às cotas, numa transação ═══════
CREATE OR REPLACE FUNCTION public.fn_spe_distribuir_resultado(
    p_spe_id uuid,
    p_valor numeric,
    p_tipo text DEFAULT 'distribuicao',
    p_data date DEFAULT CURRENT_DATE,
    p_descricao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_spe   public.spe_entities;
    v_soma  numeric;
    v_resto numeric;
    v_n     int := 0;
    v_ultimo uuid;
    r       record;
    v_parte numeric;
BEGIN
    IF p_valor IS NULL OR p_valor <= 0 THEN
        RAISE EXCEPTION 'Informe um valor maior que zero' USING ERRCODE = '22023';
    END IF;
    IF p_tipo NOT IN ('dividendo', 'distribuicao') THEN
        RAISE EXCEPTION 'Tipo deve ser dividendo ou distribuição' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_spe FROM public.spe_entities WHERE id = p_spe_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SPE não encontrada ou sem permissão' USING ERRCODE = '42501'; END IF;
    IF v_spe.project_id IS NULL THEN
        RAISE EXCEPTION 'A SPE não tem obra: vincule a obra para lançar no extrato dos sócios' USING ERRCODE = '22023';
    END IF;
    SELECT sum(ownership_pct) INTO v_soma FROM public.spe_partners WHERE spe_entity_id = p_spe_id AND ownership_pct > 0;
    IF COALESCE(v_soma, 0) <= 0 THEN
        RAISE EXCEPTION 'A SPE não tem sócio com participação' USING ERRCODE = '22023';
    END IF;

    -- Rateio pelas cotas, em centavos; a sobra do arredondamento vai para o maior sócio (o último da ordem).
    v_resto := round(p_valor, 2);
    FOR r IN
        SELECT investor_id, ownership_pct FROM public.spe_partners
         WHERE spe_entity_id = p_spe_id AND ownership_pct > 0
         ORDER BY ownership_pct, investor_id
    LOOP
        v_parte := round(p_valor * r.ownership_pct / v_soma, 2);
        INSERT INTO public.investor_contributions (
            organization_id, project_id, investor_id, type, amount, paid_date, due_date, status, description
        ) VALUES (
            v_spe.organization_id, v_spe.project_id, r.investor_id, p_tipo, v_parte, p_data, p_data, 'liquidado',
            COALESCE(NULLIF(btrim(p_descricao), ''), CASE p_tipo WHEN 'dividendo' THEN 'Dividendos' ELSE 'Distribuição de resultado' END)
                || ' — ' || v_spe.name
        ) RETURNING id INTO v_ultimo;
        v_resto := v_resto - v_parte;
        v_n := v_n + 1;
    END LOOP;
    IF v_resto <> 0 THEN
        UPDATE public.investor_contributions SET amount = amount + v_resto WHERE id = v_ultimo;
    END IF;
    RETURN jsonb_build_object('lancamentos', v_n, 'total', round(p_valor, 2));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_spe_distribuir_resultado(uuid, numeric, text, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_spe_distribuir_resultado(uuid, numeric, text, date, text) TO authenticated;

-- ═══ D3 — investidor em várias organizações: comunicados e relatórios de TODAS, com o nome da org ═════════════
-- Antes só da org do link (as oportunidades já vinham de todas — fn_orgs_do_investidor).
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_reports(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_orgs   UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id) || v_tok.org_id;

    RETURN jsonb_build_object(
        'valid',   TRUE,
        'reports', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                    'id',                r.id,
                    'organization_id',   r.organization_id,
                    'organization_name', o.name,
                    'investor_id',       r.investor_id,
                    'project_id',        r.project_id,
                    'name',              r.name,
                    'type',              r.type,
                    'category',          r.category,
                    'url',               r.url,
                    'report_date',       r.report_date,
                    'created_at',        r.created_at
                ) ORDER BY r.created_at DESC)
             FROM public.investor_reports r
             JOIN public.organizations o ON o.id = r.organization_id
             WHERE r.organization_id = ANY (v_orgs)
               AND (r.investor_id = v_inv_id
                    OR (r.investor_id IS NULL AND r.category IS DISTINCT FROM 'relatorio'))),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_reports(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_reports(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_announcements(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok    public.investor_portal_tokens;
    v_inv_id UUID;
    v_orgs   UUID[];
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;
    v_inv_id := v_tok.investor_id;
    v_orgs   := public.fn_orgs_do_investidor(v_inv_id) || v_tok.org_id;
    RETURN jsonb_build_object(
        'valid',         TRUE,
        'announcements', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',                      ia.id,
                    'organization_id',         ia.organization_id,
                    'organization_name',       o.name,
                    'title',                   ia.title,
                    'body',                    ia.body,
                    'type',                    ia.type,
                    'published_at',            ia.published_at,
                    'requires_acknowledgment', ia.requires_acknowledgment,
                    'project_id',              ia.project_id,
                    'created_at',              ia.created_at,
                    'acknowledged',            (ack.id IS NOT NULL),
                    'vote_option',             ack.vote_option,
                    'acknowledged_at',         ack.acknowledged_at
                )
                ORDER BY ia.published_at DESC
             )
             FROM public.investor_announcements ia
             JOIN public.organizations o ON o.id = ia.organization_id
             LEFT JOIN public.investor_acknowledgments ack
                 ON ack.announcement_id = ia.id AND ack.investor_id = v_inv_id
             WHERE ia.organization_id = ANY (v_orgs)
               AND ia.published_at IS NOT NULL),
            '[]'::jsonb
        )
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_announcements(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_announcements(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_acknowledge(p_token text, p_announcement_id uuid, p_vote_option text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_ann  public.investor_announcements;
    v_voto TEXT;
    v_ack  public.investor_acknowledgments;
BEGIN
    SELECT * INTO v_tok
    FROM public.investor_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"token_invalid"}'::jsonb; END IF;

    -- Comunicado PUBLICADO de uma organização do investidor (D3: todas, não só a do link).
    SELECT * INTO v_ann
    FROM public.investor_announcements
    WHERE id = p_announcement_id
      AND organization_id = ANY (public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
      AND published_at IS NOT NULL;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"not_found"}'::jsonb; END IF;

    IF v_ann.type = 'votacao' THEN
        v_voto := lower(btrim(p_vote_option));
        IF v_voto IS NULL OR v_voto NOT IN ('sim', 'nao', 'abstencao') THEN
            RETURN '{"valid":false,"error":"vote_required"}'::jsonb;
        END IF;
    END IF;

    -- Resposta é definitiva: a 2ª chamada não troca o voto nem a data.
    INSERT INTO public.investor_acknowledgments (announcement_id, investor_id, vote_option)
    VALUES (v_ann.id, v_tok.investor_id, v_voto)
    ON CONFLICT (announcement_id, investor_id) DO NOTHING;

    SELECT * INTO v_ack
    FROM public.investor_acknowledgments
    WHERE announcement_id = v_ann.id AND investor_id = v_tok.investor_id;

    RETURN jsonb_build_object(
        'valid',           TRUE,
        'vote_option',     v_ack.vote_option,
        'acknowledged_at', v_ack.acknowledged_at
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_acknowledge(text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_acknowledge(text, uuid, text) TO anon, authenticated;

-- ═══ D1 — acompanhamento pelo link: o realizado da obra e das vendas da oportunidade (só totais) ═════════════
-- O previsto vem da versão publicada (naVitrine, no app). Aqui só o realizado, agregado — nenhum lançamento,
-- nenhuma negociação individual: custo e entradas CONCILIADOS da obra (fn_opura_obra_mensal), vendido pela parte
-- de cada unidade vendável do empreendimento (a regra única D6) e o avanço físico da ficha da obra.
CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_acompanhamento(p_token text, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
    v_emp  public.empreendimentos;
    v_obra public.projects;
    v_saidas numeric := 0;
    v_entradas numeric := 0;
    v_vendido numeric := 0;
    v_vendidas int := 0;
    v_unidades int := 0;
BEGIN
    SELECT * INTO v_tok FROM public.investor_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp FROM public.investor_opportunities o
     WHERE o.id = p_opportunity_id
       AND o.organization_id = ANY (public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
       AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    SELECT * INTO v_emp FROM public.empreendimentos e
     WHERE v_opp.imovib_study_id IS NOT NULL AND e.imovib_study_id = v_opp.imovib_study_id
       AND e.organization_id = v_opp.organization_id
     ORDER BY e.created_at LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('valid', TRUE, 'acompanhamento', NULL); END IF;

    IF v_emp.project_id IS NOT NULL THEN
        SELECT * INTO v_obra FROM public.projects WHERE id = v_emp.project_id AND organization_id = v_opp.organization_id;
        IF FOUND THEN
            SELECT COALESCE(sum(m.saidas), 0), COALESCE(sum(m.entradas), 0) INTO v_saidas, v_entradas
              FROM public.fn_opura_obra_mensal(v_opp.organization_id, v_obra.id, DATE '2000-01-01', CURRENT_DATE) m;
        END IF;
    END IF;

    -- Unidades vendáveis do empreendimento e a parte vendida de cada uma (regra de parteDaUnidadeNaNegociacao).
    WITH unidades AS (
        SELECT u.commercial_property_id
          FROM public.empreendimento_units u
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE t.empreendimento_id = v_emp.id AND u.is_vendavel IS DISTINCT FROM false
    ),
    vendas AS (
        SELECT d.id AS deal_id, du.property_id, COALESCE(d.value, 0) AS valor_total, COALESCE(du.value, 0) AS valor_da_unidade
          FROM public.commercial_deals d JOIN public.commercial_deal_units du ON du.deal_id = d.id
         WHERE d.type = 'SALE' AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED')
        UNION ALL
        SELECT d.id, d.property_id, COALESCE(d.value, 0), 0
          FROM public.commercial_deals d
         WHERE d.type = 'SALE' AND d.status IN ('CONTRATO', 'ASSINATURA', 'COMPLETED') AND d.property_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.commercial_deal_units du WHERE du.deal_id = d.id)
    ),
    partes AS (
        SELECT z.property_id,
               CASE WHEN z.n <= 1 THEN z.valor_total WHEN z.valor_da_unidade > 0 THEN z.valor_da_unidade
                    WHEN z.soma > 0 THEN z.valor_total * z.tabela / z.soma ELSE z.valor_total / z.n END AS parte
          FROM (SELECT v.*, count(*) OVER (PARTITION BY v.deal_id) AS n,
                       COALESCE(NULLIF(cp.price, 0), cp.initial_price, 0) AS tabela,
                       sum(COALESCE(NULLIF(cp.price, 0), cp.initial_price, 0)) OVER (PARTITION BY v.deal_id) AS soma
                  FROM vendas v LEFT JOIN public.commercial_properties cp ON cp.id = v.property_id) z
    )
    SELECT (SELECT count(*) FROM unidades),
           (SELECT count(*) FROM unidades u WHERE EXISTS (SELECT 1 FROM partes p WHERE p.property_id = u.commercial_property_id)),
           (SELECT COALESCE(sum(p.parte), 0) FROM partes p JOIN unidades u ON u.commercial_property_id = p.property_id)
      INTO v_unidades, v_vendidas, v_vendido;

    RETURN jsonb_build_object('valid', TRUE, 'acompanhamento', jsonb_build_object(
        'obra_nome',        v_obra.name,
        'avanco',           NULLIF(v_obra.settings ->> 'obraProgress', '')::numeric,
        'custo_realizado',  v_saidas,
        'entradas',         v_entradas,
        'vendido',          v_vendido,
        'unidades',         v_unidades,
        'unidades_vendidas', v_vendidas
    ));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_acompanhamento(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_acompanhamento(text, uuid) TO anon, authenticated;
