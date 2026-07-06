export type CnoStatus = 'nao_cadastrado' | 'cadastrado' | 'pendente_revisao' | 'encerrado';
export type RegularizationMethod = 'afericao_indireta' | 'contabilidade_regular';
export type SeroStatus = 'nao_iniciado' | 'em_preparacao' | 'aferido' | 'dctfweb_enviada' | 'darf_emitido' | 'pago' | 'certidao_emitida';

export interface ConstructionSocialSecurityRecord {
  id: string;
  company_id: string;
  project_id?: string;
  obra_id?: string;
  cno_number?: string;
  cno_status: CnoStatus;
  cno_registration_date?: string;
  responsible_type?: string;
  execution_type?: string;
  construction_type?: string;
  destination_type?: string;
  regularization_method?: RegularizationMethod;
  total_area?: number;
  assessed_area?: number;
  start_date?: string;
  end_date?: string;
  permit_number?: string;
  occupancy_permit_number?: string;
  accountant_name?: string;
  accountant_crc?: string;
  accountant_cpf?: string;
  sero_status: SeroStatus;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ConstructionSocialSecurityDocument {
  id: string;
  record_id: string;
  document_type: string;
  file_id?: string;
  issue_date?: string;
  expiration_date?: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ConstructionSocialSecurityCredit {
  id: string;
  record_id: string;
  credit_type: string;
  source_module?: string;
  source_id?: string;
  competence?: string;
  amount: number;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ConstructionSocialSecuritySimulation {
  id: string;
  record_id: string;
  scenario: string;
  gross_estimated_amount: number;
  credit_estimated_amount: number;
  net_estimated_amount: number;
  confidence_level?: string;
  calculation_version?: string;
  simulation_parameters_json?: any;
  created_by?: string;
  created_at: string;
}

export interface ConstructionSocialSecurityDCTFWeb {
  id: string;
  record_id: string;
  declaration_number?: string;
  transmission_date?: string;
  principal_amount: number;
  fine_amount: number;
  interest_amount: number;
  total_amount: number;
  file_id?: string;
  status: string;
  created_at: string;
  updated_at: string;
}
