export type OpuraDocumentCategoria = 'juridico' | 'engenharia' | 'compliance' | 'financeiro' | 'comercial';

export type OpuraDocumentStatus = 'ativo' | 'vencido' | 'alerta' | 'arquivado' | 'pendente_aprovacao';

export interface OpuraDocument {
  id: string;
  organization_id: string;
  nome: string;
  descricao?: string;
  categoria: OpuraDocumentCategoria;
  tipo_documento: string;
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
