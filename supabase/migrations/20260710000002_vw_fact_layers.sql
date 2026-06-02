-- ============================================================
-- Camada de Fatos — vw_fact_*
-- OrçaCloud SaaS · Migration 20260710000002
--
-- Objetivo: fonte única de verdade para todas as métricas de BI.
-- Nenhuma tela/RPC usa estas views diretamente ainda; isso vem no PR3.
--
-- Decisões de negócio fixadas aqui (acordadas 2026-06-01):
--   • VGV / "venda fechada" = deals com type='SALE' AND status='COMPLETED'
--   • "Receita" nos gráficos = dre_group='RECEITA_BRUTA' (sem rec. financeira/venda de ativo)
--   • EBITDA = fórmula do DRE (RB − deduções − custos − desp. adm/comercial)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. vw_fact_financial_tx
--    Grão: 1 linha por internal_transaction
--    Fonte canônica de DRE, fluxo de caixa e tendência.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_fact_financial_tx AS
SELECT
  it.id,
  it.organization_id,
  it.transaction_date,
  it.direction,                                             -- 'CREDIT' | 'DEBIT'
  it.status,                                               -- 'CONCILIATED' | 'PENDING' | 'CANCELLED'
  it.amount,
  it.category_id,
  COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
  COALESCE(fc.nature,    'EXPENSE')           AS nature,
  COALESCE(fc.name, it.category, 'Sem categoria') AS category_name,
  COALESCE(fc.sort_order, 99)                 AS sort_order,
  it.source_system,
  it.reference_id,
  it.description,
  -- flags derivados para facilitar agregação
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount
    ELSE 0
  END AS credit_realizado,
  CASE
    WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount
    ELSE 0
  END AS debit_realizado,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount
    ELSE 0
  END AS credit_previsto,
  CASE
    WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount
    ELSE 0
  END AS debit_previsto,
  -- contribuição DRE: crédito positivo, débito negativo (já considera direction)
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount
    ELSE 0
  END AS net_realizado,
  CASE
    WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN  it.amount
    WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN -it.amount
    ELSE 0
  END AS net_previsto
FROM public.internal_transactions it
LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
WHERE it.status <> 'CANCELLED';

-- ────────────────────────────────────────────────────────────
-- 2. vw_fact_deal
--    Grão: 1 linha por commercial_deal
--    Fonte canônica de VGV, taxa de conversão, pipeline.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_fact_deal AS
SELECT
  d.id,
  COALESCE(d.organization_id, cp.organization_id) AS organization_id,
  d.property_id,
  d.client_id,
  d.type,                   -- 'SALE' | 'RENT'
  d.status,                 -- 'COMPLETED' | 'IN_NEGOTIATION' | 'CANCELLED'
  d.value,
  d.date                    AS deal_date,
  -- flags de negócio (decisão: VGV = type='SALE' AND status='COMPLETED')
  (d.type = 'SALE')                                             AS is_venda,
  (d.status = 'COMPLETED')                                      AS is_fechado,
  (d.type = 'SALE' AND d.status = 'COMPLETED')                  AS is_vgv,
  (d.status = 'CANCELLED')                                      AS is_cancelado,
  -- para taxa de conversão: denominador correto = COMPLETED + CANCELLED
  (d.status IN ('COMPLETED', 'CANCELLED'))                      AS in_conversao_base,
  d.created_at
FROM public.commercial_deals d
LEFT JOIN public.commercial_properties cp ON cp.id = d.property_id;

-- ────────────────────────────────────────────────────────────
-- 3. vw_fact_purchase_order
--    Grão: 1 linha por purchase_order
--    Fonte canônica de suprimentos: divergência, lead time, aprovação.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_fact_purchase_order AS
SELECT
  po.id,
  -- organization_id direto (disponível após PR1 / migration 20260710000001)
  po.organization_id,
  po.empresa_id,
  po.project_id,
  po.status,
  po.created_at,
  po.status_updated_at,
  po.is_financial_approved,
  -- flags de negócio
  (po.status = 'Recebido')                                      AS is_recebido,
  (po.status = 'Divergência')                                   AS is_divergencia,
  (po.status IN ('Recebido', 'Divergência'))                    AS is_fechado,
  -- lead time em dias (só para pedidos efetivamente recebidos)
  CASE
    WHEN po.status = 'Recebido' AND po.status_updated_at IS NOT NULL
    THEN ROUND(
      EXTRACT(EPOCH FROM (po.status_updated_at::TIMESTAMPTZ - po.created_at::TIMESTAMPTZ))
      / 86400.0, 1)
    ELSE NULL
  END AS lead_time_dias
FROM public.purchase_orders po;

-- ────────────────────────────────────────────────────────────
-- FIM: 20260710000002_vw_fact_layers.sql
-- ────────────────────────────────────────────────────────────
