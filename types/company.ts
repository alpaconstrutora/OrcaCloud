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

  responsavel_legal_nome?: string;
  responsavel_financeiro_nome?: string;
  responsavel_operacional_nome?: string;
  responsavel_tecnico_crea?: string;

  // Sprint C — Config de Obras
  obra_empresa_executora_id?: string;
  obra_empresa_incorporadora_id?: string;
  obra_bdi_padrao?: number;
  obra_encargos_sociais_pct?: number;
  obra_tabela_sinapi_uf?: string;

  // Sprint B — Financeiro
  regime_contabil?: 'caixa' | 'competencia';
  limite_aprovacao_compras?: number;
  limite_aprovacao_pagamentos?: number;
  empresa_consolidadora_id?: string;
  plano_contas_padrao_id?: string;
  centro_custo_padrao_id?: string;

  // Sprint B — Tributário avançado
  aliquota_iss?: number;
  codigo_servico_municipal?: string;
  cnae_fiscal?: string;
  retencao_pis: boolean;
  retencao_cofins: boolean;
  retencao_csll: boolean;
  possui_substituicao_tributaria: boolean;
  possui_difal: boolean;
  possui_inss_obra: boolean;
  cprb: boolean;
  certificado_digital_url?: string;
  certificado_validade?: string;
  prefeitura_integrada?: string;
  sefaz_integrada: boolean;

  created_at: string;
  updated_at: string;
}

export type CompanyInsert = Omit<Company, 'id' | 'created_at' | 'updated_at'>;
export type CompanyUpdate = Partial<CompanyInsert>;

// ─── Quadro Societário ────────────────────────────────────────

export interface CompanyPartner {
  id: string;
  company_id: string;
  tipo_pessoa: 'pf' | 'pj';
  nome: string;
  documento?: string;
  participacao_pct: number;
  is_administrador: boolean;
  is_assinante_legal: boolean;
  pj_company_id?: string;
  data_entrada?: string;
  data_saida?: string;
  created_at: string;
}

export type CompanyPartnerInsert = Omit<CompanyPartner, 'id' | 'created_at'>;
export type CompanyPartnerUpdate = Partial<CompanyPartnerInsert>;

// ─── Contas Bancárias ─────────────────────────────────────────

export type TipoConta = 'corrente' | 'poupanca' | 'escrow' | 'obra' | 'incorporacao' | 'garantida';
export type TipoPix   = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface CompanyBankAccount {
  id: string;
  company_id: string;
  banco_codigo: string;
  banco_nome?: string;
  agencia?: string;
  conta?: string;
  tipo_conta?: TipoConta;
  pix_chave?: string;
  pix_tipo?: TipoPix;
  favorecido?: string;
  limite_credito?: number;
  is_principal: boolean;
  ativa: boolean;
  obra_id?: string;
  created_at: string;
}

export type CompanyBankAccountInsert = Omit<CompanyBankAccount, 'id' | 'created_at'>;
export type CompanyBankAccountUpdate = Partial<CompanyBankAccountInsert>;

export const TIPO_CONTA_LABELS: Record<TipoConta, string> = {
  corrente:     'Conta Corrente',
  poupanca:     'Poupança',
  escrow:       'Escrow',
  obra:         'Conta de Obra',
  incorporacao: 'Conta de Incorporação',
  garantida:    'Conta Garantida',
};

export const TIPO_PIX_LABELS: Record<TipoPix, string> = {
  cpf:       'CPF',
  cnpj:      'CNPJ',
  email:     'E-mail',
  telefone:  'Telefone',
  aleatoria: 'Chave Aleatória',
};

export const REGIME_CONTABIL_LABELS: Record<'caixa' | 'competencia', string> = {
  caixa:       'Regime de Caixa',
  competencia: 'Regime de Competência',
};

// ─── Incorporação / SPE ──────────────────────────────────────

export type TipoSPE = 'spe' | 'patrimonio_afetacao' | 'scp';

export interface CompanyIncorporacao {
  company_id: string;
  tipo_spe?: TipoSPE;
  registro_incorporacao?: string;
  cartorio?: string;
  matriculas?: string[];
  alvara_construcao?: string;
  alvara_validade?: string;
  habite_se?: string;
  habite_se_data?: string;
  rep_numero?: string;
  conta_segregada_id?: string;
  empreendimento_id?: string;
  created_at: string;
  updated_at: string;
}

export type CompanyIncorporacaoUpsert = Omit<CompanyIncorporacao, 'created_at' | 'updated_at'>;

export const TIPO_SPE_LABELS: Record<TipoSPE, string> = {
  spe:                'SPE – Sociedade de Propósito Específico',
  patrimonio_afetacao: 'Patrimônio de Afetação',
  scp:                'SCP – Sociedade em Conta de Participação',
};

// ─── Filiais ──────────────────────────────────────────────────

export interface CompanyBranch {
  id: string;
  company_id: string;
  codigo: string;
  nome: string;
  cnpj_proprio?: string;
  endereco?: {
    cep?: string; logradouro?: string; numero?: string;
    complemento?: string; bairro?: string; cidade?: string; uf?: string;
  };
  estoque_proprio: boolean;
  obra_id?: string;
  ativa: boolean;
  created_at: string;
}

export type CompanyBranchInsert = Omit<CompanyBranch, 'id' | 'created_at'>;
export type CompanyBranchUpdate = Partial<CompanyBranchInsert>;

export const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

export const BANCOS_BRASIL = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '041', nome: 'Banrisul' },
  { codigo: '070', nome: 'BRB' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '085', nome: 'AILOS' },
  { codigo: '104', nome: 'Caixa Econômica Federal' },
  { codigo: '212', nome: 'Banco Original' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '260', nome: 'Nubank' },
  { codigo: '290', nome: 'PagBank' },
  { codigo: '336', nome: 'Banco C6' },
  { codigo: '341', nome: 'Itaú' },
  { codigo: '389', nome: 'Banco Mercantil' },
  { codigo: '422', nome: 'Safra' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
];

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
