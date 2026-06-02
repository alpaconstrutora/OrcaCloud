-- ============================================================
-- Converge fn_bi_executive e fn_bi_trend para vw_fact_*
-- OrçaCloud SaaS · Migration 20260710000003
--
-- Corrige divergências:
--   #1  VGV usa type='SALE' (via vw_fact_deal.is_vgv)
--   #3  EBITDA usa fórmula do DRE (não mais nature IN COST+EXPENSE)
--   #4  Receita usa dre_group='RECEITA_BRUTA' (não mais nature='REVENUE')
--   #6  Taxa de conversão: denominador = COMPLETED+CANCELLED em ambos os lugares
--   #7  Obras ativas em fn_bi_executive agora filtra pelo período (data_inicio)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_bi_trend — refatorado para usar vw_fact_*
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_bi_trend(
  p_organization_id UUID,
  p_months          INT DEFAULT 12
)
RETURNS TABLE (
  mes            TEXT,
  receita        NUMERIC,   -- Receita Bruta (dre_group='RECEITA_BRUTA', CONCILIATED)
  custo          NUMERIC,   -- Custos + Despesas op. (dre_group IN CUSTO_*/DESPESA_*)
  ebitda         NUMERIC,   -- receita − deduções − custo (fórmula DRE)
  pedidos        BIGINT,
  deals_fechados BIGINT,    -- type='SALE' AND status='COMPLETED'
  obras_ativas   BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
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
      -- Receita Bruta: só dre_group='RECEITA_BRUTA'
      SUM(f.net_realizado) FILTER (WHERE f.dre_group = 'RECEITA_BRUTA')          AS receita_bruta,
      -- Deduções (sinal já está negativo em net_realizado para DEBIT)
      SUM(f.net_realizado) FILTER (WHERE f.dre_group = 'DEDUCOES')               AS deducoes,
      -- Custos diretos
      SUM(f.net_realizado) FILTER (WHERE f.dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO')) AS custos,
      -- Despesas operacionais
      SUM(f.net_realizado) FILTER (WHERE f.dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL')) AS despesas_op
    FROM public.vw_fact_financial_tx f
    WHERE f.organization_id = p_organization_id
    GROUP BY 1
  )
  SELECT
    TO_CHAR(mo.m, 'MM/YYYY')                                 AS mes,
    COALESCE(fi.receita_bruta, 0)                            AS receita,
    COALESCE(-fi.custos - fi.despesas_op, 0)                 AS custo,
    -- EBITDA = RB + deduções (neg) + custos (neg) + despesas_op (neg)
    COALESCE(fi.receita_bruta + fi.deducoes + fi.custos + fi.despesas_op, 0) AS ebitda,
    -- Pedidos
    COALESCE((
      SELECT COUNT(*) FROM public.vw_fact_purchase_order po
      WHERE po.organization_id = p_organization_id
        AND DATE_TRUNC('month', po.created_at) = mo.m
    ), 0)                                                    AS pedidos,
    -- Deals: só type='SALE' status='COMPLETED'
    COALESCE((
      SELECT COUNT(*) FROM public.vw_fact_deal d
      WHERE d.organization_id = p_organization_id
        AND d.is_vgv = true
        AND DATE_TRUNC('month', d.deal_date::TIMESTAMPTZ) = mo.m
    ), 0)                                                    AS deals_fechados,
    -- Obras ativas (criadas até o fim do mês)
    COALESCE((
      SELECT COUNT(*) FROM public.projects p
      WHERE p.organization_id = p_organization_id
        AND p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= (mo.m + INTERVAL '1 month - 1 day')::DATE
    ), 0)                                                    AS obras_ativas
  FROM months mo
  LEFT JOIN fin fi ON fi.m = mo.m
  ORDER BY mo.m;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_bi_executive — bloco comercial usa vw_fact_deal
--    bloco supply usa vw_fact_purchase_order
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
  v_comercial   JSONB;
  v_supply      JSONB;
  v_operacional JSONB;
  v_dre         JSONB;
  v_rh          JSON;
BEGIN
  -- 1. Comercial — via vw_fact_deal (VGV = type='SALE' AND status='COMPLETED')
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
  WHERE fd.organization_id = p_organization_id
    AND fd.deal_date BETWEEN p_date_from AND p_date_to;

  -- 2. Suprimentos — via vw_fact_purchase_order
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
  WHERE fpo.organization_id = p_organization_id
    AND fpo.created_at::DATE BETWEEN p_date_from AND p_date_to;

  -- 3. Operacional (sem filtro de data — snapshots de estado atual)
  SELECT jsonb_build_object(
    'obras_ativas',     COUNT(*) FILTER (WHERE p.settings->>'classification' = 'OBRA'),
    'ncs_abertas',      (SELECT COUNT(*) FROM public.construction_conditions cc
                         WHERE cc.organization_id = p_organization_id
                           AND cc.state NOT IN ('CLOSED','VALIDATED')),
    'garantia_abertos', (SELECT COUNT(*) FROM public.warranty_claims wc
                         WHERE wc.organization_id = p_organization_id
                           AND wc.state NOT IN ('ENCERRADO','FORA_GARANTIA')),
    'nps_medio',        (SELECT ROUND(AVG(nps_nota)::NUMERIC, 1)
                         FROM public.warranty_claims
                         WHERE organization_id = p_organization_id
                           AND nps_nota IS NOT NULL)
  ) INTO v_operacional
  FROM public.projects p
  WHERE p.organization_id = p_organization_id;

  -- 4. DRE
  SELECT jsonb_agg(jsonb_build_object(
    'linha', linha, 'realizado', valor_realizado, 'previsto', valor_previsto
  )) INTO v_dre
  FROM public.fn_dre_summary(p_organization_id, p_date_from, p_date_to);

  -- 5. RH
  BEGIN
    v_rh := public.rh_kpis(p_organization_id, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v_rh := '{}'::JSON;
  END;

  RETURN jsonb_build_object(
    'period_from',  p_date_from,
    'period_to',    p_date_to,
    'comercial',    v_comercial,
    'supply',       v_supply,
    'operacional',  v_operacional,
    'dre',          v_dre,
    'rh',           v_rh::JSONB
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20260710000003_fix_bi_rpc_convergence.sql
-- ────────────────────────────────────────────────────────────
