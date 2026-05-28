-- ============================================================
-- Migration: 20260704000001_company_documents_governance
-- Sprint D: Documentos da empresa + Auditoria + Governança
-- ============================================================

-- ─── 1. DOCUMENTOS DA EMPRESA ───────────────────────────────

CREATE TABLE IF NOT EXISTS company_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo                    TEXT NOT NULL,
  numero                  TEXT,
  emissor                 TEXT,
  data_emissao            DATE,
  data_validade           DATE,
  arquivo_url             TEXT,          -- path no Storage (nullable: doc pode ser só registro)
  observacoes             TEXT,
  alerta_dias_antecedencia INT NOT NULL DEFAULT 30,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_company_id ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_company_documents_validade   ON company_documents(data_validade) WHERE data_validade IS NOT NULL;

CREATE OR REPLACE FUNCTION set_company_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER company_documents_updated_at
  BEFORE UPDATE ON company_documents
  FOR EACH ROW EXECUTE FUNCTION set_company_documents_updated_at();

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select"
  ON company_documents FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "documents_write_admin"
  ON company_documents FOR ALL
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

-- ─── 2. AUDIT LOG ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_email    TEXT NOT NULL,
  action        TEXT NOT NULL,   -- create | update | delete | status_change | document_upload
  field_changed TEXT,
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_id ON company_audit_log(company_id);

ALTER TABLE company_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select"
  ON company_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "audit_log_insert"
  ON company_audit_log FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

-- ─── 3. TRIGGER: log de mudança de status ───────────────────

CREATE OR REPLACE FUNCTION log_company_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO company_audit_log (company_id, user_email, action, field_changed, old_value, new_value)
    VALUES (
      NEW.id,
      COALESCE(auth.jwt() ->> 'email', 'system'),
      'status_change',
      'status',
      to_jsonb(OLD.status),
      to_jsonb(NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_status_audit
  AFTER UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION log_company_status_change();

-- ─── 4. GOVERNANÇA ──────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dupla_aprovacao_compras    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dupla_aprovacao_pagamentos BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limite_dupla_aprovacao     NUMERIC(15,2);

-- ─── 5. STORAGE: bucket para documentos ─────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('company-documents', 'company-documents', false, 20971520)  -- 20 MB
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "docs_select_org_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "docs_insert_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "docs_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );
