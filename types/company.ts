export type CompanyTipo =
  | 'construtora'
  | 'incorporadora'
  | 'concreteira'
  | 'distribuidora'
  | 'holding'
  | 'spe'
  | 'prestadora_servicos'
  | 'administracao_patrimonial'
  | 'industrial'
  | 'transportadora'
  | 'rural'
  | 'comercial';

export type CompanyStatus = 'ativa' | 'inativa' | 'em_implantacao' | 'encerrada';

export type RegimeTributario = 'simples' | 'lucro_presumido' | 'lucro_real' | 'mei';

export interface CompanyEndereco {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

export interface CompanyModulos {
  obras: boolean;
  compras: boolean;
  financeiro: boolean;
  fiscal: boolean;
  rh: boolean;
  incorporacao: boolean;
  crm: boolean;
  estoque: boolean;
  broker_portal: boolean;
}

export interface Company {
  id: string;
  org_id: string;

  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  cnae_principal?: string;
  natureza_juridica?: string;
  regime_tributario?: RegimeTributario;
  data_abertura?: string;
  capital_social?: number;
  status: CompanyStatus;

  tipo: CompanyTipo;

  logo_url?: string;
  cor_sistema: string;

  endereco_fiscal?: CompanyEndereco;
  endereco_operacional?: CompanyEndereco;

  telefone?: string;
  email_financeiro?: string;
  email_fiscal?: string;
  email_comercial?: string;
  website?: string;

  modulos_habilitados: CompanyModulos;

  crt?: string;
  retencao_iss: boolean;
  retencao_inss: boolean;
  retencao_irrf: boolean;

  is_headquarters: boolean;
  holding_id?: string;

  created_at: string;
  updated_at: string;
}

export type CompanyInsert = Omit<Company, 'id' | 'created_at' | 'updated_at'>;
export type CompanyUpdate = Partial<CompanyInsert>;

export const COMPANY_TIPO_LABELS: Record<CompanyTipo, string> = {
  construtora:              'Construtora',
  incorporadora:            'Incorporadora',
  concreteira:              'Concreteira',
  distribuidora:            'Distribuidora',
  holding:                  'Holding',
  spe:                      'SPE',
  prestadora_servicos:      'Prestadora de Serviços',
  administracao_patrimonial:'Administração Patrimonial',
  industrial:               'Industrial',
  transportadora:           'Transportadora',
  rural:                    'Rural / Agro',
  comercial:                'Comercial',
};

export const REGIME_TRIBUTARIO_LABELS: Record<RegimeTributario, string> = {
  simples:          'Simples Nacional',
  lucro_presumido:  'Lucro Presumido',
  lucro_real:       'Lucro Real',
  mei:              'MEI',
};

export const DEFAULT_MODULOS: CompanyModulos = {
  obras:         true,
  compras:       true,
  financeiro:    true,
  fiscal:        false,
  rh:            false,
  incorporacao:  false,
  crm:           false,
  estoque:       false,
  broker_portal: false,
};

export const MODULOS_POR_TIPO: Record<CompanyTipo, Partial<CompanyModulos>> = {
  construtora:              { obras: true, compras: true, financeiro: true, rh: true },
  incorporadora:            { obras: true, incorporacao: true, broker_portal: true, financeiro: true, crm: true },
  concreteira:              { compras: true, estoque: true, financeiro: true },
  distribuidora:            { compras: true, estoque: true, financeiro: true },
  holding:                  { financeiro: true },
  spe:                      { obras: true, incorporacao: true, financeiro: true },
  prestadora_servicos:      { obras: true, compras: true, financeiro: true, fiscal: true },
  administracao_patrimonial:{ financeiro: true, crm: true },
  industrial:               { compras: true, estoque: true, financeiro: true, rh: true },
  transportadora:           { compras: true, financeiro: true, rh: true },
  rural:                    { compras: true, estoque: true, financeiro: true },
  comercial:                { compras: true, estoque: true, financeiro: true, fiscal: true, crm: true },
};
