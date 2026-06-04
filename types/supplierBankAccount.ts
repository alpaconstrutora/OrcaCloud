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
