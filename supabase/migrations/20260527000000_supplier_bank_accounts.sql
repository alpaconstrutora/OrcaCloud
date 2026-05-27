-- ============================================================
-- Dados bancários de fornecedores (MVP)
-- Suporte a múltiplas contas, PIX, favorecido e conta principal
-- ============================================================

CREATE TABLE public.supplier_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id),

  -- Dados bancários
  bank_code       text,
  bank_name       text,
  agency          text,
  agency_digit    text,
  account         text,
  account_digit   text,
  account_type    text NOT NULL DEFAULT 'corrente'
                       CHECK (account_type IN ('corrente','poupanca','pagamento')),

  -- Favorecido (pode ser diferente do fornecedor)
  beneficiary_name     text,
  beneficiary_document text,   -- CPF ou CNPJ do favorecido

  -- PIX
  pix_key         text,
  pix_key_type    text CHECK (pix_key_type IN ('cpf','cnpj','email','telefone','aleatoria')),
  is_pix_primary  boolean NOT NULL DEFAULT false,

  -- Controle
  is_primary      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  notes           text,

  -- Auditoria
  created_by      uuid REFERENCES auth.users(id),
  updated_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Índice unicidade: apenas 1 conta principal ativa por fornecedor
CREATE UNIQUE INDEX uniq_supplier_primary_account
  ON public.supplier_bank_accounts(supplier_id)
  WHERE is_primary = true AND status = 'ativo';

-- Índice unicidade: apenas 1 PIX principal por fornecedor
CREATE UNIQUE INDEX uniq_supplier_pix_primary
  ON public.supplier_bank_accounts(supplier_id)
  WHERE is_pix_primary = true AND status = 'ativo';

-- Índice geral para listagem por fornecedor
CREATE INDEX idx_supplier_bank_accounts_supplier_id
  ON public.supplier_bank_accounts(supplier_id);

-- RLS
ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Membros da organização podem ler/escrever
CREATE POLICY "sba_org_member_access" ON public.supplier_bank_accounts
  FOR ALL USING (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = supplier_bank_accounts.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Só cria o trigger se a função moddatetime não estiver disponível
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'moddatetime') THEN
    CREATE TRIGGER set_updated_at_sba
      BEFORE UPDATE ON public.supplier_bank_accounts
      FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
  ELSE
    CREATE TRIGGER set_updated_at_sba
      BEFORE UPDATE ON public.supplier_bank_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
