-- ============================================================
-- OrçaCloud — Módulo Fiscal & Custos
-- Migration 002: Índices, RLS e Views operacionais
--
-- RLS helpers adaptados para organization_members (padrão OrçaCloud)
-- em vez de company_users do módulo standalone.
-- ============================================================

-- ============================================================
-- INDEXES
-- ============================================================

-- raw_documents
CREATE INDEX IF NOT EXISTS idx_raw_documents_org     ON public.raw_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_raw_documents_status  ON public.raw_documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_raw_documents_uploaded ON public.raw_documents(uploaded_at DESC);

-- extracted_documents
CREATE INDEX IF NOT EXISTS idx_extracted_raw    ON public.extracted_documents(raw_document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_active ON public.extracted_documents(raw_document_id) WHERE is_active = TRUE;

-- nfe_invoices
CREATE INDEX IF NOT EXISTS idx_nfe_invoices_org        ON public.nfe_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_nfe_invoices_issue_date ON public.nfe_invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_nfe_invoices_issuer_cnpj ON public.nfe_invoices(issuer_cnpj);

-- nfe_invoice_items
CREATE INDEX IF NOT EXISTS idx_nfe_items_invoice  ON public.nfe_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_nfe_items_ncm      ON public.nfe_invoice_items(ncm);
CREATE INDEX IF NOT EXISTS idx_nfe_items_cfop     ON public.nfe_invoice_items(cfop);
CREATE INDEX IF NOT EXISTS idx_nfe_items_category ON public.nfe_invoice_items(category);

-- processing_jobs
CREATE INDEX IF NOT EXISTS idx_jobs_org    ON public.processing_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_retry  ON public.processing_jobs(status, next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_dead_letter ON public.processing_jobs(status, created_at)
  WHERE status = 'dead_letter';

-- parsing_errors
CREATE INDEX IF NOT EXISTS idx_errors_job ON public.parsing_errors(processing_job_id);
CREATE INDEX IF NOT EXISTS idx_errors_raw ON public.parsing_errors(raw_document_id);

-- classification_rules
CREATE INDEX IF NOT EXISTS idx_rules_type ON public.classification_rules(rule_type, match_value);
CREATE INDEX IF NOT EXISTS idx_rules_org  ON public.classification_rules(organization_id)
  WHERE organization_id IS NOT NULL;

-- training_data
CREATE INDEX IF NOT EXISTS idx_training_org ON public.training_data(organization_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.raw_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parsing_errors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_data        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPERS: usam organization_members (padrão do projeto)
-- ============================================================

-- Retorna o organization_id ativo do usuário autenticado
CREATE OR REPLACE FUNCTION fiscal_auth_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Verifica se usuário pertence a uma organização específica
CREATE OR REPLACE FUNCTION fiscal_member_of(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
      AND organization_id = p_org_id
  )
$$;

-- ============================================================
-- POLÍTICAS RLS
-- ============================================================

-- raw_documents: membro da organização lê/insere seus docs
CREATE POLICY raw_docs_select ON public.raw_documents FOR SELECT
  USING (fiscal_member_of(organization_id));
CREATE POLICY raw_docs_insert ON public.raw_documents FOR INSERT
  WITH CHECK (fiscal_member_of(organization_id));

-- extracted_documents: acesso via raw_document
CREATE POLICY extracted_select ON public.extracted_documents FOR SELECT
  USING (
    raw_document_id IN (
      SELECT id FROM public.raw_documents WHERE fiscal_member_of(organization_id)
    )
  );

-- nfe_invoices: isolamento por organization_id
CREATE POLICY nfe_invoices_select ON public.nfe_invoices FOR SELECT
  USING (fiscal_member_of(organization_id));

-- nfe_invoice_items: acesso via nfe_invoice
CREATE POLICY nfe_items_select ON public.nfe_invoice_items FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM public.nfe_invoices WHERE fiscal_member_of(organization_id)
    )
  );

-- processing_jobs: isolamento por organization_id
CREATE POLICY jobs_select ON public.processing_jobs FOR SELECT
  USING (fiscal_member_of(organization_id));
CREATE POLICY jobs_insert ON public.processing_jobs FOR INSERT
  WITH CHECK (fiscal_member_of(organization_id));

-- parsing_errors: acesso via raw_document
CREATE POLICY errors_select ON public.parsing_errors FOR SELECT
  USING (
    raw_document_id IN (
      SELECT id FROM public.raw_documents WHERE fiscal_member_of(organization_id)
    )
  );

-- training_data
CREATE POLICY training_select ON public.training_data FOR SELECT
  USING (fiscal_member_of(organization_id));
CREATE POLICY training_insert ON public.training_data FOR INSERT
  WITH CHECK (fiscal_member_of(organization_id));

-- classification_rules: regras globais (organization_id NULL) + regras da organização
CREATE POLICY rules_select ON public.classification_rules FOR SELECT
  USING (
    organization_id IS NULL
    OR fiscal_member_of(organization_id)
  );
CREATE POLICY rules_insert ON public.classification_rules FOR INSERT
  WITH CHECK (fiscal_member_of(organization_id));
CREATE POLICY rules_update ON public.classification_rules FOR UPDATE
  USING (fiscal_member_of(organization_id));

-- ============================================================
-- VIEWS OPERACIONAIS
-- ============================================================

-- Saúde do pipeline por organização
CREATE OR REPLACE VIEW public.pipeline_health AS
SELECT
  organization_id,
  COUNT(*) FILTER (WHERE status = 'queued')       AS queued,
  COUNT(*) FILTER (WHERE status = 'processing')   AS processing,
  COUNT(*) FILTER (WHERE status = 'completed')    AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')       AS failed,
  COUNT(*) FILTER (WHERE status = 'dead_letter')  AS dead_letter,
  COUNT(*) FILTER (WHERE status = 'duplicated')   AS duplicated,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS success_rate_pct,
  AVG(
    EXTRACT(EPOCH FROM (finished_at - started_at))
  ) FILTER (WHERE status = 'completed') AS avg_processing_seconds,
  MAX(created_at) AS last_job_at
FROM public.processing_jobs
GROUP BY organization_id;

-- Dead letters aguardando replay manual
CREATE OR REPLACE VIEW public.dead_letter_queue AS
SELECT
  pj.id,
  pj.organization_id,
  pj.raw_document_id,
  pj.failure_type,
  pj.error_code,
  pj.error_message,
  pj.retry_count,
  pj.created_at,
  rd.access_key,
  rd.file_path
FROM public.processing_jobs pj
JOIN public.raw_documents rd ON rd.id = pj.raw_document_id
WHERE pj.status = 'dead_letter'
ORDER BY pj.created_at DESC;

-- Jobs com backoff expirado prontos para retry
CREATE OR REPLACE VIEW public.retry_candidates AS
SELECT id, organization_id, raw_document_id, retry_count, max_retries
FROM public.processing_jobs
WHERE status = 'failed'
  AND next_retry_at <= NOW()
  AND retry_count < max_retries
ORDER BY next_retry_at;

-- ============================================================
-- HELPER: exponential backoff para next_retry_at
-- ============================================================

CREATE OR REPLACE FUNCTION compute_next_retry(retry_count INTEGER)
RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE AS $$
  SELECT NOW() + (INTERVAL '1 minute' * POWER(2, retry_count))
$$;
