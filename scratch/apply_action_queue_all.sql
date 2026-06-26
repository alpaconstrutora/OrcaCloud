-- ============================================================
-- ÒPURA Approval — Fase 3: fila acionável multi-entidade
-- OrçaCloud SaaS · Migration 20261223000005
-- Idempotente (Regra de Ouro 10).
--
-- Generaliza fn_approval_action_queue para TRANSAÇÕES + CONTRATOS +
-- COMPRAS (antes só financeiro), com discriminador `entity`, para a
-- fila bater com o banner/card. Também alinha fn_approval_pending_summary
-- a IN ('RASCUNHO','PENDENTE') — exclui REJEITADO — para o número do
-- banner igualar o da fila (itens acionáveis).
-- ============================================================

-- ── 1. Fila acionável (3 entidades) ──────────────────────────
DROP FUNCTION IF EXISTS public.fn_approval_action_queue(uuid);

CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  entity                   TEXT,
  id                       UUID,
  title                    TEXT,
  party_name               TEXT,
  project_name             TEXT,
  amount                   NUMERIC,
  due_date                 DATE,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- TRANSAÇÕES (saídas)
  SELECT
    'transaction'::text,
    t.id,
    COALESCE(NULLIF(t.description, ''), '(sem descrição)'),
    t.party_name,
    p.name,
    t.amount,
    t.due_date::date,
    COALESCE(t.approval_status, 'RASCUNHO'),
    COALESCE(t.approval_chain, '[]'::jsonb),
    COALESCE(t.approval_required_levels, 1)
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = p_organization_id
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id AND c.is_active
        AND t.amount >= c.faixa_min AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )

  UNION ALL

  -- CONTRATOS
  SELECT
    'contract'::text,
    k.id,
    COALESCE(NULLIF(k.title, ''), 'Contrato ' || COALESCE(k.number, '')),
    COALESCE(s.name, cl.name),
    p.name,
    k.current_value,
    NULL::date,
    COALESCE(k.approval_status, 'RASCUNHO'),
    COALESCE(k.approval_chain, '[]'::jsonb),
    COALESCE(k.approval_required_levels, 1)
  FROM public.contracts k
  LEFT JOIN public.projects  p  ON p.id  = k.project_id
  LEFT JOIN public.suppliers s  ON s.id  = k.supplier_id
  LEFT JOIN public.clients   cl ON cl.id = k.client_id
  WHERE k.organization_id = p_organization_id
    AND COALESCE(k.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id AND c.is_active
        AND k.current_value >= c.faixa_min AND (c.faixa_max IS NULL OR k.current_value < c.faixa_max)
    )

  UNION ALL

  -- COMPRAS (purchase_orders) — valor = Σ items[].total; escopo via empresa→org
  SELECT
    'purchase_order'::text,
    po.id,
    'Pedido ' || COALESCE(po.number, ''),
    s.name,
    p.name,
    po_total.v,
    NULL::date,
    COALESCE(po.approval_status, 'RASCUNHO'),
    COALESCE(po.approval_chain, '[]'::jsonb),
    COALESCE(po.approval_required_levels, 1)
  FROM public.purchase_orders po
  JOIN public.companies cmp ON cmp.id = po.empresa_id
  LEFT JOIN public.projects  p ON p.id = po.project_id
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM((it->>'total')::numeric), 0) AS v
    FROM jsonb_array_elements(COALESCE(po.items, '[]'::jsonb)) it
  ) po_total
  WHERE cmp.org_id = p_organization_id
    AND COALESCE(po.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id AND c.is_active
        AND po_total.v >= c.faixa_min AND (c.faixa_max IS NULL OR po_total.v < c.faixa_max)
    )

  ORDER BY due_date NULLS LAST, amount DESC;
$$;

-- ── 2. Resumo alinhado à fila (exclui REJEITADO) ─────────────
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
  SELECT q.entity, COUNT(*)::bigint, COALESCE(SUM(q.amount), 0)::numeric
  FROM public.fn_approval_action_queue(p_organization_id) q
  GROUP BY q.entity;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000005_approval_action_queue_all.sql
-- ────────────────────────────────────────────────────────────
