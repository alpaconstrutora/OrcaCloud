-- ============================================================
-- ÒPURA Approval — Fase 3 (loop de ação): fila acionável
-- OrçaCloud SaaS · Migration 20261223000004
-- Idempotente (Regra de Ouro 10).
--
-- O banner/card contam itens "acima da faixa e não APROVADO"
-- (inclui RASCUNHO), mas a fila antiga só listava PENDENTE — clicar
-- no aviso levava a uma fila vazia. Esta função retorna os itens
-- FINANCEIROS (saídas) que precisam de AÇÃO: RASCUNHO (a submeter)
-- ou PENDENTE (a aprovar), desde que caiam em uma faixa de alçada.
-- Rejeitados/aprovados ficam de fora.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_approval_action_queue(uuid);

CREATE OR REPLACE FUNCTION public.fn_approval_action_queue(
  p_organization_id UUID
)
RETURNS TABLE (
  id                       UUID,
  organization_id          UUID,
  transaction_date         DATE,
  due_date                 DATE,
  amount                   NUMERIC,
  description              TEXT,
  party_name               TEXT,
  project_name             TEXT,
  approval_status          TEXT,
  approval_chain           JSONB,
  approval_required_levels INT,
  business_status          TEXT,
  created_at               TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.organization_id,
    t.transaction_date::date,
    t.due_date::date,
    t.amount,
    t.description,
    t.party_name,
    p.name AS project_name,
    COALESCE(t.approval_status, 'RASCUNHO')        AS approval_status,
    COALESCE(t.approval_chain, '[]'::jsonb)        AS approval_chain,
    COALESCE(t.approval_required_levels, 1)        AS approval_required_levels,
    t.business_status,
    t.created_at
  FROM public.internal_transactions t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.organization_id = p_organization_id
    AND t.direction = 'DEBIT'
    AND COALESCE(t.approval_status, 'RASCUNHO') IN ('RASCUNHO', 'PENDENTE')
    AND EXISTS (
      SELECT 1 FROM public.financial_approval_config c
      WHERE c.organization_id = p_organization_id
        AND c.is_active
        AND t.amount >= c.faixa_min
        AND (c.faixa_max IS NULL OR t.amount < c.faixa_max)
    )
  ORDER BY t.due_date NULLS LAST, t.amount DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000004_approval_action_queue.sql
-- ────────────────────────────────────────────────────────────
