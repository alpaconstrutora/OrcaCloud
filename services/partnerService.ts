import { supabase } from '../lib/supabase';
import {
  PartnerWorkspace,
  PartnerUser,
  PartnerConversation,
  PartnerMessage,
  PartnerRequest,
  PartnerSharedDocument
} from '../types';

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
      .select('*, document:opura_documents(*, active_version:opura_document_versions(*))')
      .eq('partner_workspace_id', workspaceId)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('[PARTNER SERVICE] Error listing shared documents:', error);
      throw error;
    }

    return (data || []) as PartnerSharedDocument[];
  },

  async shareDocument(workspaceId: string, documentId: string, sharedBy: string): Promise<PartnerSharedDocument> {
    const { data, error } = await supabase
      .from('partner_shared_documents')
      .insert({
        partner_workspace_id: workspaceId,
        document_id: documentId,
        shared_by: sharedBy
      })
      .select()
      .single();

    if (error) {
      console.error('[PARTNER SERVICE] Error sharing document:', error);
      throw error;
    }

    return data as PartnerSharedDocument;
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
  }
};
