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
