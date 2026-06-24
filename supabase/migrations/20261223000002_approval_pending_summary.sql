-- ============================================================
-- ÒPURA Approval — Fase 3: visibilidade de pendências (soft)
-- OrçaCloud SaaS · Migration 20261223000002
-- Idempotente (Regra de Ouro 10).
--
-- Enforcement SOFT (decisão do cliente): nada é bloqueado. Em vez
-- disso, expõe os itens que CAEM EM UMA FAIXA de aprovação
-- (financial_approval_config) mas ainda NÃO estão APROVADO. Itens
-- abaixo do piso de faixa não entram (não exigem aprovação).
--
-- Read-only. Alimenta o indicador/alerta na UI (FinancialApprovalModule).
-- Abrange financeiro (saídas) e contratos; compras entram na Fase 2.
-- ============================================================

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
    'transaction'::text                       AS entity,
    COUNT(*)::bigint                          AS qtd,
    COALESCE(SUM(t.amount), 0)::numeric       AS soma
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
    );
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000002_approval_pending_summary.sql
-- ────────────────────────────────────────────────────────────
