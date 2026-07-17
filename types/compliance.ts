// ÒPURA Compliance — Interfaces de Dados (Fase 1)

export interface CompliancePhysicalLocation {
  id: string;
  org_id: string;
  company_id: string | null;
  name: string;
  type: 'sala' | 'posicao_logistica' | 'locker' | 'escritorio' | string;
  coordinates?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    [key: string]: any;
  } | null;
  status: 'disponivel' | 'ocupado' | 'manutencao' | string;
  created_at: string;
  updated_at: string;
}

export type CompliancePhysicalLocationInsert = Omit<CompliancePhysicalLocation, 'id' | 'created_at' | 'updated_at'>;
export type CompliancePhysicalLocationUpdate = Partial<CompliancePhysicalLocationInsert>;

export interface ComplianceRule {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  category: 'tts_mg' | 'licenca' | 'anvisa' | 'avcb' | string;
  metric_threshold?: number | null;
  recurrence_days: number;
  created_at: string;
}

export type ComplianceRuleInsert = Omit<ComplianceRule, 'id' | 'created_at'>;
export type ComplianceRuleUpdate = Partial<ComplianceRuleInsert>;

export type ComplianceChecklistStatus = 'pendente' | 'em_analise' | 'conforme' | 'inconforme';

export interface ComplianceChecklist {
  id: string;
  org_id: string;
  company_id: string;
  rule_id: string | null;
  title: string;
  status: ComplianceChecklistStatus;
  due_date: string;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export type ComplianceChecklistInsert = Omit<ComplianceChecklist, 'id' | 'created_at'>;
export type ComplianceChecklistUpdate = Partial<ComplianceChecklistInsert>;

export interface ComplianceEvidence {
  id: string;
  org_id: string;
  company_id: string;
  checklist_id: string | null;
  operation_type: 'recebimento' | 'expedicao' | 'inventario' | string;
  document_ref?: string | null;
  operator_email: string;
  evidence_url: string;
  file_hash?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  captured_at: string;
  created_at: string;
}

export type ComplianceEvidenceInsert = Omit<ComplianceEvidence, 'id' | 'created_at'>;
export type ComplianceEvidenceUpdate = Partial<ComplianceEvidenceInsert>;

// ============================================================
// REGIME TTS-MG — Crédito Presumido de ICMS
// ============================================================

// Parâmetros LEGAIS do regime, configuráveis por org/filial (nunca fixos no
// código). Alíquotas em fração decimal: 0.18 = 18%, 0.013 = 1,3%.
export interface TtsRegimeSettings {
  id: string;
  org_id: string;
  company_id: string | null;
  home_uf: string;
  active: boolean;
  debit_rate_internal: number;        // alíquota de débito saída interna (regime normal)
  debit_rate_interstate: number;      // alíquota de débito saída interestadual
  effective_rate_internal: number;    // carga efetiva sob TTS — interna
  effective_rate_interstate: number;  // carga efetiva sob TTS — interestadual
  credit_rate_default: number;        // crédito real de referência (ponto de equilíbrio)
  min_interstate_share: number;       // meta mínima de saídas interestaduais
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type TtsRegimeSettingsInsert = Omit<TtsRegimeSettings, 'id' | 'created_at' | 'updated_at'>;
export type TtsRegimeSettingsUpdate = Partial<TtsRegimeSettingsInsert>;

export type TtsDirection = 'saida' | 'entrada';
export type TtsScope = 'interna' | 'interestadual' | 'exterior';
export type TtsSource = 'manual' | 'nfe' | 'erp';

// Lançamento no ledger de apuração (uma linha de saída ou entrada).
export interface TtsFiscalMovement {
  id: string;
  org_id: string;
  company_id: string;
  reference_month: string;   // 'YYYY-MM-01'
  direction: TtsDirection;
  scope: TtsScope;
  cfop?: string | null;
  base_amount: number;
  icms_debit: number;
  icms_credit: number;
  source: TtsSource;
  nfe_invoice_id?: string | null;
  document_ref?: string | null;
  description?: string | null;
  created_at: string;
  created_by?: string | null;
}

export type TtsFiscalMovementInsert = Omit<TtsFiscalMovement, 'id' | 'created_at'>;
export type TtsFiscalMovementUpdate = Partial<TtsFiscalMovementInsert>;

// Linha da view de apuração (somas brutas por competência).
export interface TtsApuracaoRow {
  org_id: string;
  company_id: string;
  reference_month: string;
  total_saidas: number;
  saidas_interestaduais: number;
  saidas_internas: number;
  total_entradas: number;
  icms_debito_total: number;
  icms_credito_real: number;
  pct_interestadual: number;
  movimentos: number;
}

// Resultado do motor de cálculo TTS (comparativo com/sem regime).
export interface TtsCalculationResult {
  // Regime normal (débito × crédito real)
  icms_devido_normal: number;
  // Regime TTS (crédito presumido → carga efetiva sobre as saídas)
  icms_devido_tts: number;
  credito_presumido: number;
  // Economia gerada pelo regime (positivo = TTS compensa)
  economia: number;
  economia_pct: number;      // economia / icms_devido_normal
  // Elegibilidade pela meta interestadual
  pct_interestadual: number;
  min_interstate_share: number;
  elegivel: boolean;
  // Ponto de equilíbrio: até que razão compras/vendas o TTS ainda compensa
  break_even_ratio: number | null;
  compras_vendas_ratio: number | null;
}

// Entrada do motor de cálculo — bases já segregadas por escopo.
export interface TtsCalculationInput {
  saidas_internas: number;
  saidas_interestaduais: number;
  entradas_base: number;      // base de ICMS das entradas (para crédito real)
  entradas_credito_real?: number; // se conhecido; senão estima via credit_rate_default
}

// Resultado do backfill de movimentos a partir das NF-e já ingeridas.
export interface TtsBackfillResult {
  invoices_scanned: number;        // NF-e da org lidas
  invoices_applied: number;        // NF-e que geraram ≥1 movimento
  movements_created: number;       // linhas inseridas em tts_fiscal_movements
  skipped_no_company: number;      // itens sem CNPJ correspondente em companies
  skipped_no_cfop: number;         // itens sem CFOP ou CFOP inválido
  skipped_exterior: number;        // itens de exterior (fora do escopo TTS-MG)
  companies_matched: string[];     // ids das filiais que receberam movimentos
  // Diagnóstico (para entender por que itens não casaram filial)
  registered_cnpjs: string[];      // CNPJs (dígitos) cadastrados em companies
  sample_unmatched_cnpjs: string[];// amostra de CNPJs das notas que não casaram
  empty_cnpj_items: number;        // itens cujo CNPJ relevante veio vazio/nulo
  direction_counts: { saida: number; entrada: number };
}
