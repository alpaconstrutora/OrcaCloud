// ============================================================
// Dados Bancários de Fornecedores
// ============================================================

export type AccountType = 'corrente' | 'poupanca' | 'pagamento';
export type PixKeyType  = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface SupplierBankAccount {
  id: string;
  supplier_id: string;
  organization_id?: string | null;

  // Dados bancários
  bank_code?: string;
  bank_name?: string;
  agency?: string;
  agency_digit?: string;
  account?: string;
  account_digit?: string;
  account_type: AccountType;

  // Favorecido
  beneficiary_name?: string;
  beneficiary_document?: string;

  // PIX
  pix_key?: string;
  pix_key_type?: PixKeyType;
  is_pix_primary: boolean;

  // Controle
  is_primary: boolean;
  status: 'ativo' | 'inativo';
  notes?: string;

  // Auditoria
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Lista dos principais bancos brasileiros (FEBRABAN)
export const BANCOS_BR: { code: string; name: string }[] = [
  { code: '001', name: 'Banco do Brasil' },
  { code: '033', name: 'Santander' },
  { code: '104', name: 'Caixa Econômica Federal' },
  { code: '237', name: 'Bradesco' },
  { code: '341', name: 'Itaú Unibanco' },
  { code: '077', name: 'Inter' },
  { code: '260', name: 'Nubank' },
  { code: '336', name: 'C6 Bank' },
  { code: '756', name: 'Sicoob' },
  { code: '748', name: 'Sicredi' },
  { code: '422', name: 'Safra' },
  { code: '655', name: 'Votorantim / BV' },
  { code: '070', name: 'BRB' },
  { code: '085', name: 'Ailos' },
  { code: '041', name: 'Banrisul' },
  { code: '025', name: 'Alfa' },
  { code: '021', name: 'Banestes' },
  { code: '047', name: 'Banese' },
  { code: '707', name: 'Daycoval' },
  { code: '739', name: 'Cetelem / BNP Paribas' },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente:  'Conta Corrente',
  poupanca:  'Conta Poupança',
  pagamento: 'Conta de Pagamento',
};

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf:       'CPF',
  cnpj:      'CNPJ',
  email:     'E-mail',
  telefone:  'Telefone',
  aleatoria: 'Chave Aleatória',
};
