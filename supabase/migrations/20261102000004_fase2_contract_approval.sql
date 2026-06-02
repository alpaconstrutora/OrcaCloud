-- =============================================================================
-- Fase 2.2 — Aprovação multinível de contratos (1–2 níveis)
-- =============================================================================
-- Decisão: máx. 2 níveis (gestor → financeiro/diretoria). 4 níveis viram
-- gargalo e matam adoção (lição do módulo Incentivos).
-- approval_chain: JSONB array [{ level, role, approved_by, approved_at, notes }]
-- =============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    DEFAULT 'RASCUNHO'
    CHECK (approval_status IN ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO')),
  ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required_levels INTEGER DEFAULT 1
    CHECK (approval_required_levels IN (1, 2));

COMMENT ON COLUMN public.contracts.approval_status IS
  'Status do fluxo de aprovação: RASCUNHO → PENDENTE → APROVADO/REJEITADO';
COMMENT ON COLUMN public.contracts.approval_chain IS
  'Array JSONB com histórico de aprovações: [{level, role, approved_by, approved_at, notes, action}]';
COMMENT ON COLUMN public.contracts.approval_required_levels IS
  '1 = aprovação simples (gestor); 2 = dupla (gestor + financeiro/diretoria)';

CREATE INDEX IF NOT EXISTS idx_contracts_approval_status
  ON public.contracts(approval_status);
