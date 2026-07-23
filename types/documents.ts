export type OpuraDocumentCategoria = 'juridico' | 'engenharia' | 'compliance' | 'financeiro' | 'comercial';

export type OpuraDocumentStatus = 'ativo' | 'vencido' | 'alerta' | 'arquivado' | 'pendente_aprovacao';

export interface OpuraDocument {
  id: string;
  organization_id: string;
  nome: string;
  descricao?: string;
  autor?: string;
  categoria: OpuraDocumentCategoria;
  tipo_documento: string;
  // Código da disciplina (opura_dms_disciplines.code), escolhido explicitamente
  // no upload/edição — não é extraído do nome do arquivo.
  discipline_code?: string | null;
  status: OpuraDocumentStatus;
  data_emissao?: string;
  data_validade?: string;
  alerta_dias_antecedencia: number;
  tags: string[];
  criado_por: string;
  created_at: string;
  updated_at: string;

  // Chaves Estrangeiras Opcionais (Vínculos Operacionais)
  project_id?: string;
  company_id?: string;
  contract_id?: string;
  supplier_id?: string;
  client_id?: string;
  investor_id?: string;
  active_version_id?: string;
  folder_id?: string;
  is_integrated?: boolean;
  approval_status?: OpuraDocumentApprovalStatus;

  // Bloqueio para edição (trava): enquanto preenchido, só locked_by ou admin
  // podem editar o documento ou subir nova versão.
  locked_by?: string | null;
  locked_by_name?: string | null;
  locked_at?: string | null;
  locked_version?: number | null;

  // Joins opcionais carregados pelo service
  active_version?: OpuraDocumentVersion;
  versions?: OpuraDocumentVersion[];
}

export interface OpuraFolder {
  id: string;
  organization_id: string;
  project_id?: string;
  name: string;
  parent_id?: string;
  categoria: OpuraDocumentCategoria;
  naming_mask?: string;
  disciplines?: string[];
  created_at: string;
  updated_at: string;
}

export type OpuraFolderInsert = Omit<
  OpuraFolder,
  'id' | 'created_at' | 'updated_at'
>;

export interface OpuraDocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  tamanho: number;
  mime_type: string;
  criado_por: string;
  created_at: string;
}

export type OpuraDocumentInsert = Omit<
  OpuraDocument,
  'id' | 'created_at' | 'updated_at' | 'criado_por' | 'active_version' | 'versions'
>;

export type OpuraDocumentUpdate = Partial<OpuraDocumentInsert>;

export type OpuraDocumentVersionInsert = Omit<
  OpuraDocumentVersion,
  'id' | 'created_at' | 'criado_por'
>;

export type OpuraDocumentApprovalStatus = 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado';

export interface OpuraDocumentApproval {
  id: string;
  document_id: string;
  requested_by: string;
  approver_email: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  feedback?: string;
  created_at: string;
  updated_at: string;

  // Join opcional
  document?: OpuraDocument;
}

export type OpuraDocumentApprovalInsert = Omit<
  OpuraDocumentApproval,
  'id' | 'created_at' | 'updated_at' | 'document'
>;

export interface OpuraDocumentAuditLog {
  id: string;
  organization_id: string;
  document_id: string;
  user_email: string;
  action: 'criado' | 'versao_enviada' | 'download' | 'visualizado' | 'movido_pasta' | 'status_alterado' | 'compartilhado_parceiro' | 'bloqueado_edicao' | 'desbloqueado_edicao' | 'compartilhado_portal';
  details?: string;
  created_at: string;
}

export type OpuraDocumentPortalAudience = 'cliente' | 'colaborador';

export interface OpuraDocumentPortalShare {
  id: string;
  document_id: string;
  audience: OpuraDocumentPortalAudience;
  client_id?: string | null;
  employee_id?: string | null;
  shared_by: string;
  shared_at: string;
  document?: OpuraDocument; // Carregado via join
  client?: { name: string }; // Carregado via join (listPortalSharingsForDocument)
  employee?: { name: string }; // Carregado via join (listPortalSharingsForDocument)
}

export interface OpuraDocumentMarkup {
  id: string;
  document_id: string;
  version_id: string;
  user_email: string;
  markup_data: any; // rabiscos, caixas e nuvens de revisão
  created_at: string;
  updated_at: string;
}
