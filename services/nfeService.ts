// ============================================================
// Opura — Módulo Fiscal & Custos
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
import { supplierService } from './supplierService';
import { orderService } from './orderService';

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

const NFE_COLS = 'id, organization_id, raw_document_id, access_key, issuer_name, issuer_cnpj, recipient_name, recipient_cnpj, issue_date, total_value, document_status, payment_status, created_at, project_id, linked_transaction_id, approved_at, approved_by, purchase_order_id';

export async function listNfeInvoices(organizationId?: string | null): Promise<NfeInvoice[]> {
  let query = supabase
    .from('nfe_invoices')
    .select(NFE_COLS)
    .order('issue_date', { ascending: false });

  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNfeInvoiceWithItems(invoiceId: string): Promise<NfeInvoiceWithItems | null> {
  const { data: invoice, error: invError } = await supabase
    .from('nfe_invoices')
    .select(NFE_COLS)
    .eq('id', invoiceId)
    .single<NfeInvoice>();

  if (invError || !invoice) return null;

  const { data: items, error: itemsError } = await supabase
    .from('nfe_invoice_items')
    .select('id, invoice_id, line_number, description, ncm, cfop, quantity, commercial_unit, taxable_unit, unit_value, total_value, tax_value, category, created_at')
    .eq('invoice_id', invoiceId)
    .order('line_number');

  if (itemsError) throw new Error(itemsError.message);

  return { ...invoice, items: (items ?? []) as NfeInvoiceItem[] };
}

// ============================================================
// FILA DE JOBS
// ============================================================

export async function listProcessingJobs(organizationId?: string | null): Promise<ProcessingJobWithDoc[]> {
  let query = supabase
    .from('processing_jobs')
    .select(`
      *,
      raw_document:raw_documents(access_key, file_path, document_type)
    `)
    .order('created_at', { ascending: false });

  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProcessingJobWithDoc[];
}

export async function getPipelineHealth(organizationId: string): Promise<PipelineHealth | null> {
  const { data, error } = await supabase
    .from('pipeline_health')
    .select('organization_id, queued, processing, completed, failed, dead_letter, duplicated, success_rate_pct, avg_processing_seconds, last_job_at')
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
  organizationId?: string | null
): Promise<ClassificationRule[]> {
  let query = supabase
    .from('classification_rules')
    .select('id, organization_id, rule_type, match_value, category, priority, is_active, created_at')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);

  const { data, error } = await query;
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

// ============================================================
// F1 — APROVAR NF-e E GERAR TÍTULO FINANCEIRO
// Cria internal_transaction (DEBIT/PENDING) e vincula à nota.
// ============================================================

export async function approveAndLink(params: {
  invoiceId: string;
  organizationId: string;
  projectId: string;
  dueDate: string;
  userId: string;
  purchaseOrderId?: string;
}): Promise<NfeInvoice> {
  const { invoiceId, organizationId, projectId, dueDate, userId, purchaseOrderId } = params;

  // 1. Buscar a nota
  const { data: invoice, error: fetchErr } = await supabase
    .from('nfe_invoices')
    .select(NFE_COLS)
    .eq('id', invoiceId)
    .single<NfeInvoice>();

  if (fetchErr || !invoice) throw new Error('NF-e não encontrada');
  if (invoice.linked_transaction_id) throw new Error('NF-e já possui título financeiro vinculado');
  if (invoice.document_status !== 'active') throw new Error('NF-e ainda não foi processada com sucesso');

  // 2. ID único para o par de partidas (D/C)
  const journalEntryId = crypto.randomUUID();
  const txBase = {
    organization_id:  organizationId,
    project_id:       projectId,
    source_system:    'NFE',
    reference_id:     invoiceId,
    transaction_date: dueDate,
    amount:           invoice.total_value,
    status:           'PENDING',
    journal_entry_id: journalEntryId,
    description:      `NF-e ${invoice.issuer_name} — ${invoice.access_key.slice(0, 8)}`,
  };

  // 3. Partida de débito — custo de materiais (PRINCIPAL)
  const { data: txDebit, error: txDebitErr } = await supabase
    .from('internal_transactions')
    .insert({ ...txBase, direction: 'DEBIT',  category: 'Material',             entry_type: 'PRINCIPAL' })
    .select('id')
    .single<{ id: string }>();

  if (txDebitErr || !txDebit) throw new Error(`Erro ao criar partida débito: ${txDebitErr?.message}`);

  // 4. Contra-partida de crédito — fornecedores a pagar (CONTRA)
  const { error: txCreditErr } = await supabase
    .from('internal_transactions')
    .insert({ ...txBase, direction: 'CREDIT', category: 'Fornecedores a Pagar', entry_type: 'CONTRA' });

  if (txCreditErr) throw new Error(`Erro ao criar contra-partida crédito: ${txCreditErr.message}`);

  // 5. Vincular NF-e ao débito principal (e ao pedido, se informado)
  const { data: updated, error: updErr } = await supabase
    .from('nfe_invoices')
    .update({
      linked_transaction_id: txDebit.id,
      project_id:            projectId,
      approved_at:           new Date().toISOString(),
      approved_by:           userId,
      payment_status:        'approved',
      ...(purchaseOrderId ? { purchase_order_id: purchaseOrderId } : {}),
    })
    .eq('id', invoiceId)
    .select(NFE_COLS)
    .single<NfeInvoice>();

  if (updErr || !updated) throw new Error(`Erro ao atualizar NF-e: ${updErr?.message}`);
  return updated;
}

// ============================================================
// F1 — VINCULAR NF-e A TÍTULO EXISTENTE
// Vincula a NF-e a uma internal_transaction (Boleto) já existente.
// ============================================================

export async function linkExistingTransaction(params: {
  invoiceId: string;
  transactionId: string;
  userId: string;
}): Promise<NfeInvoice> {
  const { invoiceId, transactionId, userId } = params;

  // 1. Buscar a nota
  const { data: invoice, error: fetchErr } = await supabase
    .from('nfe_invoices')
    .select(NFE_COLS)
    .eq('id', invoiceId)
    .single<NfeInvoice>();

  if (fetchErr || !invoice) throw new Error('NF-e não encontrada');
  if (invoice.linked_transaction_id) throw new Error('NF-e já possui título financeiro vinculado');
  if (invoice.document_status !== 'active') throw new Error('NF-e ainda não foi processada com sucesso');

  // 2. Buscar a transação existente
  const { data: tx, error: txErr } = await supabase
    .from('internal_transactions')
    .select('id, project_id, organization_id')
    .eq('id', transactionId)
    .single();

  if (txErr || !tx) throw new Error('Título financeiro não encontrado');
  if (tx.organization_id !== invoice.organization_id) throw new Error('Título financeiro pertence a outra organização');

  // 3. Vincular a NF-e à transação
  const { data: updated, error: updErr } = await supabase
    .from('nfe_invoices')
    .update({
      linked_transaction_id: tx.id,
      project_id:            tx.project_id, // Herda a obra do título
      approved_at:           new Date().toISOString(),
      approved_by:           userId,
      payment_status:        'approved',
    })
    .eq('id', invoiceId)
    .select(NFE_COLS)
    .single<NfeInvoice>();

  if (updErr || !updated) throw new Error(`Erro ao atualizar NF-e: ${updErr?.message}`);
  return updated;
}

// ============================================================
// F2 — GERAR PEDIDO DE COMPRA A PARTIR DA NF-e
// Cria um purchase_order baseado nos dados extraídos e vincula à NF.
// ============================================================

export async function createOrderFromNfe(params: {
  invoiceId: string;
  projectId: string;
  userId: string;
  autoCreateSupplier: boolean;
}): Promise<NfeInvoice> {
  const { invoiceId, projectId, autoCreateSupplier } = params;

  // 1. Fetch NF-e and Items
  const invoiceDetail = await getNfeInvoiceWithItems(invoiceId);
  if (!invoiceDetail) throw new Error('NF-e não encontrada');
  if (invoiceDetail.purchase_order_id) throw new Error('NF-e já possui Pedido de Compra vinculado');

  // 2. Resolve Supplier (by CNPJ)
  let supplierId = '';
  const { data: suppliers, error: supErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('document', invoiceDetail.issuer_cnpj)
    .eq('organization_id', invoiceDetail.organization_id);

  if (supErr) throw new Error('Erro ao buscar fornecedor: ' + supErr.message);

  if (!suppliers || suppliers.length === 0) {
    if (!autoCreateSupplier) {
      throw new Error('SUPPLIER_NOT_FOUND');
    }
    // Auto-create supplier
    const newSup = await supplierService.addSupplier({
      organization_id: invoiceDetail.organization_id,
      document: invoiceDetail.issuer_cnpj,
      name: invoiceDetail.issuer_name,
      type: 'PJ',
      category: 'Geral',
    });
    supplierId = newSup.id;
  } else {
    supplierId = suppliers[0].id;
  }

  // 3. Map NF-e items to PurchaseOrderItems
  const orderItems = invoiceDetail.items.map(item => ({
    code: item.ncm || `NF-${item.line_number}`, // Fallback if NCM is missing
    description: item.description,
    unit: item.commercial_unit || 'UN',
    quantity: item.quantity,
    unitPrice: item.unit_value,
    total: item.total_value,
  }));

  // 4. Call orderService.createOrder
  const newOrder = await orderService.createOrder({
    projectId,
    supplierId,
    status: 'Rascunho', // Will start as draft so the user can review it
    deliveryDate: invoiceDetail.issue_date || new Date().toISOString().split('T')[0],
    items: orderItems,
  });

  // 5. Link Order to NF-e
  const { data: updated, error: updErr } = await supabase
    .from('nfe_invoices')
    .update({
      purchase_order_id: newOrder.id,
      project_id: projectId
    })
    .eq('id', invoiceId)
    .select(NFE_COLS)
    .single<NfeInvoice>();

  if (updErr || !updated) throw new Error(`Erro ao atualizar NF-e com o pedido: ${updErr?.message}`);
  return updated;
}
