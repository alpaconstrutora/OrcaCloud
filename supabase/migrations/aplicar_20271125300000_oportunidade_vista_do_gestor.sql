-- Um detalhe só da oportunidade para o investidor (link) e para o gestor (app) — 25/11/2026.
-- Plano: docs/planos/2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace.md (F4). Pedido: '"Ver" do
-- gestor = a mesma tela do portal, mais uma faixa só do gestor'.
--
-- A tela do portal (PortalOportunidadeDetalhe) lê a obra ao vivo e o acompanhamento por estas duas RPCs do LINK,
-- que exigem token. O gestor não tem token. Em vez de repetir a conta numa terceira função, o miolo de cada uma vira
-- uma função interna (recebe a oportunidade já autorizada) e há dois portões:
--   • link  — fn_investor_portal_get_obra / _get_acompanhamento: o MESMO portão de antes (token válido, org do
--             investidor, publicada) e a MESMA resposta (o miolo é o corpo de antes, copiado do banco em 25/11);
--   • gestor — fn_oportunidade_vista_do_gestor: membro da org da oportunidade (minhas_orgs_membro), publicada ou não
--             (o gestor vê o rascunho antes de publicar).
-- As internas são INVOKER e sem EXECUTE para ninguém: só rodam dentro dos portões (DEFINER).

CREATE OR REPLACE FUNCTION public.fn_oportunidade_obra_ao_vivo(p_opp public.investor_opportunities)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opp  public.investor_opportunities := p_opp;
    v_obra uuid;
BEGIN
    -- A obra do empreendimento do estudo (o mesmo caminho de fn_oportunidade_na_vitrine › local.obra_id).
    SELECT e.project_id INTO v_obra
      FROM public.empreendimentos e
     WHERE v_opp.imovib_study_id IS NOT NULL
       AND e.imovib_study_id = v_opp.imovib_study_id
       AND e.organization_id = v_opp.organization_id
     ORDER BY e.created_at
     LIMIT 1;
    IF v_obra IS NULL THEN RETURN NULL; END IF;

    RETURN (
        SELECT jsonb_build_object(
            'nome',   pr.name,
            'avanco', NULLIF(pr.settings ->> 'obraProgress', '')::numeric,
            'fase',   pr.settings ->> 'obraPhase',
            'marcos', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                        'nome', pm.name, 'previsto', pm.planned_date, 'concluido', pm.completed_date, 'status', pm.status)
                       ORDER BY pm.order_index, pm.planned_date)
                  FROM public.project_milestones pm
                 WHERE pm.project_id = pr.id AND pm.organization_id = pr.organization_id), '[]'::jsonb))
          FROM public.projects pr
         WHERE pr.id = v_obra AND pr.organization_id = v_opp.organization_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_oportunidade_obra_ao_vivo(public.investor_opportunities) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_oportunidade_acompanhamento(p_opp public.investor_opportunities)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opp  public.investor_opportunities := p_opp;
    v_emp  public.empreendimentos;
    v_obra public.projects;
    v_saidas numeric := 0;
    v_entradas numeric := 0;
    v_vendido numeric := 0;
    v_vendidas int := 0;
    v_unidades int := 0;
BEGIN
    SELECT * INTO v_emp FROM public.empreendimentos e
     WHERE v_opp.imovib_study_id IS NOT NULL AND e.imovib_study_id = v_opp.imovib_study_id
       AND e.organization_id = v_opp.organization_id
     ORDER BY e.created_at LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

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

    RETURN jsonb_build_object(
        'obra_nome',        v_obra.name,
        'avanco',           NULLIF(v_obra.settings ->> 'obraProgress', '')::numeric,
        'custo_realizado',  v_saidas,
        'entradas',         v_entradas,
        'vendido',          v_vendido,
        'unidades',         v_unidades,
        'unidades_vendidas', v_vendidas
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_oportunidade_acompanhamento(public.investor_opportunities) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_investor_portal_get_obra(p_token text, p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok  public.investor_portal_tokens;
    v_opp  public.investor_opportunities;
BEGIN
    SELECT * INTO v_tok FROM public.investor_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp FROM public.investor_opportunities o
     WHERE o.id = p_opportunity_id
       AND o.organization_id = ANY (public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
       AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'obra', public.fn_oportunidade_obra_ao_vivo(v_opp));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_obra(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_obra(text, uuid) TO anon, authenticated;

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
BEGIN
    SELECT * INTO v_tok FROM public.investor_portal_tokens
     WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"unauthorized"}'::jsonb; END IF;

    SELECT * INTO v_opp FROM public.investor_opportunities o
     WHERE o.id = p_opportunity_id
       AND o.organization_id = ANY (public.fn_orgs_do_investidor(v_tok.investor_id) || v_tok.org_id)
       AND o.is_published = TRUE;
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object('valid', TRUE, 'acompanhamento', public.fn_oportunidade_acompanhamento(v_opp));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_investor_portal_get_acompanhamento(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_investor_portal_get_acompanhamento(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_oportunidade_vista_do_gestor(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opp public.investor_opportunities;
BEGIN
    SELECT * INTO v_opp FROM public.investor_opportunities o
     WHERE o.id = p_opportunity_id
       AND o.organization_id IN (SELECT public.minhas_orgs_membro());
    IF NOT FOUND THEN RETURN '{"valid":false,"error":"forbidden"}'::jsonb; END IF;

    RETURN jsonb_build_object(
        'valid',          TRUE,
        'obra',           public.fn_oportunidade_obra_ao_vivo(v_opp),
        'acompanhamento', public.fn_oportunidade_acompanhamento(v_opp));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_oportunidade_vista_do_gestor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_oportunidade_vista_do_gestor(uuid) TO authenticated;
