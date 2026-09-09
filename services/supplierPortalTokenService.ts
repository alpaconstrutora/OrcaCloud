import { supabase } from '../lib/supabase';
import { PurchaseOrder, PurchaseOrderItem, QuotationRequest, QuotationResponse, Invoice, Supplier } from '../types';
import { NegotiationProposal } from './negotiationService';
import { receiptService, PurchaseReceipt } from './receiptService';
import { discrepancyService, PurchaseDiscrepancy } from './discrepancyService';
import { notificationLogService, NotificationLogEntry } from './notificationLogService';
import { mapChatRow, OrderChatMessage } from './chatService';
import { SupplierBankAccount } from '../types/supplierBankAccount';

export interface SupplierPortalToken {
  id: string;
  org_id: string;
  supplier_id: string;
  token: string;
  expires_at: string;
  last_used_at?: string;
  is_active: boolean;
  created_at?: string;
}

// Mapeia uma linha crua de `purchase_orders` (retornada pelas RPCs via row_to_json)
// para o mesmo formato camelCase que orderService.listOrders/getOrderById produz.
const mapOrderRow = (item: any): PurchaseOrder => ({
  id: item.id,
  number: item.number,
  projectId: item.project_id,
  // A RPC devolve o NOME da obra junto do pedido (a RLS de `projects` não deixa
  // o fornecedor lê-la direto). Sem esta linha o campo chega ao componente e
  // some aqui: a coluna "Obra" da lista do portal mostrava "—" em todas as
  // linhas e o cabeçalho do detalhe ficava vazio, com o dado disponível o tempo
  // todo na resposta.
  projectName: item.project_name || '-',
  supplierId: item.supplier_id,
  empresaId: item.empresa_id,
  deliveryDate: item.delivery_date,
  separationDate: item.separation_date,
  shippedDate: item.shipped_date,
  actualDeliveryDate: item.actual_delivery_date,
  status: item.status,
  paymentMethod: item.payment_method,
  paymentTermType: item.payment_term_type,
  paymentDays: item.payment_days,
  paymentInstallments: item.payment_installments,
  isFinancialApproved: item.is_financial_approved,
  deliveryMethod: item.delivery_method,
  deliveryLocation: item.delivery_location,
  receivedAt: item.received_at,
  receiptPhotoPath: item.receipt_photo_path,
  receiptNotes: item.receipt_notes,
  discrepancyReport: item.discrepancy_report,
  bankAccount: item.bank_account,
  costCenter: item.cost_center,
  costCenterId: item.cost_center_id,
  chartOfAccounts: item.chart_of_accounts,
  notes: item.notes,
  items: item.items,
  version: item.version,
  created_at: item.created_at,
  status_updated_at: item.status_updated_at,
} as PurchaseOrder);

const mapInvoiceRow = (item: any): Invoice => ({
  id: item.id,
  supplierId: item.supplier_id,
  orderId: item.order_id,
  filePath: item.file_path,
  fileName: item.file_name,
  amount: item.amount,
  dueDate: item.due_date,
  costCenterId: item.cost_center_id,
  chartOfAccountsId: item.chart_of_accounts_id,
  status: item.status,
  notes: item.notes,
  createdAt: item.created_at,
});

const mapQuotationRequestRow = (item: any): QuotationRequest => ({
  id: item.id,
  number: item.number,
  projectId: item.project_id,
  projectName: item.project_name || '-',
  title: item.title,
  description: item.description,
  deadline: item.deadline,
  status: item.status,
  items: item.items,
  invitedSupplierIds: item.invited_supplier_ids || [],
  deliveryDate: item.delivery_date,
  deliveryMethod: item.delivery_method,
  deliveryLocation: item.delivery_location,
  paymentMethod: item.payment_method,
  paymentTermType: item.payment_term_type,
  paymentDays: item.payment_days,
  paymentInstallments: item.payment_installments,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const mapQuotationResponseRow = (item: any): QuotationResponse => ({
  id: item.id,
  requestId: item.request_id,
  supplierId: item.supplier_id,
  items: item.items,
  deliveryDate: item.delivery_date,
  deliveryMethod: item.delivery_method,
  deliveryLocation: item.delivery_location,
  paymentMethod: item.payment_method,
  paymentTermType: item.payment_term_type,
  paymentDays: item.payment_days,
  paymentInstallments: item.payment_installments,
  status: item.status,
  negotiationStatus: item.negotiation_status || 'Original',
  counterProposal: item.counter_proposal,
  negotiationHistory: item.negotiation_history || [],
  notes: item.notes,
  created_at: item.created_at,
});

const mapNegotiationProposalRow = (item: any): NegotiationProposal => ({
  id: item.id,
  orderId: item.order_id,
  senderEmail: item.sender_email,
  senderRole: item.sender_role,
  deliveryDate: item.delivery_date,
  items: item.items,
  paymentMethod: item.payment_method,
  paymentTermType: item.payment_term_type,
  paymentDays: item.payment_days,
  paymentInstallments: item.payment_installments,
  message: item.message,
  status: item.status,
  createdAt: item.created_at,
});

export const supplierPortalTokenService = {
  // --- Gestão do link (admin autenticado) ---
  async generateToken(supplierId: string, orgId: string): Promise<string> {
    const { data, error } = await supabase.rpc('supplier_portal_generate_token', {
      p_supplier_id: supplierId,
      p_org_id: orgId,
    });
    if (error) throw error;
    return data as string;
  },

  async getTokenForSupplier(supplierId: string): Promise<SupplierPortalToken | null> {
    const { data, error } = await supabase
      .from('supplier_portal_tokens')
      .select('id, org_id, supplier_id, token, expires_at, last_used_at, is_active, created_at')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return data as SupplierPortalToken | null;
  },

  async revokeToken(supplierId: string, orgId: string): Promise<void> {
    const { error } = await supabase.rpc('supplier_portal_revoke_token', {
      p_supplier_id: supplierId,
      p_org_id: orgId,
    });
    if (error) throw error;
  },

  buildPortalUrl(token: string): string {
    return `${window.location.origin}/portal-fornecedor?token=${token}`;
  },

  // --- Acesso público via token (anon, sem login) ---
  async getPortalData(token: string): Promise<{ valid: boolean; supplier?: Supplier; org_id?: string }> {
    const { data, error } = await supabase.rpc('supplier_portal_get_data', { p_token: token });
    if (error) throw error;
    return data as any;
  },

  /**
   * Contas bancárias do fornecedor dono do token — o quarto grupo da tela
   * "Meus dados". Os outros três saem de `getPortalData`, porque
   * `supplier_portal_get_data` já devolve a linha inteira de `suppliers`;
   * `supplier_bank_accounts` é tabela à parte e precisou de RPC própria
   * (migration `aplicar_20270921000001`). As linhas vêm em snake_case, que é
   * exatamente o formato de `SupplierBankAccount` — sem mapeamento no meio.
   */
  async getBankAccounts(token: string): Promise<SupplierBankAccount[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_bank_accounts', { p_token: token });
    if (error) throw error;
    return ((data as any)?.data || []) as SupplierBankAccount[];
  },

  // Pedidos
  async getOrders(token: string): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_orders', { p_token: token });
    if (error) throw error;
    return ((data as any)?.data || []).map(mapOrderRow);
  },

  async getOrderDetail(token: string, orderId: string): Promise<{ valid: boolean; order?: PurchaseOrder; invoices: Invoice[] }> {
    const { data, error } = await supabase.rpc('supplier_portal_get_order_detail', { p_token: token, p_order_id: orderId });
    if (error) throw error;
    const res = data as any;
    if (!res?.valid) return { valid: false, invoices: [] };
    return {
      valid: true,
      order: mapOrderRow(res.order),
      invoices: (res.invoices || []).map(mapInvoiceRow),
    };
  },

  async updateOrderLogistics(token: string, orderId: string, updates: {
    status?: string;
    deliveryDate?: string;
    separationDate?: string;
    shippedDate?: string;
    actualDeliveryDate?: string;
  }): Promise<PurchaseOrder | null> {
    const { data, error } = await supabase.rpc('supplier_portal_update_order_logistics', {
      p_token: token,
      p_order_id: orderId,
      p_status: updates.status ?? null,
      p_delivery_date: updates.deliveryDate || null,
      p_separation_date: updates.separationDate || null,
      p_shipped_date: updates.shippedDate || null,
      p_actual_delivery_date: updates.actualDeliveryDate || null,
    });
    if (error) throw error;
    const res = data as any;
    return res?.valid ? mapOrderRow(res.data) : null;
  },

  // Negociação (Lances)
  async getNegotiationProposals(token: string, orderId: string): Promise<NegotiationProposal[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_negotiation_proposals', { p_token: token, p_order_id: orderId });
    if (error) throw error;
    return ((data as any)?.data || []).map(mapNegotiationProposalRow);
  },

  async createNegotiationProposal(token: string, orderId: string, proposal: {
    deliveryDate: string;
    items: PurchaseOrderItem[];
    paymentMethod?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    message?: string;
  }): Promise<NegotiationProposal | null> {
    const { data, error } = await supabase.rpc('supplier_portal_create_negotiation_proposal', {
      p_token: token,
      p_order_id: orderId,
      p_payload: proposal,
    });
    if (error) throw error;
    const res = data as any;
    return res?.valid ? mapNegotiationProposalRow(res.data) : null;
  },

  async acceptNegotiationProposal(token: string, proposalId: string, orderId: string): Promise<void> {
    const { data, error } = await supabase.rpc('supplier_portal_accept_negotiation_proposal', {
      p_token: token,
      p_proposal_id: proposalId,
      p_order_id: orderId,
    });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error('Não foi possível aceitar a proposta.');
  },

  // Cotações
  async getQuotations(token: string): Promise<QuotationRequest[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_quotations', { p_token: token });
    if (error) throw error;
    return ((data as any)?.data || []).map(mapQuotationRequestRow);
  },

  async getQuotationResponse(token: string, requestId: string): Promise<QuotationResponse | null> {
    const { data, error } = await supabase.rpc('supplier_portal_get_quotation_response', { p_token: token, p_request_id: requestId });
    if (error) throw error;
    const res = data as any;
    return res?.data ? mapQuotationResponseRow(res.data) : null;
  },

  async submitQuotationResponse(token: string, requestId: string, response: Omit<QuotationResponse, 'id' | 'requestId' | 'supplierId' | 'created_at'>): Promise<QuotationResponse | null> {
    const { data, error } = await supabase.rpc('supplier_portal_submit_quotation_response', {
      p_token: token,
      p_request_id: requestId,
      p_payload: response,
    });
    if (error) throw error;
    const res = data as any;
    return res?.valid ? mapQuotationResponseRow(res.data) : null;
  },

  async sendCounterProposal(token: string, responseId: string, counterProposal: NonNullable<QuotationResponse['counterProposal']>): Promise<void> {
    const { data, error } = await supabase.rpc('supplier_portal_send_counter_proposal', {
      p_token: token,
      p_response_id: responseId,
      p_counter_proposal: counterProposal,
      p_notes: counterProposal.notes || null,
    });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error('Não foi possível enviar a contraproposta.');
  },

  async respondToCounterProposal(token: string, responseId: string, accept: boolean, notes?: string): Promise<void> {
    const { data, error } = await supabase.rpc('supplier_portal_respond_counter_proposal', {
      p_token: token,
      p_response_id: responseId,
      p_accept: accept,
      p_notes: notes || null,
    });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error('Não foi possível responder à contraproposta.');
  },

  // Documentos (NFe)
  async getInvoices(token: string): Promise<Invoice[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_invoices', { p_token: token });
    if (error) throw error;
    return ((data as any)?.data || []).map(mapInvoiceRow);
  },

  // Upload via Edge Function (bucket `invoices` é privado; sessão anon não tem RLS para gravar).
  async uploadInvoice(token: string, file: File, orderId?: string): Promise<Invoice> {
    const formData = new FormData();
    formData.append('token', token);
    formData.append('file', file);
    if (orderId) formData.append('orderId', orderId);
    const { data, error } = await supabase.functions.invoke('supplier-portal-upload', { body: formData });
    if (error) throw error;
    if (!data?.invoice) throw new Error(data?.error || 'Erro ao enviar arquivo.');
    return mapInvoiceRow(data.invoice);
  },

  async linkInvoiceOrder(token: string, invoiceId: string, orderId: string | null): Promise<void> {
    const { data, error } = await supabase.rpc('supplier_portal_link_invoice_order', {
      p_token: token,
      p_invoice_id: invoiceId,
      p_order_id: orderId,
    });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error('Erro ao vincular pedido.');
  },

  async deleteInvoice(token: string, invoiceId: string): Promise<void> {
    const { data, error } = await supabase.rpc('supplier_portal_delete_invoice', { p_token: token, p_invoice_id: invoiceId });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error('Erro ao excluir documento.');
  },

  // Link assinado para abrir/baixar uma NFe, via Edge Function (mesma razão do upload).
  async getInvoiceDownloadUrl(token: string, storagePath: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('supplier-portal-download', {
      body: { token, storagePath },
    });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de acesso ao documento.');
    return data.signedUrl;
  },

  // ── Aba Recebimento ─────────────────────────────────────────────────────
  //
  // Antes destas RPCs a aba existia na barra e ficava vazia pelo link público:
  // o carregamento do detalhe fazia `return` depois de buscar o pedido, então
  // comprovante e divergência nunca chegavam a ser pedidos ao banco.

  async getOrderReceipts(
    token: string,
    orderId: string,
  ): Promise<{ receipts: PurchaseReceipt[]; discrepancies: PurchaseDiscrepancy[] }> {
    const { data, error } = await supabase.rpc('supplier_portal_get_order_receipts', {
      p_token: token,
      p_order_id: orderId,
    });
    if (error) throw error;
    const res = data as { valid?: boolean; receipts?: any[]; discrepancies?: any[] } | null;
    // Token expirado/revogado não é erro de tela: devolve vazio e a aba mostra
    // o empty state, como já faz o resto do portal.
    if (!res?.valid) return { receipts: [], discrepancies: [] };

    return {
      receipts: (res.receipts || []).map((r: any) => ({
        ...receiptService.mapReceipt(r),
        items: (r.items || []).map(receiptService.mapReceiptItem),
      })),
      discrepancies: (res.discrepancies || []).map(discrepancyService.map),
    };
  },

  async respondDiscrepancy(token: string, discrepancyId: string, response: string): Promise<PurchaseDiscrepancy> {
    const { data, error } = await supabase.rpc('supplier_portal_respond_discrepancy', {
      p_token: token,
      p_discrepancy_id: discrepancyId,
      p_response: response,
    });
    if (error) throw error;
    const res = data as { valid?: boolean; error?: string; data?: unknown } | null;
    if (!res?.valid) {
      throw new Error(
        res?.error === 'ja_resolvida'
          ? 'Esta divergência já foi resolvida pelo comprador.'
          : res?.error === 'resposta_vazia'
            ? 'Escreva uma resposta antes de enviar.'
            : 'Não foi possível registrar a resposta.',
      );
    }
    return discrepancyService.map(res.data);
  },

  // Foto do comprovante: bucket `receipts` é privado e suas policies são todas
  // org-member, então a sessão anon do link nunca assina a URL sozinha — vai
  // pela Edge Function, que valida o token com service role antes de assinar.
  async getReceiptPhotoUrl(token: string, storagePath: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('supplier-portal-download', {
      body: { token, storagePath, bucket: 'receipts' },
    });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link do comprovante.');
    return data.signedUrl;
  },

  // ── Aba Comunicação ─────────────────────────────────────────────────────

  async getOrderNotifications(token: string, orderId: string): Promise<NotificationLogEntry[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_order_notifications', {
      p_token: token,
      p_order_id: orderId,
    });
    if (error) throw error;
    const res = data as { valid?: boolean; data?: any[] } | null;
    if (!res?.valid) return [];
    return (res.data || []).map(notificationLogService.map);
  },

  async getOrderMessages(token: string, orderId: string): Promise<OrderChatMessage[]> {
    const { data, error } = await supabase.rpc('supplier_portal_get_order_messages', {
      p_token: token,
      p_order_id: orderId,
    });
    if (error) throw error;
    const res = data as { valid?: boolean; data?: any[] } | null;
    if (!res?.valid) return [];
    return (res.data || []).map(mapChatRow);
  },

  // Nome e e-mail do remetente NÃO viajam daqui: a RPC os tira do próprio
  // token. Quem abre o link não escolhe de quem a mensagem é.
  async sendOrderMessage(token: string, orderId: string, message: string): Promise<OrderChatMessage> {
    const { data, error } = await supabase.rpc('supplier_portal_send_order_message', {
      p_token: token,
      p_order_id: orderId,
      p_message: message,
    });
    if (error) throw error;
    const res = data as { valid?: boolean; error?: string; data?: unknown } | null;
    if (!res?.valid) {
      throw new Error(
        res?.error === 'mensagem_vazia'
          ? 'Escreva uma mensagem antes de enviar.'
          : 'Não foi possível enviar a mensagem.',
      );
    }
    return mapChatRow(res.data);
  },
};
