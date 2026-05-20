// ============================================================
// OrçaCloud — Módulo Fiscal & Custos
// Serviço NF-e: upload, consultas e replay de dead letters
// ============================================================

import { supabase } from '../lib/supabase';
import type {
  RawDocument,
  NfeInvoice,
  NfeInvoiceWithItems,
  NfeInvoiceItem,
  ProcessingJob,
  ProcessingJobWithDoc,
  ClassificationRule,
  PipelineHealth,
  UploadNfeResult,
} from '../types/fiscal';

// ============================================================
// UPLOAD
// ============================================================

export async function uploadNFe(
  file: File,
  organizationId: string,
  userId: string
): Promise<UploadNfeResult> {
  // 1. SHA-256 do arquivo para idempotência
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const sourceHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // 2. Upload para o bucket fiscal-documents
  const year = new Date().getFullYear();
  const filePath = `${organizationId}/${year}/${file.name}`;

  const { error: storageError } = await supabase.storage
    .from('fiscal-documents')
    .upload(filePath, file, { upsert: false });

  if (storageError) {
    if (storageError.message.includes('already exists')) {
      throw Object.assign(
        new Error('Arquivo já enviado anteriormente'),
        { code: 'DUPLICATE_FILE' }
      );
    }
    throw Object.assign(
      new Error(`Erro no storage: ${storageError.message}`),
      { code: 'STORAGE_ERROR' }
    );
  }

  // 3. Extrair access_key do XML (leitura rápida, sem parse completo)
  const text = await file.text();
  const keyMatch = text.match(/Id="NFe(\d{44})"/);
  const accessKey = keyMatch?.[1] ?? '';

  if (!accessKey) {
    throw Object.assign(
      new Error('Chave de acesso não encontrada no XML'),
      { code: 'INVALID_XML' }
    );
  }

  // 4. Criar raw_document (idempotência por access_key + source_hash)
  const { data: rawDoc, error: rawError } = await supabase
    .from('raw_documents')
    .insert({
      organization_id:   organizationId,
      access_key:        accessKey,
      source_hash:       sourceHash,
      file_path:         filePath,
      document_type:     'nfe',
      upload_user_id:    userId,
      metadata:          { file_name: file.name, file_size: file.size },
    })
    .select()
    .single<RawDocument>();

  if (rawError) {
    if (rawError.code === '23505') {
      throw Object.assign(
        new Error('Esta NF-e já foi enviada anteriormente'),
        { code: 'DUPLICATE_NF' }
      );
    }
    throw Object.assign(
      new Error(`Erro ao salvar documento: ${rawError.message}`),
      { code: 'DB_ERROR' }
    );
  }

  // 5. Criar processing_job — dispara webhook automaticamente
  const { error: jobError } = await supabase
    .from('processing_jobs')
    .insert({
      organization_id: organizationId,
      raw_document_id: rawDoc.id,
      job_type:        'parse_nfe',
      status:          'queued',
    });

  if (jobError) {
    throw Object.assign(
      new Error(`Erro ao enfileirar job: ${jobError.message}`),
      { code: 'DB_ERROR' }
    );
  }

  return { rawDocument: rawDoc, isDuplicate: false };
}

// ============================================================
// INVOICES
// ============================================================

export async function listNfeInvoices(organizationId: string): Promise<NfeInvoice[]> {
  const { data, error } = await supabase
    .from('nfe_invoices')
    .select('*')
    .eq('organization_id', organizationId)
    .order('issue_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNfeInvoiceWithItems(invoiceId: string): Promise<NfeInvoiceWithItems | null> {
  const { data: invoice, error: invError } = await supabase
    .from('nfe_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single<NfeInvoice>();

  if (invError || !invoice) return null;

  const { data: items, error: itemsError } = await supabase
    .from('nfe_invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number');

  if (itemsError) throw new Error(itemsError.message);

  return { ...invoice, items: (items ?? []) as NfeInvoiceItem[] };
}

// ============================================================
// FILA DE JOBS
// ============================================================

export async function listProcessingJobs(organizationId: string): Promise<ProcessingJobWithDoc[]> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select(`
      *,
      raw_document:raw_documents(access_key, file_path, document_type)
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProcessingJobWithDoc[];
}

export async function getPipelineHealth(organizationId: string): Promise<PipelineHealth | null> {
  const { data, error } = await supabase
    .from('pipeline_health')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle<PipelineHealth>();

  if (error) return null;
  return data;
}

// ============================================================
// REPLAY
// ============================================================

export async function replayDeadLetter(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('replay_dead_letter', {
    p_job_id: jobId,
  });

  if (error) throw new Error(error.message);
  return data as string; // novo job_id
}

// ============================================================
// CLASSIFICAÇÃO
// ============================================================

export async function listClassificationRules(
  organizationId: string
): Promise<ClassificationRule[]> {
  const { data, error } = await supabase
    .from('classification_rules')
    .select('*')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ClassificationRule[];
}

export async function createClassificationRule(
  rule: Omit<ClassificationRule, 'id' | 'created_at'>
): Promise<ClassificationRule> {
  const { data, error } = await supabase
    .from('classification_rules')
    .insert(rule)
    .select()
    .single<ClassificationRule>();

  if (error) throw new Error(error.message);
  return data;
}

export async function toggleClassificationRule(
  ruleId: string,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from('classification_rules')
    .update({ is_active: isActive })
    .eq('id', ruleId);

  if (error) throw new Error(error.message);
}
