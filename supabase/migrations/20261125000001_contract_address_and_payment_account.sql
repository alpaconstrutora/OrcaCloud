-- Endereço de execução estruturado e conta bancária no contrato de serviço

-- Campos de endereço estruturado (substituem o campo de texto livre execution_address)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS execution_street       TEXT,
  ADD COLUMN IF NOT EXISTS execution_number       TEXT,
  ADD COLUMN IF NOT EXISTS execution_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS execution_city         TEXT,
  ADD COLUMN IF NOT EXISTS execution_state        TEXT,
  ADD COLUMN IF NOT EXISTS execution_zip          TEXT;

-- Conta bancária vinculada ao contrato (para dados de recebimento)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_payment_account ON public.contracts(payment_account_id)
  WHERE payment_account_id IS NOT NULL;
