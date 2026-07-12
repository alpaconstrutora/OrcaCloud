import { OpuraDocument } from './documents';

export type PartnerRole = 'ADMINISTRADOR' | 'GESTOR' | 'FINANCEIRO' | 'OPERACIONAL';

export type PartnerRequestType = 'CONTRATO' | 'TECNICA' | 'FINANCEIRA' | 'DOCUMENTACAO' | 'ALTERACAO';

export type PartnerRequestStatus = 'ABERTO' | 'EM_ANALISE' | 'RESPONDIDO' | 'CONCLUIDO' | 'ARQUIVADO';

export type PartnerRequestPriority = 'BAIXA' | 'MEDIA' | 'ALTA';

export interface PartnerWorkspace {
  id: string;
  /** NULL = parceiro global ("Todas as Organizações"), espelhando suppliers.organization_id. */
  organization_id: string | null;
  supplier_id: string;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  supplier_name?: string; // Carregado via Join
}

export interface PartnerUser {
  id: string;
  partner_workspace_id: string;
  user_id?: string;
  email: string;
  name: string;
  phone?: string;
  role: PartnerRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerConversation {
  id: string;
  partner_workspace_id: string;
  name: string;
  project_id?: string;
  created_at: string;
}

export interface PartnerMessage {
  id: string;
  conversation_id: string;
  sender_email: string;
  sender_name: string;
  sender_type: 'INTERNAL' | 'EXTERNAL';
  message: string;
  attachments: string[];
  created_at: string;
}

export interface PartnerRequest {
  id: string;
  partner_workspace_id: string;
  title: string;
  description: string;
  type: PartnerRequestType;
  status: PartnerRequestStatus;
  priority: PartnerRequestPriority;
  due_date?: string;
  assigned_to_email?: string;
  created_by_email: string;
  attachment_paths?: string[];
  created_at: string;
  updated_at: string;
}

export interface PartnerSharedDocument {
  id: string;
  partner_workspace_id: string;
  document_id: string;
  shared_by: string;
  shared_at: string;
  document?: OpuraDocument; // Carregado via Join
}

// Tipos de Insert/Update
export type PartnerWorkspaceInsert = Omit<PartnerWorkspace, 'id' | 'created_at' | 'updated_at'>;
export type PartnerWorkspaceUpdate = Partial<PartnerWorkspaceInsert>;

export type PartnerUserInsert = Omit<PartnerUser, 'id' | 'created_at' | 'updated_at'>;
export type PartnerUserUpdate = Partial<PartnerUserInsert>;

export type PartnerConversationInsert = Omit<PartnerConversation, 'id' | 'created_at'>;

export type PartnerMessageInsert = Omit<PartnerMessage, 'id' | 'created_at'>;

export type PartnerRequestInsert = Omit<PartnerRequest, 'id' | 'created_at' | 'updated_at'>;
export type PartnerRequestUpdate = Partial<PartnerRequestInsert>;

export type PartnerSharedDocumentInsert = Omit<PartnerSharedDocument, 'id' | 'shared_at'>;
