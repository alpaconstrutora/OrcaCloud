-- ============================================================
-- Fluxo de Aprovação por Faixas — Fase 3 do ÒPURA Financeiro
-- OrçaCloud SaaS · Migration 20261118000003
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabela de configuração de faixas por organização
--    Cada linha define um nível de alçada por faixa de valor.
--    Exemplo:
--      faixa_min=0,     faixa_max=5000,  required_levels=1  → Gestor
--      faixa_min=5000,  faixa_max=50000, required_levels=2  → Gestor + Financeiro
--      faixa_min=50000, faixa_max=null,  required_levels=2  → Gestor + Diretoria
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_approval_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  faixa_min        numeric(15,2) NOT NULL DEFAULT 0,
  faixa_max        numeric(15,2),        -- NULL = sem limite superior
  required_levels  int NOT NULL DEFAULT 1 CHECK (required_levels IN (1, 2)),
  level1_label     text NOT NULL DEFAULT 'Gestor',
  level2_label     text DEFAULT 'Financeiro / Diretoria',
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_approval_config_org
  ON public.financial_approval_config (organization_id)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.financial_approval_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_approval_config_org_member" ON public.financial_approval_config;
CREATE POLICY "financial_approval_config_org_member"
  ON public.financial_approval_config
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = financial_approval_config.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. Colunas de aprovação em internal_transactions
--    Mesmo padrão dos contratos (approval_chain JSONB).
--    Aplica-se ao lado AP (direction='DEBIT') mas as colunas
--    ficam na tabela para não adicionar complexidade de join.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS approval_status
    TEXT DEFAULT 'RASCUNHO'
    CHECK (approval_status IN ('RASCUNHO','PENDENTE','APROVADO','REJEITADO')),
  ADD COLUMN IF NOT EXISTS approval_chain
    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required_levels
    INT DEFAULT 1 CHECK (approval_required_levels IN (1, 2));

-- Índice para a fila de aprovações pendentes
CREATE INDEX IF NOT EXISTS idx_internal_txs_approval_pending
  ON public.internal_transactions (organization_id, direction, approval_status)
  WHERE approval_status = 'PENDENTE';

-- ────────────────────────────────────────────────────────────
-- 3. fn_resolve_approval_levels — resolve faixas para um valor
--    Retorna required_levels + labels da faixa que contém o valor.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_resolve_approval_levels(uuid, numeric);

CREATE OR REPLACE FUNCTION public.fn_resolve_approval_levels(
  p_organization_id UUID,
  p_amount          NUMERIC
)
RETURNS TABLE (
  required_levels  INT,
  level1_label     TEXT,
  level2_label     TEXT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.required_levels,
    c.level1_label,
    c.level2_label
  FROM public.financial_approval_config c
  WHERE c.organization_id = p_organization_id
    AND c.is_active = true
    AND p_amount >= c.faixa_min
    AND (c.faixa_max IS NULL OR p_amount < c.faixa_max)
  ORDER BY c.faixa_min DESC
  LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261118000003_financial_approval.sql
-- ────────────────────────────────────────────────────────────
