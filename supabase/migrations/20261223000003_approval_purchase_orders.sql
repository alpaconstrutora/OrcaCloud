-- ============================================================
-- ÒPURA Approval — Fase 2: compras entram no modelo unificado
-- OrçaCloud SaaS · Migration 20261223000003
-- Idempotente (Regra de Ouro 10).
--
-- purchase_orders ganha a mesma primitiva de aprovação de contratos
-- e transações (approval_status/chain/required_levels). O valor da PO
-- é derivado de items[].total (não há coluna de total). O escopo é por
-- empresa_id → companies.org_id (a PO não tem organization_id).
--
-- is_financial_approved (boolean pós-recebimento) é PRESERVADO e segue
-- independente — semântica distinta (Regra de Ouro 12); a reconciliação
-- dos dois fica para depois.
-- ============================================================

-- 1. Colunas de aprovação multinível (espelha contratos)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    DEFAULT 'RASCUNHO'
    CHECK (approval_status IN ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO')),
  ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required_levels INTEGER DEFAULT 1
    CHECK (approval_required_levels IN (1, 2));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_approval_status
  ON public.purchase_orders(approval_status);

-- 2. fn_approval_pending_summary — agora inclui COMPRAS (purchase_orders).
--    Valor = soma de items[].total; escopo via empresa_id → companies.org_id.
DROP FUNCTION IF EXISTS public.fn_approval_pending_summary(uuid);

CREATE OR REPLACE FUNCTION public.fn_approval_pending_summary(
  p_organization_id UUID
)
RETURNS TABLE (
  entity TEXT,
  qtd    BIGINT,
  soma   NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- Saídas financeiras (DEBIT) acima de faixa e não aprovadas
  SELECT
    'transaction'::text                 AS entity,
    COUNT(*)::bigint                    AS qtd,
    COALESCE(SUM(t.amount), 0)::numeric AS soma
  FROM public.internal_transactions t
  WHERE t.organization_id = p_organization_id
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') <> 'APROVADO'
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id
        AND c.is_active
        AND t.amount >= c.faixa_min
        AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- Contratos acima de faixa e não aprovados
  SELECT
    'contract'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(k.current_value), 0)::numeric
  FROM public.contracts k
  WHERE k.organization_id = p_organization_id
    AND COALESCE(k.approval_status, 'RASCUNHO') <> 'APROVADO'
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id
        AND c.is_active
        AND k.current_value >= c.faixa_min
        AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- Compras (purchase_orders) acima de faixa e não aprovadas.
  -- Valor = Σ items[].total; escopo via empresa_id → companies.org_id.
  -- POs sem empresa_id não são atribuídas a uma org (excluídas nesta v1).
  SELECT
    'purchase_order'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(po_total.v), 0)::numeric
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM((it->>'total')::numeric), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = p_organization_id
    AND COALESCE(po.approval_status, 'RASCUNHO') <> 'APROVADO'
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id
        AND c.is_active
        AND po_total.v >= c.faixa_min
        AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    );
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000003_approval_purchase_orders.sql
-- ────────────────────────────────────────────────────────────
