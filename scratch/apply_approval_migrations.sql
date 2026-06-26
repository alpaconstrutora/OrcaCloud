-- ============================================================
-- APLICAÇÃO MANUAL — Módulo Aprovação (Fases 0, 3, 2)
-- Cole no SQL Editor do Supabase e rode. Idempotente.
-- Aplica SÓ as 3 migrations de aprovação, sem o lote pendente.
-- ============================================================

-- ============================================================
-- ÒPURA Approval — Fase 0: faixas de aprovação default
-- OrçaCloud SaaS · Migration 20261223000001
-- Idempotente (Regra de Ouro 10).
--
-- Diagnóstico (2026-06-23): o fluxo de aprovação financeiro nunca
-- foi usado (291 lançamentos, 100% RASCUNHO) e nenhuma organização
-- tem faixa configurada em financial_approval_config. Sem ao menos
-- uma faixa, fn_resolve_approval_levels não resolve nada e o portão
-- soft (Fase 3) seria inócuo.
--
-- Aqui: para TODA organização SEM config, semeia 2 faixas default:
--   abaixo de 5.000  → SEM faixa = nenhuma aprovação exigida (fn retorna NULL)
--   5.000 – 50.000   → 1 nível  (Gestor)
--   50.000+          → 2 níveis (Gestor + Diretoria)
-- Não há faixa cobrindo [0, 5.000): abaixo do piso, fn_resolve_approval_levels
-- retorna NULL e nada é exigido (o modelo não suporta "0 níveis").
-- São apenas sementes — editáveis na tela (FinancialApprovalModule).
-- NÃO altera orgs que já configuraram (preserva escolha do cliente).
-- ============================================================

INSERT INTO public.financial_approval_config
  (organization_id, faixa_min, faixa_max, required_levels, level1_label, level2_label, is_active, sort_order)
SELECT
  o.id, b.faixa_min, b.faixa_max, b.required_levels, b.level1_label, b.level2_label, true, b.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  (5000::numeric,  50000::numeric, 1, 'Gestor'::text, NULL::text,        1),
  (50000::numeric, NULL::numeric,  2, 'Gestor'::text, 'Diretoria'::text, 2)
) AS b(faixa_min, faixa_max, required_levels, level1_label, level2_label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_approval_config c
  WHERE c.organization_id = o.id
);

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000001_approval_default_bands.sql
-- ────────────────────────────────────────────────────────────


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
