-- ============================================================
-- Migration: 20260601000001_company_society_and_banking
-- Sprint A: Quadro societário + contas bancárias por empresa
-- + colunas de responsáveis em companies
-- ============================================================

-- ─── 1. QUADRO SOCIETÁRIO ───────────────────────────────────

CREATE TABLE IF NOT EXISTS company_partners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo_pessoa      TEXT NOT NULL CHECK (tipo_pessoa IN ('pf', 'pj')),
  nome             TEXT NOT NULL,
  documento        TEXT,                        -- CPF (PF) ou CNPJ (PJ)
  participacao_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (participacao_pct >= 0 AND participacao_pct <= 100),
  is_administrador   BOOLEAN NOT NULL DEFAULT false,
  is_assinante_legal BOOLEAN NOT NULL DEFAULT false,
  pj_company_id    UUID REFERENCES companies(id),  -- se sócio é outra empresa do grupo
  data_entrada     DATE,
  data_saida       DATE,                        -- NULL = sócio ativo
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_partners_company_id ON company_partners(company_id);

ALTER TABLE company_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_partners_select"
  ON company_partners FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "company_partners_insert_admin"
  ON company_partners FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "company_partners_update_admin"
  ON company_partners FOR UPDATE
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "company_partners_delete_admin"
  ON company_partners FOR DELETE
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

-- ─── 2. CONTAS BANCÁRIAS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  banco_codigo   TEXT NOT NULL,
  banco_nome     TEXT,
  agencia        TEXT,
  conta          TEXT,
  tipo_conta     TEXT CHECK (tipo_conta IN (
                   'corrente', 'poupanca', 'escrow', 'obra', 'incorporacao', 'garantida'
                 )),
  pix_chave      TEXT,
  pix_tipo       TEXT CHECK (pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  favorecido     TEXT,
  limite_credito NUMERIC(15,2),
  is_principal   BOOLEAN NOT NULL DEFAULT false,
  ativa          BOOLEAN NOT NULL DEFAULT true,
  obra_id        UUID REFERENCES projects(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company_id ON company_bank_accounts(company_id);

ALTER TABLE company_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_bank_accounts_select"
  ON company_bank_accounts FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "company_bank_accounts_insert_admin"
  ON company_bank_accounts FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "company_bank_accounts_update_admin"
  ON company_bank_accounts FOR UPDATE
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "company_bank_accounts_delete_admin"
  ON company_bank_accounts FOR DELETE
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

-- ─── 3. RESPONSÁVEIS EM COMPANIES ───────────────────────────
-- Nomes em texto agora; FKs para employees quando RH estiver ativo.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS responsavel_legal_nome      TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_financeiro_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_operacional_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_crea    TEXT;
