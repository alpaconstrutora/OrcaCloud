-- ============================================================
-- Corrige divergências #7 (base temporal) e #3 (origem de vendas)
-- OrçaCloud SaaS · Migration 20261101000002
--
-- #7 — fn_bi_executive: bloco operacional agora respeita o período
--      (obras criadas até p_date_to, não finalizadas antes de p_date_from)
-- #3 — vw_fact_deal expõe origin_channel para o gráfico de canais
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. vw_fact_deal — adiciona origin_channel
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_fact_deal AS
SELECT
  d.id,
  COALESCE(d.organization_id, cp.organization_id) AS organization_id,
  d.property_id,
  d.client_id,
  d.type,
  d.status,
  d.value,
  d.date                                           AS deal_date,
  d.origin_channel,
  (d.type = 'SALE')                                AS is_venda,
  (d.status = 'COMPLETED')                         AS is_fechado,
  (d.type = 'SALE' AND d.status = 'COMPLETED')     AS is_vgv,
  (d.status = 'CANCELLED')                         AS is_cancelado,
  (d.status IN ('COMPLETED', 'CANCELLED'))          AS in_conversao_base,
  d.created_at
FROM public.commercial_deals d
LEFT JOIN public.commercial_properties cp ON cp.id = d.property_id;

-- ────────────────────────────────────────────────────────────
-- 2. fn_bi_executive — bloco operacional com filtro temporal
--    Obras ativas no período:
--      • criadas até p_date_to
--      • não finalizadas antes de p_date_from
--        (settings->>'endDate' IS NULL  →  ainda em andamento
--         settings->>'endDate' >= p_date_from  →  terminou dentro ou depois do período)
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
  WHERE fd.organization_id = p_organization_id
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
  WHERE fpo.organization_id = p_organization_id
    AND fpo.created_at::DATE BETWEEN p_date_from AND p_date_to;

  -- 3. Operacional — com filtro temporal
  --    obra ativa no período = criada até p_date_to e não finalizada antes de p_date_from
  SELECT jsonb_build_object(
    'obras_ativas', COUNT(*) FILTER (
      WHERE p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= p_date_to
        AND (
          (p.settings->>'endDate') IS NULL
          OR (p.settings->>'endDate')::DATE >= p_date_from
        )
    ),
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
-- FIM: 20261101000002_fix_bi_temporal_and_origin_channel.sql
-- ────────────────────────────────────────────────────────────
