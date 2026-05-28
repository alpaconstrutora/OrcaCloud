-- ============================================================
-- Migration: 20260702000001_company_finance_tax_config
-- Sprint B: Configurações financeiras e tributárias avançadas
-- ============================================================

-- ─── 1. COLUNAS FINANCEIRAS ─────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS regime_contabil            TEXT CHECK (regime_contabil IN ('caixa', 'competencia')),
  ADD COLUMN IF NOT EXISTS limite_aprovacao_compras   NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS limite_aprovacao_pagamentos NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS empresa_consolidadora_id   UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS plano_contas_padrao_id     UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS centro_custo_padrao_id     UUID REFERENCES cost_centers(id);

-- ─── 2. COLUNAS TRIBUTÁRIAS AVANÇADAS ───────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS aliquota_iss               NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS codigo_servico_municipal   TEXT,
  ADD COLUMN IF NOT EXISTS cnae_fiscal                TEXT,
  ADD COLUMN IF NOT EXISTS retencao_pis               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencao_cofins            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencao_csll              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_substituicao_tributaria BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_difal               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possui_inss_obra           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cprb                       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificado_digital_url    TEXT,
  ADD COLUMN IF NOT EXISTS certificado_validade       DATE,
  ADD COLUMN IF NOT EXISTS prefeitura_integrada       TEXT,
  ADD COLUMN IF NOT EXISTS sefaz_integrada            BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. STORAGE: bucket privado para certificados digitais ──

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-certificates',
  'company-certificates',
  false,
  5242880,  -- 5 MB
  ARRAY['application/x-pkcs12', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage: membros do org acessam certificados da própria empresa
CREATE POLICY "cert_select_org_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'company-certificates'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "cert_insert_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-certificates'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "cert_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-certificates'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );
