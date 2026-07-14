// ─── Remuneração Societária (Pró-labore + Lucros/Dividendos) ──────────────
// Ver PLANO_MODULO_REMUNERACAO_SOCIETARIA.md
// Estende company_partners (types/company.ts) — não duplica cadastro de sócio.

export type BeneficiarioTipo = 'pf_residente' | 'pj_residente' | 'exterior';
export type RegimeRemuneracao = 'prolabore' | 'dividendos' | 'ambos' | 'nenhum';

export interface PartnerCompensationSettings {
  id: string;
  organization_id: string;
  company_id: string;
  partner_id: string;
  has_prolabore: boolean;
  prolabore_amount?: number;
  prolabore_start_date?: string;
  prolabore_end_date?: string;
  cost_center_id?: string;
  payment_day?: number;
  bank_account_id?: string;
  created_at: string;
  updated_at: string;
}

export type PartnerCompensationSettingsUpsert = Omit<PartnerCompensationSettings, 'id' | 'created_at' | 'updated_at'>;

// Ajuste manual que soma ao total real de pró-labore (base = extrato
// conciliado, ver ProlaborePayroll.bank_reconciled_total) quando o valor
// pago pelo banco não cobre tudo na competência.
export interface ProlaboreManualEntry {
  id: string;
  organization_id: string;
  company_id: string;
  competence_month: string;
  amount: number;
  description?: string;
  created_by_email?: string;
  created_at: string;
}

export type ProlaborePayrollStatus =
  | 'rascunho' | 'calculado' | 'em_aprovacao' | 'aprovado'
  | 'enviado_financeiro' | 'pago' | 'contabilizado' | 'encerrado'
  | 'cancelado' | 'bloqueado';

export interface ProlaborePayroll {
  id: string;
  organization_id: string;
  company_id: string;
  competence_month: string;
  status: ProlaborePayrollStatus;
  gross_total: number;
  inss_total: number;
  irrf_total: number;
  net_total: number;
  patronal_total: number;
  terceiros_total: number;
  approved_by_email?: string;
  approved_at?: string;
  created_by_email?: string;
  // Total de pró-labore conferido/aprovado na Conciliação Bancária (Financeiro)
  // e registrado aqui via botão "Lançar total em RH" — canal de volta
  // Financeiro→RH, não duplica internal_transactions/invoices.
  bank_reconciled_total?: number;
  bank_reconciled_at?: string;
  bank_reconciled_by_email?: string;
  created_at: string;
  updated_at: string;
}

export type ProlaborePayrollItemStatus = 'calculado' | 'aprovado' | 'pago' | 'contabilizado' | 'cancelado';

export interface ProlaborePayrollItem {
  id: string;
  payroll_id: string;
  partner_id: string;
  gross_amount: number;
  inss_amount: number;
  irrf_amount: number;
  net_amount: number;
  patronal_amount: number;
  terceiros_amount: number;
  cost_center_id?: string;
  financial_entry_id?: string;
  receipt_document_id?: string;
  status: ProlaborePayrollItemStatus;
  created_at: string;
  updated_at: string;
  // join opcional
  partner_nome?: string;
  partner_documento?: string;
  partner_tipo_pessoa?: 'pf' | 'pj';
}

export const PROLABORE_STATUS_LABELS: Record<ProlaborePayrollStatus, string> = {
  rascunho: 'Rascunho',
  calculado: 'Calculado',
  em_aprovacao: 'Em Aprovação',
  aprovado: 'Aprovado',
  enviado_financeiro: 'Enviado ao Financeiro',
  pago: 'Pago',
  contabilizado: 'Contabilizado',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
  bloqueado: 'Bloqueado',
};

export const BENEFICIARIO_TIPO_LABELS: Record<BeneficiarioTipo, string> = {
  pf_residente: 'PF Residente',
  pj_residente: 'PJ Residente',
  exterior: 'Exterior',
};

export const REGIME_REMUNERACAO_LABELS: Record<RegimeRemuneracao, string> = {
  prolabore: 'Pró-labore',
  dividendos: 'Dividendos',
  ambos: 'Ambos',
  nenhum: 'Nenhum',
};

// ─── Lucros e Dividendos ────────────────────────────────────────

export type ProfitDistributionRule = 'proporcional' | 'manual';

export type ProfitDistributionBatchStatus =
  | 'rascunho' | 'em_validacao_contabil' | 'aguardando_aprovacao'
  | 'aprovado' | 'agendado_financeiro' | 'pago_parcial' | 'pago_integral'
  | 'contabilizado' | 'encerrado'
  | 'bloqueado_sem_lucro' | 'bloqueado_sem_ata' | 'cancelado';

export interface ProfitDistributionBatch {
  id: string;
  organization_id: string;
  company_id: string;
  profit_period_start: string;
  profit_period_end: string;
  accounting_profit_amount?: number;
  available_profit_amount: number;
  proposed_amount: number;
  approved_amount?: number;
  approval_date?: string;
  payment_date?: string;
  distribution_rule: ProfitDistributionRule;
  status: ProfitDistributionBatchStatus;
  document_id?: string;
  created_by_email?: string;
  approved_by_email?: string;
  created_at: string;
  updated_at: string;
}

export type ProfitDistributionItemStatus = 'proposto' | 'aprovado' | 'pago' | 'contabilizado' | 'cancelado';

export interface ProfitDistributionItem {
  id: string;
  batch_id: string;
  partner_id: string;
  beneficiary_type: BeneficiarioTipo;
  ownership_percentage: number;
  gross_amount: number;
  withholding_tax_amount: number;
  net_amount: number;
  financial_entry_id?: string;
  receipt_document_id?: string;
  status: ProfitDistributionItemStatus;
  created_at: string;
  updated_at: string;
  // join opcional
  partner_nome?: string;
  partner_documento?: string;
  partner_tipo_pessoa?: 'pf' | 'pj';
}

export const PROFIT_BATCH_STATUS_LABELS: Record<ProfitDistributionBatchStatus, string> = {
  rascunho: 'Rascunho',
  em_validacao_contabil: 'Em Validação Contábil',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovado: 'Aprovado',
  agendado_financeiro: 'Agendado no Financeiro',
  pago_parcial: 'Pago Parcialmente',
  pago_integral: 'Pago Integralmente',
  contabilizado: 'Contabilizado',
  encerrado: 'Encerrado',
  bloqueado_sem_lucro: 'Bloqueado — Sem Lucro',
  bloqueado_sem_ata: 'Bloqueado — Sem Ata',
  cancelado: 'Cancelado',
};

export const DIVIDEND_MONTHLY_THRESHOLD_PF = 50000; // Lei 15.270/2025 — referência de UI, alíquota real vem de dividend_withholding_rules
