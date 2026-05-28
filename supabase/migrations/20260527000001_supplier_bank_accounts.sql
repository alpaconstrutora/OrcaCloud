-- ============================================================
-- Dados bancários de fornecedores (MVP)
-- Suporte a múltiplas contas, PIX, favorecido e conta principal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_bank_accounts (
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
  beneficiary_document text,

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
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supplier_primary_account
  ON public.supplier_bank_accounts(supplier_id)
  WHERE is_primary = true AND status = 'ativo';

-- Índice unicidade: apenas 1 PIX principal por fornecedor
CREATE UNIQUE INDEX IF NOT EXISTS uniq_supplier_pix_primary
  ON public.supplier_bank_accounts(supplier_id)
  WHERE is_pix_primary = true AND status = 'ativo';

-- Índice geral para listagem por fornecedor
CREATE INDEX IF NOT EXISTS idx_sba_supplier_id
  ON public.supplier_bank_accounts(supplier_id);

-- ─── Trigger updated_at (sem depender de moddatetime) ──────────────────────
CREATE OR REPLACE FUNCTION public.sba_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sba_updated_at ON public.supplier_bank_accounts;
CREATE TRIGGER trg_sba_updated_at
  BEFORE UPDATE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.sba_set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Limpa políticas anteriores se existirem
DROP POLICY IF EXISTS "sba_org_member_access"         ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "sba_authenticated_view"        ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "sba_authenticated_manage"      ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "sba_anon_all"                  ON public.supplier_bank_accounts;

-- Usuários autenticados: membros da organização OU admin
CREATE POLICY "sba_authenticated_view"
  ON public.supplier_bank_accounts FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR auth.jwt()->>'email' = 'admin@admin.com'
  );

CREATE POLICY "sba_authenticated_manage"
  ON public.supplier_bank_accounts FOR ALL TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR auth.jwt()->>'email' = 'admin@admin.com'
  )
  WITH CHECK (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR auth.jwt()->>'email' = 'admin@admin.com'
  );

-- Anon: acesso total (padrão do projeto para dev/ambiente atual)
CREATE POLICY "sba_anon_all"
  ON public.supplier_bank_accounts FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
