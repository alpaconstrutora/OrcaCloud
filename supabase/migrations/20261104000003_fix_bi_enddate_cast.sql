-- ============================================================
-- Corrige crash do fn_bi_executive em obras com endDate inválido
-- OrçaCloud SaaS · Migration 20261104000003
--
-- Causa-raiz: o ProjectModal grava settings.endDate = '' (string
-- vazia) para toda obra sem data de término. O bloco operacional de
-- fn_bi_executive (migration 20261101000002) só tratava IS NULL, então
-- ''::DATE lançava "invalid input syntax for type date" e derrubava a
-- RPC inteira → BI Executivo em branco para a organização toda.
--
-- Correção: cast defensivo via CASE (ordem de avaliação garantida),
-- tratando string vazia, timestamp ISO ("YYYY-MM-DDTHH:MM:SS") e
-- valores não reconhecidos como data (obra considerada em andamento).
-- Idempotente (CREATE OR REPLACE).
-- ============================================================

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

  -- 3. Operacional — com filtro temporal e cast defensivo de endDate
  --    obra ativa no período = criada até p_date_to e não finalizada antes de p_date_from
  SELECT jsonb_build_object(
    'obras_ativas', COUNT(*) FILTER (
      WHERE p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= p_date_to
        AND CASE
              -- sem data fim (NULL ou string vazia) → ainda em andamento
              WHEN NULLIF(p.settings->>'endDate', '') IS NULL THEN TRUE
              -- aceita 'YYYY-MM-DD' ou 'YYYY-MM-DDThh:mm:ss' usando os 10 primeiros chars
              WHEN LEFT(p.settings->>'endDate', 10) ~ '^\d{4}-\d{2}-\d{2}$'
                THEN LEFT(p.settings->>'endDate', 10)::DATE >= p_date_from
              -- valor não reconhecido como data → trata como em andamento (não derruba a RPC)
              ELSE TRUE
            END
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
-- FIM: 20261104000003_fix_bi_enddate_cast.sql
-- ────────────────────────────────────────────────────────────
