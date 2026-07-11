import { supabase } from '../lib/supabase';
import {
  PartnerWorkspace,
  PartnerUser,
  PartnerConversation,
  PartnerMessage,
  PartnerRequest,
  PartnerSharedDocument,
  OpuraDocumentCategoria
} from '../types';
import { documentService } from './documentService';
import { notificationService } from './notificationService';

export const partnerService = {
  // --- Workspaces ---
  async listWorkspaces(organizationId?: string): Promise<PartnerWorkspace[]> {
    let query = supabase
      .from('partner_workspaces')
      .select('*, supplier:suppliers(name)');

    if (organizationId && organizationId !== '') {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[PARTNER SERVICE] Error listing workspaces:', error);
      throw error;
    }

    return (data || []).map((w: any) => ({
      ...w,
      supplier_name: w.supplier?.name || 'Fornecedor sem nome'
    })) as PartnerWorkspace[];
  },

  async getWorkspaceById(id: string): Promise<PartnerWorkspace | null> {
    const { data, error } = await supabase
      .from('partner_workspaces')
      .select('*, supplier:suppliers(name)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[PARTNER SERVICE] Error getting workspace:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      supplier_name: data.supplier?.name || 'Fornecedor sem nome'
    } as PartnerWorkspace;
  },

  async getWorkspaceBySupplier(supplierId: string, organizationId: string): Promise<PartnerWorkspace | null> {
    const { data, error } = await supabase
      .from('partner_workspaces')
      .select('*, supplier:suppliers(name)')
      .eq('supplier_id', supplierId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      console.error('[PARTNER SERVICE] Error getting workspace by supplier:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      supplier_name: data.supplier?.name || 'Fornecedor sem nome'
    } as PartnerWorkspace;
  },

  async saveWorkspace(workspace: Partial<PartnerWorkspace>): Promise<PartnerWorkspace> {
    if (workspace.id) {
      const { data, error } = await supabase
        .from('partner_workspaces')
        .update({
          ...workspace,
          updated_at: new Date().toISOString()
        })
        .eq('id', workspace.id)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error updating workspace:', error);
        throw error;
      }
      return data as PartnerWorkspace;
    } else {
      const { data, error } = await supabase
        .from('partner_workspaces')
        .insert(workspace)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error inserting workspace:', error);
        throw error;
      }
      return data as PartnerWorkspace;
    }
  },

  // --- Partner Users ---
  async listPartnerUsers(workspaceId: string): Promise<PartnerUser[]> {
    const { data, error } = await supabase
      .from('partner_users')
      .select('*')
      .eq('partner_workspace_id', workspaceId)
      .order('name');

    if (error) {
      console.error('[PARTNER SERVICE] Error listing partner users:', error);
      throw error;
    }

    return (data || []) as PartnerUser[];
  },

  async getPartnerUserByEmail(email: string): Promise<PartnerUser | null> {
    const { data, error } = await supabase
      .from('partner_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[PARTNER SERVICE] Error getting partner user by email:', error);
      throw error;
    }

    return data as PartnerUser | null;
  },

  async savePartnerUser(user: Partial<PartnerUser>): Promise<PartnerUser> {
    if (user.id) {
      const { data, error } = await supabase
        .from('partner_users')
        .update({
          ...user,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error updating partner user:', error);
        throw error;
      }
      return data as PartnerUser;
    } else {
      const { data, error } = await supabase
        .from('partner_users')
        .insert(user)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error inserting partner user:', error);
        throw error;
      }
      return data as PartnerUser;
    }
  },

  async deletePartnerUser(id: string): Promise<void> {
    const { error } = await supabase
      .from('partner_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[PARTNER SERVICE] Error deleting partner user:', error);
      throw error;
    }
  },

  // --- Conversations & Chat ---
  async listConversations(workspaceId: string): Promise<PartnerConversation[]> {
    const { data, error } = await supabase
      .from('partner_conversations')
      .select('*')
      .eq('partner_workspace_id', workspaceId)
      .order('name');

    if (error) {
      console.error('[PARTNER SERVICE] Error listing conversations:', error);
      throw error;
    }

    return (data || []) as PartnerConversation[];
  },

  async saveConversation(conversation: Partial<PartnerConversation>): Promise<PartnerConversation> {
    if (conversation.id) {
      const { data, error } = await supabase
        .from('partner_conversations')
        .update(conversation)
        .eq('id', conversation.id)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error updating conversation:', error);
        throw error;
      }
      return data as PartnerConversation;
    } else {
      const { data, error } = await supabase
        .from('partner_conversations')
        .insert(conversation)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error inserting conversation:', error);
        throw error;
      }
      return data as PartnerConversation;
    }
  },

  async listMessages(conversationId: string): Promise<PartnerMessage[]> {
    const { data, error } = await supabase
      .from('partner_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[PARTNER SERVICE] Error listing messages:', error);
      throw error;
    }

    return (data || []) as PartnerMessage[];
  },

  async sendMessage(message: Partial<PartnerMessage>): Promise<PartnerMessage> {
    const { data, error } = await supabase
      .from('partner_messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      console.error('[PARTNER SERVICE] Error sending message:', error);
      throw error;
    }

    return data as PartnerMessage;
  },

  // --- Requests ---
  async listRequests(workspaceId: string): Promise<PartnerRequest[]> {
    const { data, error } = await supabase
      .from('partner_requests')
      .select('*')
      .eq('partner_workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PARTNER SERVICE] Error listing requests:', error);
      throw error;
    }

    return (data || []) as PartnerRequest[];
  },

  async saveRequest(request: Partial<PartnerRequest>): Promise<PartnerRequest> {
    if (request.id) {
      const { data, error } = await supabase
        .from('partner_requests')
        .update({
          ...request,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error updating request:', error);
        throw error;
      }
      return data as PartnerRequest;
    } else {
      const { data, error } = await supabase
        .from('partner_requests')
        .insert(request)
        .select()
        .single();

      if (error) {
        console.error('[PARTNER SERVICE] Error inserting request:', error);
        throw error;
      }
      return data as PartnerRequest;
    }
  },

  // --- Shared Documents ---
  async listSharedDocuments(workspaceId: string): Promise<PartnerSharedDocument[]> {
    const { data, error } = await supabase
      .from('partner_shared_documents')
      .select('*, document:opura_documents(*, active_version:opura_document_versions!fk_active_version(*))')
      .eq('partner_workspace_id', workspaceId)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('[PARTNER SERVICE] Error listing shared documents:', error);
      throw error;
    }

    return (data || []) as PartnerSharedDocument[];
  },

  // Com quais workspaces de parceiro um documento já está compartilhado (evita reshare duplicado sem perceber)
  async listSharingsForDocument(documentId: string): Promise<{ partner_workspace_id: string; supplier_name: string }[]> {
    const { data, error } = await supabase
      .from('partner_shared_documents')
      .select('partner_workspace_id, workspace:partner_workspaces(supplier:suppliers(name))')
      .eq('document_id', documentId);

    if (error) {
      console.error('[PARTNER SERVICE] Error listing sharings for document:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      partner_workspace_id: row.partner_workspace_id,
      supplier_name: row.workspace?.supplier?.name || 'Fornecedor sem nome',
    }));
  },

  async shareDocument(workspaceId: string, documentId: string, sharedBy: string): Promise<PartnerSharedDocument> {
    const { data, error } = await supabase
      .from('partner_shared_documents')
      .insert({
        partner_workspace_id: workspaceId,
        document_id: documentId,
        shared_by: sharedBy
      })
      .select('*, document:opura_documents(nome, organization_id)')
      .single();

    if (error) {
      console.error('[PARTNER SERVICE] Error sharing document:', error);
      throw error;
    }

    const sharedDoc = (data as any)?.document;

    // Notificar os usuários ativos do parceiro e registrar auditoria (best-effort, não bloqueia o compartilhamento)
    this.notifyPartnersOfSharedDocument(workspaceId, sharedDoc?.nome, sharedBy).catch((err) => {
      console.error('[PARTNER SERVICE] Erro ao notificar parceiros sobre documento compartilhado:', err);
    });

    if (sharedDoc?.organization_id) {
      documentService
        .logDocumentAction(
          sharedDoc.organization_id,
          documentId,
          sharedBy,
          'compartilhado_parceiro',
          `Documento compartilhado com o Portal do Parceiro (workspace ${workspaceId})`
        )
        .catch((err) => console.error('[PARTNER SERVICE] Erro ao registrar auditoria de compartilhamento:', err));
    }

    return data as PartnerSharedDocument;
  },

  async notifyPartnersOfSharedDocument(workspaceId: string, documentName: string | undefined, sharedBy: string): Promise<void> {
    const { data: users, error } = await supabase
      .from('partner_users')
      .select('email')
      .eq('partner_workspace_id', workspaceId)
      .eq('is_active', true);

    if (error || !users || users.length === 0) return;

    await Promise.all(
      users.map((u: { email: string }) =>
        notificationService.sendNotification({
          recipientEmail: u.email,
          title: 'Novo Documento Compartilhado',
          message: `${sharedBy} compartilhou o documento "${documentName || 'documento'}" com você no Portal do Parceiro.`,
          type: 'documento_compartilhado'
        })
      )
    );
  },

  async unshareDocument(workspaceId: string, documentId: string): Promise<void> {
    const { error } = await supabase
      .from('partner_shared_documents')
      .delete()
      .eq('partner_workspace_id', workspaceId)
      .eq('document_id', documentId);

    if (error) {
      console.error('[PARTNER SERVICE] Error unsharing document:', error);
      throw error;
    }
  },

  // --- Anexos de Solicitações (Onda 5: fluxo reverso — parceiro envia arquivo) ---
  async uploadRequestAttachment(workspaceId: string, file: File): Promise<string> {
    const path = `partner-uploads/${workspaceId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from('opura-docs')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('[PARTNER SERVICE] Error uploading request attachment:', error);
      throw error;
    }
    return path;
  },

  async getAttachmentDownloadUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('opura-docs')
      .createSignedUrl(path, 60 * 15);

    if (error) {
      console.error('[PARTNER SERVICE] Error creating signed URL for attachment:', error);
      throw error;
    }
    return data.signedUrl;
  },

  // Promove um anexo enviado pelo parceiro a um documento formal do GED (ação manual do time interno)
  async promoteAttachmentToDocument(
    workspaceId: string,
    storagePath: string,
    docName: string,
    categoria: OpuraDocumentCategoria,
    promotedByEmail: string
  ): Promise<void> {
    const ws = await this.getWorkspaceById(workspaceId);
    if (!ws) throw new Error('Workspace de parceiro não encontrado.');

    const { data: newDoc, error: docError } = await supabase
      .from('opura_documents')
      .insert({
        organization_id: ws.organization_id,
        nome: docName,
        descricao: `Documento enviado pelo parceiro ${ws.supplier_name || ''} via Portal do Parceiro`.trim(),
        categoria,
        tipo_documento: 'Documento de Parceiro',
        status: 'ativo',
        supplier_id: ws.supplier_id,
        criado_por: promotedByEmail,
      })
      .select()
      .single();

    if (docError) {
      console.error('[PARTNER SERVICE] Error creating document from attachment:', docError);
      throw docError;
    }

    const { data: newVersion, error: versionError } = await supabase
      .from('opura_document_versions')
      .insert({
        document_id: newDoc.id,
        version_number: 1,
        storage_path: storagePath,
        tamanho: 0,
        mime_type: 'application/octet-stream',
        criado_por: promotedByEmail,
      })
      .select()
      .single();

    if (versionError) {
      console.error('[PARTNER SERVICE] Error registering version from attachment:', versionError);
      await supabase.from('opura_documents').delete().eq('id', newDoc.id);
      throw versionError;
    }

    const { error: updateError } = await supabase
      .from('opura_documents')
      .update({ active_version_id: newVersion.id })
      .eq('id', newDoc.id);

    if (updateError) {
      console.error('[PARTNER SERVICE] Error linking active version from attachment:', updateError);
      throw updateError;
    }

    await documentService.logDocumentAction(
      ws.organization_id,
      newDoc.id,
      promotedByEmail,
      'criado',
      'Documento promovido a partir de um anexo de solicitação do Portal do Parceiro'
    );
  }
};
