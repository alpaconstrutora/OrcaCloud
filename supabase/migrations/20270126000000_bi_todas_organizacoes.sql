-- ============================================================
-- BI Executivo — suporta "Todas as Organizações" (p_organization_id NULL)
-- OrçaCloud SaaS · Migration 20270126000000
--
-- Contexto: AppRouter.tsx parou de forçar organizations[0]?.id quando o
-- usuário escolhe "Todas as Organizações" no seletor global. Agora ele
-- repassa string vazia/NULL, e o BI Executivo (fn_bi_executive/fn_bi_trend)
-- precisa saber agregar sobre todas as organizações do usuário nesse caso,
-- em vez de simplesmente retornar zero linhas (organization_id = NULL nunca
-- casa em SQL).
--
-- Efeito colateral positivo: nenhuma das duas funções validava antes que
-- p_organization_id pertencesse ao usuário chamador — dependiam só da RLS
-- das tabelas de origem (que fn_bi_executive consulta como invoker, não
-- SECURITY DEFINER). A exceção era o bloco de RH: rh_kpis() é
-- SECURITY DEFINER e SEM checagem de posse nenhuma, então um usuário
-- autenticado podia, em tese, chamar fn_bi_executive com o org_id de outro
-- tenant e ver os KPIs de RH daquela organização. Esta migration adiciona
-- uma checagem explícita de posse (mesma regra do is_org_member) ANTES de
-- montar a lista de organizações-alvo, fechando essa lacuna também para o
-- caso de organização única.
--
-- Fora de escopo: a policy de RLS de `projects` ainda tem a cláusula
-- `OR settings->>'organizationId' IS NULL` (projetos órfãos visíveis a
-- qualquer usuário autenticado) — pendência preexistente, documentada em
-- memória do projeto, não tratada aqui.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_bi_trend — aceita p_organization_id NULL (agrega sobre as
--    organizações do usuário autenticado)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_bi_trend(
  p_organization_id UUID,
  p_months          INT DEFAULT 12
)
RETURNS TABLE (
  mes            TEXT,
  receita        NUMERIC,
  custo          NUMERIC,
  ebitda         NUMERIC,
  pedidos        BIGINT,
  deals_fechados BIGINT,
  obras_ativas   BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      DATE_TRUNC('month', CURRENT_DATE - ((p_months - 1) || ' months')::INTERVAL),
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'::INTERVAL
    )::DATE AS m
  ),
  fin AS (
    SELECT
      DATE_TRUNC('month', f.transaction_date::TIMESTAMPTZ)::DATE AS m,
      SUM(f.net_realizado) FILTER (WHERE f.dre_group = 'RECEITA_BRUTA')          AS receita_bruta,
      SUM(f.net_realizado) FILTER (WHERE f.dre_group = 'DEDUCOES')               AS deducoes,
      SUM(f.net_realizado) FILTER (WHERE f.dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO')) AS custos,
      SUM(f.net_realizado) FILTER (WHERE f.dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL')) AS despesas_op
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = ANY(v_targets)
    GROUP BY 1
  )
  SELECT
    TO_CHAR(mo.m, 'MM/YYYY')                                 AS mes,
    COALESCE(fi.receita_bruta, 0)                            AS receita,
    COALESCE(-fi.custos - fi.despesas_op, 0)                 AS custo,
    COALESCE(fi.receita_bruta + fi.deducoes + fi.custos + fi.despesas_op, 0) AS ebitda,
    COALESCE((
      SELECT COUNT(*) FROM public.vw_fact_purchase_order po
      WHERE po.organization_id = ANY(v_targets)
        AND DATE_TRUNC('month', po.created_at) = mo.m
    ), 0)                                                    AS pedidos,
    COALESCE((
      SELECT COUNT(*) FROM public.vw_fact_deal d
      WHERE d.organization_id = ANY(v_targets)
        AND d.is_vgv = true
        AND DATE_TRUNC('month', d.deal_date::TIMESTAMPTZ) = mo.m
    ), 0)                                                    AS deals_fechados,
    COALESCE((
      SELECT COUNT(*) FROM public.projects p
      WHERE p.organization_id = ANY(v_targets)
        AND p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= (mo.m + INTERVAL '1 month - 1 day')::DATE
    ), 0)                                                    AS obras_ativas
  FROM months mo
  LEFT JOIN fin fi ON fi.m = mo.m
  ORDER BY mo.m;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_bi_executive — aceita p_organization_id NULL (agrega sobre as
--    organizações do usuário autenticado); DRE somado linha a linha
--    (fn_dre_summary só aceita uma organização por chamada); RH somado
--    a partir de uma checagem explícita de posse (rh_kpis é
--    SECURITY DEFINER e não valida isso sozinho).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_bi_executive(
  p_organization_id UUID,
  p_date_from       DATE DEFAULT DATE_TRUNC('year',  CURRENT_DATE)::DATE,
  p_date_to         DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids     UUID[];
  v_targets     UUID[];
  v_comercial   JSONB;
  v_supply      JSONB;
  v_operacional JSONB;
  v_dre         JSONB;
  v_rh          JSONB;
BEGIN
  -- Organizações do usuário autenticado (mesma regra de public.is_org_member)
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  -- 1. Comercial
  SELECT jsonb_build_object(
    'total_deals',        COUNT(*),
    'deals_fechados',     COUNT(*) FILTER (WHERE fd.is_vgv),
    'taxa_conversao_pct', CASE
      WHEN COUNT(*) FILTER (WHERE fd.in_conversao_base) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE fd.is_vgv)::NUMERIC
        / COUNT(*) FILTER (WHERE fd.in_conversao_base) * 100, 1)
      ELSE NULL END,
    'vgv_fechado',  COALESCE(SUM(fd.value) FILTER (WHERE fd.is_vgv), 0),
    'ticket_medio', COALESCE(AVG(fd.value) FILTER (WHERE fd.is_vgv), 0)
  ) INTO v_comercial
  FROM public.vw_fact_deal fd
  WHERE fd.organization_id = ANY(v_targets)
    AND fd.deal_date BETWEEN p_date_from AND p_date_to;

  -- 2. Suprimentos
  SELECT jsonb_build_object(
    'total_pedidos',  COUNT(*),
    'recebidos',      COUNT(*) FILTER (WHERE fpo.is_recebido),
    'divergencias',   COUNT(*) FILTER (WHERE fpo.is_divergencia),
    'taxa_divergencia_pct', CASE
      WHEN COUNT(*) FILTER (WHERE fpo.is_fechado) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE fpo.is_divergencia)::NUMERIC
        / COUNT(*) FILTER (WHERE fpo.is_fechado) * 100, 1)
      ELSE NULL END,
    'lead_time_medio_dias', ROUND(AVG(fpo.lead_time_dias) FILTER (WHERE fpo.lead_time_dias IS NOT NULL), 1)
  ) INTO v_supply
  FROM public.vw_fact_purchase_order fpo
  WHERE fpo.organization_id = ANY(v_targets)
    AND fpo.created_at::DATE BETWEEN p_date_from AND p_date_to;

  -- 3. Operacional — com filtro temporal e cast defensivo de endDate
  SELECT jsonb_build_object(
    'obras_ativas', COUNT(*) FILTER (
      WHERE p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= p_date_to
        AND CASE
              WHEN NULLIF(p.settings->>'endDate', '') IS NULL THEN TRUE
              WHEN LEFT(p.settings->>'endDate', 10) ~ '^\d{4}-\d{2}-\d{2}$'
                THEN LEFT(p.settings->>'endDate', 10)::DATE >= p_date_from
              ELSE TRUE
            END
    ),
    'ncs_abertas',      (SELECT COUNT(*) FROM public.construction_conditions cc
                         WHERE cc.organization_id = ANY(v_targets)
                           AND cc.state NOT IN ('CLOSED','VALIDATED')),
    'garantia_abertos', (SELECT COUNT(*) FROM public.warranty_claims wc
                         WHERE wc.organization_id = ANY(v_targets)
                           AND wc.state NOT IN ('ENCERRADO','FORA_GARANTIA')),
    'nps_medio',        (SELECT ROUND(AVG(nps_nota)::NUMERIC, 1)
                         FROM public.warranty_claims
                         WHERE organization_id = ANY(v_targets)
                           AND nps_nota IS NOT NULL)
  ) INTO v_operacional
  FROM public.projects p
  WHERE p.organization_id = ANY(v_targets);

  -- 4. DRE — soma por linha entre as organizações-alvo
  --    (fn_dre_summary só aceita uma organização por chamada; a ordem das
  --    linhas é preservada via WITH ORDINALITY, já que a função sempre
  --    emite as mesmas 10 linhas na mesma ordem via UNION ALL)
  SELECT jsonb_agg(jsonb_build_object('linha', linha, 'realizado', realizado, 'previsto', previsto) ORDER BY ord)
  INTO v_dre
  FROM (
    SELECT linha, MIN(ord) AS ord, SUM(valor_realizado) AS realizado, SUM(valor_previsto) AS previsto
    FROM (
      SELECT d.linha, d.valor_realizado, d.valor_previsto, d.ord
      FROM unnest(v_targets) AS org_id
      CROSS JOIN LATERAL ROWS FROM (public.fn_dre_summary(org_id, p_date_from, p_date_to))
        WITH ORDINALITY AS d(linha, valor_realizado, valor_previsto, ord)
    ) raw
    GROUP BY linha
  ) grouped;

  -- 5. RH — soma headcount/custos entre as organizações-alvo.
  --    rh_kpis() é SECURITY DEFINER e não valida posse por conta própria;
  --    a checagem já foi feita acima (p_organization_id ∈ v_org_ids, e
  --    v_targets nunca contém organização fora de v_org_ids).
  BEGIN
    SELECT jsonb_build_object(
      'headcount', jsonb_build_object(
        'total',     COALESCE(SUM((r->'headcount'->>'total')::INT), 0),
        'ativos',    COALESCE(SUM((r->'headcount'->>'ativos')::INT), 0),
        'afastados', COALESCE(SUM((r->'headcount'->>'afastados')::INT), 0),
        'em_ferias', COALESCE(SUM((r->'headcount'->>'em_ferias')::INT), 0)
      ),
      'periodo', jsonb_build_object(
        'admitidos',  COALESCE(SUM((r->'periodo'->>'admitidos')::INT), 0),
        'desligados', COALESCE(SUM((r->'periodo'->>'desligados')::INT), 0),
        'turnover_pct', CASE WHEN SUM((r->'headcount'->>'total')::INT) > 0
                          THEN ROUND(SUM((r->'periodo'->>'desligados')::NUMERIC) / SUM((r->'headcount'->>'total')::NUMERIC) * 100, 1)
                          ELSE 0 END
      ),
      'custos', jsonb_build_object(
        'custo_mes',    COALESCE(SUM((r->'custos'->>'custo_mes')::NUMERIC), 0),
        'horas_extras', COALESCE(SUM((r->'custos'->>'horas_extras')::NUMERIC), 0)
      ),
      'qualidade', jsonb_build_object(
        'absenteismo_pct', CASE WHEN COUNT(*) > 0
                             THEN ROUND(AVG((r->'qualidade'->>'absenteismo_pct')::NUMERIC), 1)
                             ELSE 0 END
      ),
      'alertas', jsonb_build_object(
        'treinamentos_vencendo', COALESCE(SUM((r->'alertas'->>'treinamentos_vencendo')::INT), 0),
        'docs_vencendo',         COALESCE(SUM((r->'alertas'->>'docs_vencendo')::INT), 0),
        'epis_estoque_baixo',    COALESCE(SUM((r->'alertas'->>'epis_estoque_baixo')::INT), 0),
        'ferias_vencendo',       COALESCE(SUM((r->'alertas'->>'ferias_vencendo')::INT), 0)
      )
    ) INTO v_rh
    FROM (
      SELECT public.rh_kpis(org_id, CURRENT_DATE)::JSONB AS r
      FROM unnest(v_targets) AS org_id
    ) rh_rows;
  EXCEPTION WHEN OTHERS THEN
    v_rh := '{}'::JSONB;
  END;

  RETURN jsonb_build_object(
    'period_from',  p_date_from,
    'period_to',    p_date_to,
    'comercial',    v_comercial,
    'supply',       v_supply,
    'operacional',  v_operacional,
    'dre',          v_dre,
    'rh',           v_rh
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20270126000000_bi_todas_organizacoes.sql
-- ────────────────────────────────────────────────────────────
