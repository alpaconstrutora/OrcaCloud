-- ============================================================
-- OrçaCloud — Módulo Fiscal & Custos
-- Migration 001: Schema NF-e (Sprint 1)
--
-- Decisão arquitetural:
--   - Usa `organizations` existente como âncora multi-tenant
--     (não cria tabela `companies` em paralelo)
--   - Tabelas de domínio renomeadas para evitar conflito com
--     `invoices` do módulo Financeiro:
--       invoices      → nfe_invoices
--       invoice_items → nfe_invoice_items
--   - Todas as FKs usam `organization_id` em vez de `company_id`
-- ============================================================

-- Extensões (idempotente)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('nfe', 'cte', 'nfse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM (
    'queued', 'processing', 'parsed', 'normalized',
    'completed', 'failed', 'dead_letter', 'duplicated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('parse_nfe', 'reprocess', 'replay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE failure_type AS ENUM ('technical_failure', 'data_failure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rule_type AS ENUM ('ncm', 'cfop', 'keyword');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- CAMADA 1: RAW DOCUMENTS
-- XML original preservado no Storage — imutável
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  access_key        TEXT NOT NULL,            -- chave de acesso 44 dígitos (SEFAZ)
  source_hash       TEXT NOT NULL,            -- SHA-256 do arquivo XML
  file_path         TEXT NOT NULL,            -- caminho no bucket fiscal-documents
  document_type     document_type NOT NULL DEFAULT 'nfe',
  schema_version    TEXT NOT NULL DEFAULT '4.00',
  upload_user_id    UUID NOT NULL,            -- auth.users.id de quem fez upload
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_status processing_status NOT NULL DEFAULT 'queued',
  metadata          JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT raw_documents_access_key_unique UNIQUE (access_key),
  CONSTRAINT raw_documents_source_hash_unique UNIQUE (source_hash)
);

-- ============================================================
-- CAMADA 2: EXTRACTED DOCUMENTS (imutável, versionado)
-- JSON Contract V1 extraído pelo parser — suporta histórico
-- ============================================================

CREATE TABLE IF NOT EXISTS public.extracted_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_document_id   UUID NOT NULL REFERENCES public.raw_documents(id) ON DELETE RESTRICT,
  contract_version  TEXT NOT NULL DEFAULT '1.0.0',
  extracted_data    JSONB NOT NULL,           -- JSON Contract V1
  parser_version    TEXT NOT NULL DEFAULT '1.0.0',
  extracted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  warnings          JSONB NOT NULL DEFAULT '[]',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by     UUID REFERENCES public.extracted_documents(id)
);

-- ============================================================
-- CAMADA 3: DOMAIN MODEL — NFE_INVOICES
-- Nota fiscal normalizada (emitente, destinatário, totais)
-- NOME: nfe_invoices para não conflitar com invoices financeiro
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nfe_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  raw_document_id   UUID NOT NULL REFERENCES public.raw_documents(id) ON DELETE RESTRICT,
  access_key        TEXT NOT NULL,
  issuer_name       TEXT NOT NULL,
  issuer_cnpj       TEXT NOT NULL,
  recipient_name    TEXT,
  recipient_cnpj    TEXT,
  issue_date        DATE NOT NULL,
  total_value       NUMERIC(15,2) NOT NULL,
  document_status   TEXT NOT NULL DEFAULT 'active',
  payment_status    TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nfe_invoices_access_key_unique UNIQUE (access_key)
);

-- ============================================================
-- CAMADA 3: DOMAIN MODEL — NFE_INVOICE_ITEMS
-- Linhas de item com NCM, CFOP e categoria heurística
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nfe_invoice_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID NOT NULL REFERENCES public.nfe_invoices(id) ON DELETE CASCADE,
  line_number       INTEGER NOT NULL,
  description       TEXT NOT NULL,
  ncm               TEXT,
  cfop              TEXT,
  quantity          NUMERIC(15,4) NOT NULL,
  commercial_unit   TEXT,
  taxable_unit      TEXT,
  unit_value        NUMERIC(15,4) NOT NULL,
  total_value       NUMERIC(15,2) NOT NULL,
  tax_value         NUMERIC(15,2),
  category          TEXT,                     -- preenchida pela classificação heurística
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FILA: PROCESSING JOBS
-- State machine: queued → processing → parsed → completed
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  raw_document_id   UUID NOT NULL REFERENCES public.raw_documents(id) ON DELETE RESTRICT,
  job_type          job_type NOT NULL DEFAULT 'parse_nfe',
  status            processing_status NOT NULL DEFAULT 'queued',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 3,
  payload           JSONB NOT NULL DEFAULT '{}',
  error_code        TEXT,
  error_message     TEXT,
  failure_type      failure_type,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  next_retry_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OBSERVABILIDADE: PARSING ERRORS
-- Log 100% das falhas com error_code e error_payload
-- ============================================================

CREATE TABLE IF NOT EXISTS public.parsing_errors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processing_job_id   UUID NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  raw_document_id     UUID NOT NULL REFERENCES public.raw_documents(id) ON DELETE CASCADE,
  error_type          TEXT NOT NULL,
  error_code          TEXT NOT NULL,
  error_message       TEXT NOT NULL,
  error_payload       JSONB NOT NULL DEFAULT '{}',
  parser_version      TEXT NOT NULL DEFAULT '1.0.0',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- IA FUTURA: TRAINING DATA
-- Coleta feedback para ML de classificação
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_data (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  description         TEXT NOT NULL,
  ncm                 TEXT,
  cfop                TEXT,
  supplier_document   TEXT,
  corrected_category  TEXT NOT NULL,
  corrected_by        UUID NOT NULL,          -- auth.users.id
  confidence_before   NUMERIC(3,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CLASSIFICAÇÃO: REGRAS CONFIGURÁVEIS (não hardcoded)
-- Prioridade: NCM (10) > CFOP (80) > keyword (50)
-- organization_id NULL = regra global
-- ============================================================

CREATE TABLE IF NOT EXISTS public.classification_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_type       rule_type NOT NULL,
  match_value     TEXT NOT NULL,
  category        TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Regras globais padrão (construção civil)
INSERT INTO public.classification_rules (rule_type, match_value, category, priority) VALUES
  ('ncm', '7214', 'aço',        10),
  ('ncm', '7213', 'aço',        10),
  ('ncm', '2523', 'concreto',   10),
  ('ncm', '3214', 'concreto',   10),
  ('ncm', '8544', 'elétrica',   10),
  ('ncm', '3917', 'hidráulica', 10),
  ('keyword', 'cimento',       'concreto',   50),
  ('keyword', 'argamassa',     'concreto',   50),
  ('keyword', 'vergalhão',     'aço',        50),
  ('keyword', 'cabo',          'elétrica',   50),
  ('keyword', 'fio elétrico',  'elétrica',   50),
  ('keyword', 'tubo',          'hidráulica', 50),
  ('keyword', 'conexão pvc',   'hidráulica', 50),
  ('keyword', 'tijolo',        'alvenaria',  50),
  ('keyword', 'bloco',         'alvenaria',  50),
  ('keyword', 'areia',         'concreto',   50),
  ('keyword', 'brita',         'concreto',   50),
  ('cfop',    '1101',          'material',   80),
  ('cfop',    '2101',          'material',   80),
  ('cfop',    '1556',          'equipamento',80)
ON CONFLICT DO NOTHING;
