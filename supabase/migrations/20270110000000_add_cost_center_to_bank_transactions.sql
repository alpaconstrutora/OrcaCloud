-- Add cost_center_id column to bank_transactions table (coluna "Centro de Custo" na
-- aba Extrato Bancário). Espelha o mesmo padrão de project_id/category já existente
-- (ver 20260525000000_add_bank_project_category.sql). Idempotente.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'cost_center_id'
  ) THEN
    ALTER TABLE bank_transactions ADD COLUMN cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_cost_center_id ON bank_transactions(cost_center_id);

COMMIT;
