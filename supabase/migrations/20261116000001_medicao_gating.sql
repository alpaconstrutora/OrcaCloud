-- Fase 3a: Pagamento por Medição com gating de liberação financeira
-- Adiciona modalidade de faturamento no contrato e workflow de aprovação na medição

-- 1. contracts: modalidade de faturamento + checklist de exigências de liberação
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS billing_mode TEXT
    CHECK (billing_mode IN ('MEDICAO','ETAPA','SINAL_PARCELAS','COST_PLUS')),
  ADD COLUMN IF NOT EXISTS release_requirements JSONB DEFAULT '{"require_invoice":false,"require_evidence":false,"require_approval":false}'::jsonb;

-- Contratos do tipo "Contrato por Medição" ganham billing_mode automaticamente
UPDATE contracts
  SET billing_mode = 'MEDICAO'
  WHERE contract_type = 'Contrato por Medição'
    AND billing_mode IS NULL;

-- 2. contract_measurements: modo de medição + campos de aprovação/rejeição
ALTER TABLE contract_measurements
  ADD COLUMN IF NOT EXISTS measurement_mode TEXT
    NOT NULL DEFAULT 'QUANTITATIVO'
    CHECK (measurement_mode IN ('QUANTITATIVO','PERCENTUAL','HIBRIDO')),
  ADD COLUMN IF NOT EXISTS approved_by  TEXT,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. contract_measurement_items: suporte a medição percentual/híbrida
ALTER TABLE contract_measurement_items
  ADD COLUMN IF NOT EXISTS percent_executed NUMERIC(5,2) CHECK (percent_executed >= 0 AND percent_executed <= 100),
  ADD COLUMN IF NOT EXISTS item_mode TEXT
    NOT NULL DEFAULT 'QUANTITATIVO'
    CHECK (item_mode IN ('QUANTITATIVO','PERCENTUAL'));
