import { supabase } from '../lib/supabase';

export interface PartnerPortalToken {
  id: string;
  org_id: string;
  workspace_id: string;
  token: string;
  expires_at: string;
  last_used_at?: string;
  is_active: boolean;
  created_at?: string;
}

export const partnerPortalTokenService = {
  // --- Gestão do link (admin autenticado) ---
  async generateToken(workspaceId: string, orgId: string): Promise<string> {
    const { data, error } = await supabase.rpc('partner_portal_generate_token', {
      p_workspace_id: workspaceId,
      p_org_id: orgId,
    });
    if (error) throw error;
    return data as string;
  },

  async getTokenForWorkspace(workspaceId: string): Promise<PartnerPortalToken | null> {
    const { data, error } = await supabase
      .from('partner_portal_tokens')
      .select('id, org_id, workspace_id, token, expires_at, last_used_at, is_active, created_at')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return data as PartnerPortalToken | null;
  },

  async revokeToken(workspaceId: string, orgId: string): Promise<void> {
    const { error } = await supabase.rpc('partner_portal_revoke_token', {
      p_workspace_id: workspaceId,
      p_org_id: orgId,
    });
    if (error) throw error;
  },

  buildPortalUrl(token: string): string {
    return `${window.location.origin}/portal-parceiro?token=${token}`;
  },

  // --- Acesso público via token (anon, sem login) ---
  async getPortalData(token: string): Promise<{ valid: boolean; workspace?: any; org_id?: string }> {
    const { data, error } = await supabase.rpc('partner_portal_get_data', { p_token: token });
    if (error) throw error;
    return data as any;
  },

  async getSharedDocuments(token: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_shared_documents', { p_token: token });
    if (error) throw error;
    return (data as any)?.data || [];
  },

  // Igual ao getSharedDocuments, mas devolve também a árvore de pastas (fecho recursivo
  // com pastas-pai) e as disciplinas (code -> name), para a aba Documentos montar a
  // hierarquia Pasta -> Disciplina -> Documentos. Ver migration 20270823000005.
  async getSharedDocumentsBundle(token: string): Promise<{
    documents: any[];
    folders: { id: string; name: string; parent_id: string | null; naming_mask: string | null }[];
    disciplines: { code: string; name: string }[];
    // Pastas compartilhadas explicitamente (raiz + subárvore): aparecem na sidebar
    // mesmo sem documento dentro. Ver migration 20270861000000.
    sharedFolderIds: string[];
  }> {
    const { data, error } = await supabase.rpc('partner_portal_get_shared_documents', { p_token: token });
    if (error) throw error;
    const payload = (data as any) || {};
    return {
      documents: payload.data || [],
      folders: payload.folders || [],
      disciplines: payload.disciplines || [],
      sharedFolderIds: payload.shared_folder_ids || [],
    };
  },

  async getContracts(token: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_contracts', { p_token: token });
    if (error) throw error;
    return (data as any)?.data || [];
  },

  async getContractDetail(
    token: string,
    contractId: string
  ): Promise<{ valid: boolean; items: any[]; addendums: any[]; measurements: any[] }> {
    const { data, error } = await supabase.rpc('partner_portal_get_contract_detail', {
      p_token: token,
      p_contract_id: contractId,
    });
    if (error) throw error;
    return data as any;
  },

  // Financeiro: parcelas/contas a pagar, medições (com NF) e retenção do fornecedor.
  // p_contract_id opcional filtra a um único contrato (usado pelo detalhe da aba Contratos);
  // sem ele, traz o consolidado de todos os contratos do fornecedor.
  async getFinancials(token: string, contractId?: string): Promise<{
    valid: boolean;
    contracts: any[];
    installments: any[];
    measurements: any[];
    retention: { retained: number; released: number; balance: number };
  }> {
    const { data, error } = await supabase.rpc('partner_portal_get_financials', {
      p_token: token,
      p_contract_id: contractId ?? null,
    });
    if (error) throw error;
    return data as any;
  },

  async setMeasurementInvoice(token: string, measurementId: string, url: string): Promise<void> {
    const { data, error } = await supabase.rpc('partner_portal_set_measurement_invoice', {
      p_token: token,
      p_measurement_id: measurementId,
      p_url: url,
    });
    if (error) throw error;
    if (!(data as any)?.valid) throw new Error((data as any)?.error || 'Não foi possível anexar a nota fiscal.');
  },

  // Upload da NF de uma medição — vai para o bucket público 'documents' (mesmo caminho que
  // ContractMeasurementModal.tsx usa no admin), diferente do uploadAttachment acima (opura-docs).
  async uploadInvoice(token: string, contractId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('token', token);
    formData.append('contractId', contractId);
    formData.append('target', 'invoice');
    formData.append('file', file);
    const { data, error } = await supabase.functions.invoke('partner-portal-upload', { body: formData });
    if (error) throw error;
    if (!data?.publicUrl) throw new Error(data?.error || 'Erro ao enviar nota fiscal.');
    return data.publicUrl;
  },

  async getRequests(token: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_requests', { p_token: token });
    if (error) throw error;
    return (data as any)?.data || [];
  },

  async createRequest(
    token: string,
    payload: { title: string; description: string; type: string; priority: string; attachmentPaths?: string[] }
  ): Promise<any> {
    const { data, error } = await supabase.rpc('partner_portal_create_request', {
      p_token: token,
      p_title: payload.title,
      p_description: payload.description,
      p_type: payload.type,
      p_priority: payload.priority,
      p_attachment_paths: payload.attachmentPaths || [],
    });
    if (error) throw error;
    return (data as any)?.data;
  },

  // Upload de arquivo via link público (sessão anon não tem RLS de storage para escrever
  // em partner-uploads/; a Edge Function valida o token e faz o upload com service role).
  async uploadAttachment(token: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('token', token);
    formData.append('file', file);
    const { data, error } = await supabase.functions.invoke('partner-portal-upload', { body: formData });
    if (error) throw error;
    if (!data?.storagePath) throw new Error(data?.error || 'Erro ao enviar arquivo.');
    return data.storagePath;
  },

  async getConversations(token: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_conversations', { p_token: token });
    if (error) throw error;
    return (data as any)?.data || [];
  },

  async getMessages(token: string, conversationId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_messages', {
      p_token: token,
      p_conversation_id: conversationId,
    });
    if (error) throw error;
    return (data as any)?.data || [];
  },

  async sendMessage(token: string, conversationId: string, message: string): Promise<any> {
    const { data, error } = await supabase.rpc('partner_portal_send_message', {
      p_token: token,
      p_conversation_id: conversationId,
      p_message: message,
    });
    if (error) throw error;
    return (data as any)?.data;
  },

  // Link assinado para um documento do GED compartilhado, via Edge Function
  // (RLS de storage.objects exige sessão authenticated de partner_users; a
  // sessão do link público é anon, então a validação+assinatura acontece
  // no backend com service role, após confirmar o vínculo do arquivo).
  async getDocumentDownloadUrl(token: string, storagePath: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('partner-portal-download', {
      body: { token, storagePath },
    });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(data?.error || 'Erro ao gerar link de acesso ao documento.');
    return data.signedUrl;
  },
};
