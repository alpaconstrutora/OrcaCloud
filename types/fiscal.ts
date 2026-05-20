// ============================================================
// OrçaCloud — Módulo Fiscal & Custos
// Tipos NF-e (tabelas nfe_invoices / nfe_invoice_items)
// ============================================================

export type ProcessingStatus =
  | 'queued'
  | 'processing'
  | 'parsed'
  | 'normalized'
  | 'completed'
  | 'failed'
  | 'dead_letter'
  | 'duplicated';

export type JobType = 'parse_nfe' | 'reprocess' | 'replay';
export type FailureType = 'technical_failure' | 'data_failure';
export type DocumentType = 'nfe' | 'cte' | 'nfse';
export type RuleType = 'ncm' | 'cfop' | 'keyword';

// ============================================================
// CAMADA 1: RAW DOCUMENTS
// ============================================================

export interface RawDocument {
  id: string;
  organization_id: string;
  access_key: string;
  source_hash: string;
  file_path: string;
  document_type: DocumentType;
  schema_version: string;
  upload_user_id: string;
  uploaded_at: string;
  processing_status: ProcessingStatus;
  metadata: Record<string, unknown>;
}

// ============================================================
// CAMADA 2: EXTRACTED DOCUMENTS
// ============================================================

export interface ExtractedDocument {
  id: string;
  raw_document_id: string;
  contract_version: string;
  extracted_data: NfeContract;
  parser_version: string;
  extracted_at: string;
  warnings: string[];
  is_active: boolean;
  superseded_by: string | null;
}

// JSON Contract V1.0.0 — estrutura do XML normalizado
export interface NfeContract {
  document_version: string;
  issuer: {
    cnpj: string;
    name: string;
    ie?: string;
    address?: Record<string, unknown>;
  };
  recipient: {
    cnpj?: string;
    cpf?: string;
    name?: string;
  };
  totals: {
    total_products: number;
    total_freight?: number;
    total_discount?: number;
    total_value: number;
    total_tax?: number;
  };
  items: NfeContractItem[];
  taxes: Record<string, unknown>;
  metadata: {
    parser_version: string;
    parsed_at: string;
    source_hash: string;
    warnings: string[];
    schema_version: string;
    access_key: string;
    issue_date: string;
  };
}

export interface NfeContractItem {
  line_number: number;
  description: string;
  ncm?: string;
  cfop?: string;
  quantity: number;
  commercial_unit?: string;
  taxable_unit?: string;
  unit_value: number;
  total_value: number;
  tax_value?: number;
}

// ============================================================
// CAMADA 3: DOMAIN MODEL
// ============================================================

export interface NfeInvoice {
  id: string;
  organization_id: string;
  raw_document_id: string;
  access_key: string;
  issuer_name: string;
  issuer_cnpj: string;
  recipient_name: string | null;
  recipient_cnpj: string | null;
  issue_date: string;
  total_value: number;
  document_status: string;
  payment_status: string;
  created_at: string;
}

export interface NfeInvoiceItem {
  id: string;
  invoice_id: string;
  line_number: number;
  description: string;
  ncm: string | null;
  cfop: string | null;
  quantity: number;
  commercial_unit: string | null;
  taxable_unit: string | null;
  unit_value: number;
  total_value: number;
  tax_value: number | null;
  category: string | null;
  created_at: string;
}

// NfeInvoice com itens (para tela de detalhe)
export interface NfeInvoiceWithItems extends NfeInvoice {
  items: NfeInvoiceItem[];
}

// ============================================================
// FILA
// ============================================================

export interface ProcessingJob {
  id: string;
  organization_id: string;
  raw_document_id: string;
  job_type: JobType;
  status: ProcessingStatus;
  retry_count: number;
  max_retries: number;
  payload: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  failure_type: FailureType | null;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

// ProcessingJob enriquecido com dados do raw_document
export interface ProcessingJobWithDoc extends ProcessingJob {
  raw_document: Pick<RawDocument, 'access_key' | 'file_path' | 'document_type'>;
}

// ============================================================
// OBSERVABILIDADE
// ============================================================

export interface ParsingError {
  id: string;
  processing_job_id: string;
  raw_document_id: string;
  error_type: string;
  error_code: string;
  error_message: string;
  error_payload: Record<string, unknown>;
  parser_version: string;
  created_at: string;
}

// ============================================================
// CLASSIFICAÇÃO
// ============================================================

export interface ClassificationRule {
  id: string;
  organization_id: string | null;
  rule_type: RuleType;
  match_value: string;
  category: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

// ============================================================
// VIEWS OPERACIONAIS
// ============================================================

export interface PipelineHealth {
  organization_id: string;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  dead_letter: number;
  duplicated: number;
  success_rate_pct: number;
  avg_processing_seconds: number | null;
  last_job_at: string | null;
}

// ============================================================
// PAYLOADS DE UPLOAD
// ============================================================

export interface UploadNfeResult {
  rawDocument: RawDocument;
  isDuplicate: false;
}

export interface UploadNfeError {
  code: 'DUPLICATE_NF' | 'DUPLICATE_FILE' | 'INVALID_XML' | 'STORAGE_ERROR' | 'DB_ERROR';
  message: string;
}
