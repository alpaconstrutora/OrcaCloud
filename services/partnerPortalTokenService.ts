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

  async getContracts(token: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('partner_portal_get_contracts', { p_token: token });
    if (error) throw error;
    return (data as any)?.data || [];
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
