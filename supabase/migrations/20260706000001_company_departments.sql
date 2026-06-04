-- ============================================================
-- Migration: 20260706000001_company_departments
-- Estrutura de departamentos e subdepartamentos por empresa
-- ============================================================

CREATE TABLE IF NOT EXISTS company_departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES company_departments(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  responsavel_nome TEXT,
  cor           TEXT NOT NULL DEFAULT '#374151',
  ordem         INT  NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_company_id ON company_departments(company_id);
CREATE INDEX IF NOT EXISTS idx_dept_parent_id  ON company_departments(parent_id);

ALTER TABLE company_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select"
  ON company_departments FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "departments_write_admin"
  ON company_departments FOR ALL
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
