export interface OpuraCnoRegistration {
  id: string;
  organization_id: string;
  project_id: string | null;
  cno_number: string | null;
  status: 'rascunho' | 'documentacao_enviada' | 'validacao' | 'aberto' | 'encerrado';
  data_abertura: string | null;
  data_encerramento: string | null;
  matricula_imovel: string | null;
  alvara_numero: string | null;
  area_aprovada: number;
  area_real: number;
  padrao_construtivo: 'baixo' | 'normal' | 'alto' | null;
  tipo_obra: string | null;
  responsavel_tipo: 'proprietario' | 'incorporador' | 'construtor' | null;
  art_rrt: string | null;
  created_at: string;
  updated_at: string;
}

export type OpuraCnoRegistrationInsert = Omit<Partial<OpuraCnoRegistration>, 'id' | 'created_at' | 'updated_at'> & {
  organization_id: string;
};

export type OpuraCnoRegistrationUpdate = Partial<Omit<OpuraCnoRegistration, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;

export interface OpuraCnoSimulation {
  id: string;
  organization_id: string;
  project_id: string | null;
  scenario_name: string;
  area_construida: number;
  custo_estimado: number;
  metodo_construtivo: 'convencional' | 'estrutura_metalica' | 'pre_moldado' | 'steel_frame' | 'drywall' | 'modular' | 'industrializada' | null;
  regime_contratacao: 'empreitada_global' | 'equipe_propria' | 'empreitada_parcial' | 'turnkey' | 'bts' | null;
  mao_de_obra_estimada: number;
  inss_estimado: number;
  economia_potencial: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OpuraCnoSimulationInsert = Omit<Partial<OpuraCnoSimulation>, 'id' | 'created_at' | 'updated_at'> & {
  organization_id: string;
  scenario_name: string;
};

export type OpuraCnoSimulationUpdate = Partial<Omit<OpuraCnoSimulation, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;

export interface OpuraCnoDeduction {
  id: string;
  organization_id: string;
  project_id: string | null;
  cno_registration_id: string | null;
  source_type: 'nfe' | 'measurement';
  nfe_invoice_id: string | null;
  contractor_measurement_id: string | null;
  description: string;
  valor_base: number;
  valor_abatimento: number;
  status_validacao: 'pendente' | 'aproveitado' | 'rejeitado' | 'documentacao_pendente';
  revisao_ia_check: boolean;
  revisao_ia_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export type OpuraCnoDeductionInsert = Omit<Partial<OpuraCnoDeduction>, 'id' | 'created_at' | 'updated_at'> & {
  organization_id: string;
  source_type: 'nfe' | 'measurement';
  description: string;
  valor_base: number;
  valor_abatimento: number;
};

export type OpuraCnoDeductionUpdate = Partial<Omit<OpuraCnoDeduction, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;

export interface OpuraCnoComplianceScore {
  id: string;
  organization_id: string;
  project_id: string;
  score: number;
  status_color: 'verde' | 'amarelo' | 'vermelho';
  cno_regular: boolean;
  esocial_atualizado: boolean;
  retencoes_corretas: boolean;
  certidoes_validas: boolean;
  recolhimentos_compativeis: boolean;
  last_calculated_at: string;
}

export type OpuraCnoComplianceScoreInsert = Omit<OpuraCnoComplianceScore, 'id'>;
export type OpuraCnoComplianceScoreUpdate = Partial<Omit<OpuraCnoComplianceScore, 'id' | 'organization_id' | 'project_id'>>;

export interface OpuraCnoDctfweb {
  id: string;
  organization_id: string;
  cno_registration_id: string;
  declaration_number: string | null;
  transmission_date: string | null;
  principal_amount: number;
  fine_amount: number;
  interest_amount: number;
  total_amount: number;
  status: 'transmitida' | 'retificada' | 'paga' | 'cancelada';
  created_at: string;
  updated_at: string;
}

export type OpuraCnoDctfwebInsert = Omit<Partial<OpuraCnoDctfweb>, 'id' | 'created_at' | 'updated_at'> & {
  organization_id: string;
  cno_registration_id: string;
};

export type OpuraCnoDctfwebUpdate = Partial<Omit<OpuraCnoDctfweb, 'id' | 'organization_id' | 'cno_registration_id' | 'created_at' | 'updated_at'>>;

// ==========================================
// DOCUMENTOS DO CNO (opura_cno_documents)
// Checklist documental de abertura exigido pela Receita Federal.
// ==========================================

export type OpuraCnoDocumentBloco = 'obra' | 'administracao_publica' | 'identificacao' | 'representacao';
export type OpuraCnoDocumentStatus = 'pendente' | 'anexado' | 'vencido' | 'dispensado';

export interface OpuraCnoDocument {
  id: string;
  organization_id: string;
  cno_registration_id: string;
  bloco: OpuraCnoDocumentBloco;
  tipo_documento: string;
  titulo: string;
  referente_a: string | null;
  document_id: string | null;
  storage_path: string | null;
  numero: string | null;
  data_emissao: string | null;
  data_validade: string | null;
  status: OpuraCnoDocumentStatus;
  obrigatorio: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type OpuraCnoDocumentInsert = Omit<Partial<OpuraCnoDocument>, 'id' | 'created_at' | 'updated_at'> & {
  organization_id: string;
  cno_registration_id: string;
  bloco: OpuraCnoDocumentBloco;
  tipo_documento: string;
  titulo: string;
};

export type OpuraCnoDocumentUpdate = Partial<Omit<OpuraCnoDocument, 'id' | 'organization_id' | 'cno_registration_id' | 'created_at' | 'updated_at'>>;

/** Catálogo dos documentos exigidos, por bloco. Fonte dos selects do checklist. */
export const CNO_DOCUMENT_CATALOG: {
  bloco: OpuraCnoDocumentBloco;
  label: string;
  descricao?: string;
  tipos: { value: string; label: string; obrigatorio?: boolean }[];
}[] = [
  {
    bloco: 'obra',
    label: 'Obra',
    descricao: 'Documentos da própria obra junto à prefeitura.',
    tipos: [
      { value: 'projeto_aprovado', label: 'Projeto aprovado pela prefeitura municipal', obrigatorio: true },
      { value: 'habite_se', label: 'Habite-se' }
    ]
  },
  {
    bloco: 'administracao_publica',
    label: 'Obra contratada com Administração Pública',
    descricao: 'Apresentar um dos documentos abaixo, conforme o caso.',
    tipos: [
      { value: 'contrato_ordem_servico', label: 'Contrato e ordem de serviço' },
      { value: 'autorizacao_inicio', label: 'Autorização para início de execução (obra não sujeita à fiscalização municipal)' },
      { value: 'termo_recebimento', label: 'Termo de recebimento da obra' }
    ]
  },
  {
    bloco: 'identificacao',
    label: 'Identificação',
    descricao: 'Documento oficial de identidade do responsável pela obra.',
    tipos: [
      { value: 'rg', label: 'Carteira de identidade (RG)' },
      { value: 'ctps', label: 'Carteira de Trabalho e Previdência Social (CTPS)' },
      { value: 'cnh', label: 'Carteira Nacional de Habilitação (CNH)' },
      { value: 'identidade_profissional', label: 'Identidade profissional (OAB, CRC, CRM, CRA, CREA etc.)' },
      { value: 'carteira_funcional', label: 'Carteira funcional emitida por órgão público' },
      { value: 'identificacao_militar', label: 'Documento de identificação militar' },
      { value: 'passaporte', label: 'Passaporte' }
    ]
  },
  {
    bloco: 'representacao',
    label: 'Representação',
    descricao: 'Quando alguém age em nome de outra pessoa, menor/incapaz, falecido ou pessoa jurídica.',
    tipos: [
      // 5.1 — representar outra pessoa
      { value: 'procuracao', label: 'Procuração pública ou privada (poderes para representar na RFB)' },
      { value: 'identidade_representado', label: 'Identidade do representado (dispensada se a procuração tiver firma reconhecida)' },
      // 5.2 — representar menor de idade ou incapaz
      { value: 'identidade_menor_incapaz', label: 'Identidade do menor ou incapaz' },
      { value: 'termo_guarda_tutela_curatela', label: 'Termo judicial de guarda, tutoria ou curatela' },
      { value: 'certidao_interdicao', label: 'Certidão de interdição/tutela/curatela (cartório da comarca)' },
      // 5.3 — representar pessoa falecida
      { value: 'certidao_obito', label: 'Certidão de óbito' },
      { value: 'termo_inventariante', label: 'Termo de nomeação de inventariante' },
      { value: 'procuracao_herdeiros', label: 'Procuração pública dos herdeiros / declaração do tabelionato (antes do inventário)' },
      // 5.4 — representar pessoa jurídica
      { value: 'ato_constitutivo', label: 'Documento de constituição da PJ e alterações (contrato social, estatuto + ata/termo de posse, requerimento de empresário, convenção de condomínio etc.)' },
      { value: 'identidade_representante', label: 'Identidade do representante (quem solicita o serviço)' }
    ]
  }
];
