-- =============================================================================
-- Fase 1.1 — Snapshot do orçamento contratado
-- =============================================================================
-- Reusa o padrão de budget_item_ref JSONB do módulo Operacional:
-- ao criar/salvar um contrato com budget_id, congela o estado do orçamento
-- naquele momento. Não vira tabela nova — é JSONB na própria linha.
-- =============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS budget_snapshot JSONB;

COMMENT ON COLUMN public.contracts.budget_snapshot IS
  'Snapshot congelado do orçamento (projects.budget[]) no momento da criação/assinatura. Preserva rastreabilidade mesmo que o orçamento original seja alterado.';
