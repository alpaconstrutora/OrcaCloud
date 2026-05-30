-- ============================================================
-- BI Cross-Módulo — Views e RPC Executivo
-- OrçaCloud SaaS · Migration 20260708000002
-- Nota: projects e purchase_orders usam empresa_id → companies.org_id
--       para chegar ao organization_id (tenant).
--       internal_transactions e warranty_claims têm organization_id direto.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Helper: empresa_id → organization_id via companies
-- ────────────────────────────────────────────────────────────

-- (companies.org_id = organization_id da organização)

-- ────────────────────────────────────────────────────────────
-- 1. VIEW: BI Comercial
--    Fonte: commercial_deals + commercial_properties
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_bi_commercial AS
SELECT
  COALESCE(cp.organization_id, d.organization_id)  AS organization_id,
  COUNT(*)                                           AS total_deals,
  COUNT(*) FILTER (WHERE d.status = 'COMPLETED')    AS deals_fechados,
  COUNT(*) FILTER (WHERE d.status = 'IN_NEGOTIATION') AS deals_negociacao,
  COUNT(*) FILTER (WHERE d.status = 'CANCELLED')    AS deals_cancelados,
  CASE
    WHEN COUNT(*) FILTER (WHERE d.status IN ('COMPLETED','CANCELLED')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE d.status = 'COMPLETED')::NUMERIC
      / COUNT(*) FILTER (WHERE d.status IN ('COMPLETED','CANCELLED')) * 100, 1)
    ELSE NULL
  END                                                AS taxa_conversao_pct,
  COALESCE(SUM(d.value) FILTER (WHERE d.status = 'COMPLETED'), 0) AS vgv_fechado,
  COALESCE(AVG(d.value) FILTER (WHERE d.status = 'COMPLETED'), 0) AS ticket_medio
FROM public.commercial_deals d
LEFT JOIN public.commercial_properties cp ON cp.id = d.property_id
GROUP BY 1;

-- ────────────────────────────────────────────────────────────
-- 2. VIEW: BI Suprimentos
--    Fonte: purchase_orders (sem organization_id; usa empresa_id→companies)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_bi_supply AS
SELECT
  c.org_id                                                      AS organization_id,
  COUNT(*)                                                      AS total_pedidos,
  COUNT(*) FILTER (WHERE po.status = 'Recebido')               AS recebidos,
  COUNT(*) FILTER (WHERE po.status = 'Divergência')            AS divergencias,
  CASE
    WHEN COUNT(*) FILTER (WHERE po.status IN ('Recebido','Divergência')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE po.status = 'Divergência')::NUMERIC
      / COUNT(*) FILTER (WHERE po.status IN ('Recebido','Divergência')) * 100, 1)
    ELSE NULL
  END                                                           AS taxa_divergencia_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (po.status_updated_at::TIMESTAMPTZ - po.created_at::TIMESTAMPTZ))
    / 86400
  ) FILTER (WHERE po.status = 'Recebido' AND po.status_updated_at IS NOT NULL), 1)
                                                                AS lead_time_medio_dias,
  COUNT(*) FILTER (WHERE po.is_financial_approved = true AND po.status = 'Recebido') AS aprovados_financeiro
FROM public.purchase_orders po
JOIN public.companies c ON c.id = po.empresa_id
WHERE po.empresa_id IS NOT NULL
GROUP BY c.org_id;

-- ────────────────────────────────────────────────────────────
-- 3. VIEW: BI Operacional
--    Fonte: projects (usa empresa_id→companies) + conditions + warranty
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_bi_operational AS
WITH obras AS (
  SELECT
    c.org_id                                                         AS organization_id,
    COUNT(*)                                                         AS total_obras,
    COUNT(*) FILTER (WHERE p.settings->>'classification' = 'OBRA')  AS obras_ativas
  FROM public.projects p
  JOIN public.companies c ON c.id = p.empresa_id
  WHERE p.empresa_id IS NOT NULL
  GROUP BY c.org_id
),
qualidade AS (
  SELECT
    organization_id,
    COUNT(*) FILTER (WHERE state NOT IN ('CLOSED','VALIDATED'))           AS ncs_abertas,
    COUNT(*) FILTER (WHERE severity IN ('alta','critica')
                    AND state NOT IN ('CLOSED','VALIDATED'))               AS ncs_criticas
  FROM public.construction_conditions
  GROUP BY organization_id
),
garantia AS (
  SELECT
    organization_id,
    COUNT(*) FILTER (WHERE state NOT IN ('ENCERRADO','FORA_GARANTIA'))    AS chamados_abertos,
    COUNT(*) FILTER (WHERE sla_deadline < CURRENT_DATE
                    AND state NOT IN ('ENCERRADO','FORA_GARANTIA'))        AS chamados_sla_vencido,
    ROUND(AVG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL), 1)           AS nps_medio
  FROM public.warranty_claims
  GROUP BY organization_id
)
SELECT
  o.organization_id,
  o.total_obras,
  o.obras_ativas,
  COALESCE(q.ncs_abertas,          0) AS ncs_abertas,
  COALESCE(q.ncs_criticas,         0) AS ncs_criticas,
  COALESCE(g.chamados_abertos,     0) AS garantia_abertos,
  COALESCE(g.chamados_sla_vencido, 0) AS garantia_sla_vencido,
  g.nps_medio
FROM obras o
LEFT JOIN qualidade q ON q.organization_id = o.organization_id
LEFT JOIN garantia  g ON g.organization_id = o.organization_id;

-- ────────────────────────────────────────────────────────────
-- 4. fn_bi_executive — KPIs consolidados por org + período
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
    'deals_fechados',     COUNT(*) FILTER (WHERE d.status = 'COMPLETED'),
    'taxa_conversao_pct', CASE
      WHEN COUNT(*) FILTER (WHERE d.status IN ('COMPLETED','CANCELLED')) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE d.status='COMPLETED')::NUMERIC
           / COUNT(*) FILTER (WHERE d.status IN ('COMPLETED','CANCELLED')) * 100, 1)
      ELSE NULL END,
    'vgv_fechado',  COALESCE(SUM(d.value) FILTER (WHERE d.status='COMPLETED'), 0),
    'ticket_medio', COALESCE(AVG(d.value) FILTER (WHERE d.status='COMPLETED'), 0)
  ) INTO v_comercial
  FROM public.commercial_deals d
  LEFT JOIN public.commercial_properties cp ON cp.id = d.property_id
  WHERE COALESCE(d.organization_id, cp.organization_id) = p_organization_id
    AND d.date BETWEEN p_date_from AND p_date_to;

  -- 2. Suprimentos (empresa_id → companies.org_id)
  SELECT jsonb_build_object(
    'total_pedidos',  COUNT(*),
    'recebidos',      COUNT(*) FILTER (WHERE po.status = 'Recebido'),
    'divergencias',   COUNT(*) FILTER (WHERE po.status = 'Divergência'),
    'taxa_divergencia_pct', CASE
      WHEN COUNT(*) FILTER (WHERE po.status IN ('Recebido','Divergência')) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE po.status='Divergência')::NUMERIC
           / COUNT(*) FILTER (WHERE po.status IN ('Recebido','Divergência')) * 100, 1)
      ELSE NULL END,
    'lead_time_medio_dias', ROUND(AVG(
      EXTRACT(EPOCH FROM (po.status_updated_at::TIMESTAMPTZ - po.created_at))
      / 86400
    ) FILTER (WHERE po.status='Recebido' AND po.status_updated_at IS NOT NULL), 1)
  ) INTO v_supply
  FROM public.purchase_orders po
  JOIN public.companies c ON c.id = po.empresa_id
  WHERE c.org_id = p_organization_id
    AND po.created_at::DATE BETWEEN p_date_from AND p_date_to;

  -- 3. Operacional
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
  JOIN public.companies c ON c.id = p.empresa_id
  WHERE c.org_id = p_organization_id;

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
-- 5. fn_bi_trend — Tendência mensal (12 meses)
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
  )
  SELECT
    TO_CHAR(mo.m, 'MM/YYYY') AS mes,
    COALESCE(SUM(it.amount) FILTER (
      WHERE it.direction = 'CREDIT' AND it.status = 'CONCILIATED' AND fc.nature = 'REVENUE'
    ), 0) AS receita,
    COALESCE(SUM(it.amount) FILTER (
      WHERE it.direction = 'DEBIT' AND it.status = 'CONCILIATED' AND fc.nature IN ('COST','EXPENSE')
    ), 0) AS custo,
    COALESCE(SUM(it.amount) FILTER (
      WHERE it.direction='CREDIT' AND it.status='CONCILIATED' AND fc.nature='REVENUE'), 0)
    - COALESCE(SUM(it.amount) FILTER (
      WHERE it.direction='DEBIT'  AND it.status='CONCILIATED' AND fc.nature IN ('COST','EXPENSE')), 0)
    AS ebitda,
    -- Pedidos via empresa_id → companies
    COALESCE((SELECT COUNT(*) FROM public.purchase_orders po
      JOIN public.companies c ON c.id = po.empresa_id
      WHERE c.org_id = p_organization_id
        AND DATE_TRUNC('month', po.created_at) = mo.m), 0) AS pedidos,
    -- Deals fechados
    COALESCE((SELECT COUNT(*) FROM public.commercial_deals d
      LEFT JOIN public.commercial_properties cp ON cp.id = d.property_id
      WHERE COALESCE(d.organization_id, cp.organization_id) = p_organization_id
        AND d.status = 'COMPLETED'
        AND DATE_TRUNC('month', d.date::TIMESTAMPTZ) = mo.m), 0) AS deals_fechados,
    -- Obras ativas (criadas até o fim do mês, via empresa_id)
    COALESCE((SELECT COUNT(*) FROM public.projects p
      JOIN public.companies c ON c.id = p.empresa_id
      WHERE c.org_id = p_organization_id
        AND p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= (mo.m + INTERVAL '1 month - 1 day')::DATE), 0) AS obras_ativas
  FROM months mo
  LEFT JOIN public.internal_transactions it
    ON it.organization_id = p_organization_id
    AND DATE_TRUNC('month', it.transaction_date::TIMESTAMPTZ) = mo.m
    AND it.status <> 'CANCELLED'
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  GROUP BY mo.m
  ORDER BY mo.m;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20260708000002_bi_executive_views.sql
-- ────────────────────────────────────────────────────────────
