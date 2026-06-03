-- =============================================================================
-- Gestão de Contratos MVP
-- =============================================================================
-- 1. Adiciona status 'Assinado' ao workflow
-- 2. Adiciona client_id para contratos voltados ao cliente (saída)
-- 3. Adiciona direction para separar: OUTGOING (cliente) vs INCOMING (fornecedor)
-- =============================================================================

-- 1. Workflow: rascunho → enviado → assinado → ativo → encerrado
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('Rascunho', 'Enviado', 'Assinado', 'Ativo', 'Suspenso', 'Encerrado', 'Cancelado'));

-- 2. Referência ao cliente (para contratos emitidos para clientes)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- 3. Direção do contrato: OUTGOING = emitido para cliente; INCOMING = recebido de fornecedor
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'INCOMING'
    CHECK (direction IN ('OUTGOING', 'INCOMING'));

CREATE INDEX IF NOT EXISTS idx_contracts_direction ON public.contracts(organization_id, direction);
CREATE INDEX IF NOT EXISTS idx_contracts_client    ON public.contracts(client_id) WHERE client_id IS NOT NULL;

-- Contratos que já têm supplier_id são INCOMING; os sem supplier são ambíguos — deixamos INCOMING como padrão seguro
-- O módulo Gestão de Contratos filtra direction='OUTGOING'
