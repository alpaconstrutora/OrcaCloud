-- ============================================================
-- Migration: 20260703000001_company_spe_branches
-- Sprint C: Incorporação/SPE + Filiais + Config de Obras
-- ============================================================

-- ─── 1. DADOS DE INCORPORAÇÃO / SPE ─────────────────────────
-- Relação 1:1 com companies (company_id é PK)

CREATE TABLE IF NOT EXISTS company_incorporacao (
  company_id             UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  tipo_spe               TEXT CHECK (tipo_spe IN ('spe', 'patrimonio_afetacao', 'scp')),
  registro_incorporacao  TEXT,
  cartorio               TEXT,
  matriculas             TEXT[],
  alvara_construcao      TEXT,
  alvara_validade        DATE,
  habite_se              TEXT,
  habite_se_data         DATE,
  rep_numero             TEXT,
  conta_segregada_id     UUID REFERENCES company_bank_accounts(id),
  empreendimento_id      UUID REFERENCES projects(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_company_incorporacao_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER company_incorporacao_updated_at
  BEFORE UPDATE ON company_incorporacao
  FOR EACH ROW EXECUTE FUNCTION set_company_incorporacao_updated_at();

ALTER TABLE company_incorporacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incorporacao_select"
  ON company_incorporacao FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "incorporacao_write_admin"
  ON company_incorporacao FOR ALL
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

-- ─── 2. FILIAIS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  codigo        TEXT NOT NULL,
  nome          TEXT NOT NULL,
  cnpj_proprio  TEXT,
  endereco      JSONB,
  estoque_proprio BOOLEAN NOT NULL DEFAULT false,
  obra_id       UUID REFERENCES projects(id),
  ativa         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_branches_company_id ON company_branches(company_id);

ALTER TABLE company_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_select"
  ON company_branches FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "branches_write_admin"
  ON company_branches FOR ALL
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

-- ─── 3. CONFIG DE OBRAS EM COMPANIES ────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS obra_empresa_executora_id    UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS obra_empresa_incorporadora_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS obra_bdi_padrao              NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS obra_encargos_sociais_pct    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS obra_tabela_sinapi_uf        TEXT;
