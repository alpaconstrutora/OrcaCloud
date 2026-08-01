export interface PaymentInstallment {
    id: string;
    dueDate: string;
    value: number;
    status: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
    description: string;
    paymentDate?: string;
    receiptUrl?: string;
    dealId?: string;
    dealType?: 'SALE' | 'RENTAL' | 'SERVICE';
    clientId?: string;
    clientName?: string;
    propertyId?: string;
    propertyName?: string;
    /** Todas as unidades do contrato, quando ele reúne mais de uma (apto + vaga
     *  + box no mesmo aluguel). `propertyId`/`propertyName` continuam apontando
     *  para a unidade principal, por compatibilidade. */
    propertyIds?: string[];
    /** Rótulo concatenado das unidades ("Apto 101 + Vaga 12"). */
    propertyNames?: string;
    linkedProjectId?: string;
    /**
     * Dimensões contábeis herdadas do CABEÇALHO da negociação (aba Forma de
     * Pagamento) — não são editáveis por parcela: na aba Parcelas aparecem
     * apenas como colunas de leitura. Vêm do `metadata` montado em
     * `commercialFinanceService.syncDealToFinance` e são materializadas em
     * `internal_transactions` por `financialSyncService`.
     *
     * São dimensões DIFERENTES entre si (ver migration 20270822000013):
     *   • costCenterId     → cost_centers_v2  (Centro de Custo)
     *   • planoDeContasId  → plano_de_contas  (Plano de Contas)
     * Nenhuma das duas se confunde com `category` (financial_categories).
     */
    costCenterId?: string | null;
    planoDeContasId?: string | null;
    commissionRate?: number;
    brokerName?: string;
    attachmentUrl?: string;
    /**
     * Desconto por parcela (Gerenciar Negociação → Forma de Pagamento). `value`
     * continua sendo o valor FINAL (com desconto já aplicado) — é o que
     * materializa em Contas a Receber. `originalValue` guarda o valor bruto
     * (pré-desconto) para permitir editar a base ou o desconto independentemente
     * e recalcular; ausente = nenhum desconto foi aplicado ainda.
     */
    originalValue?: number;
    discountType?: 'VALUE' | 'PERCENT';
    discountAmount?: number;
    /**
     * Forma de pagamento e observação livre por parcela (Gerenciar Negociação →
     * Forma de Pagamento → Plano de Pagamento). `notes` é distinto de
     * `description` (que é o rótulo autogerado "Parcela i/N") — é anotação
     * livre do usuário, ex: "cheque pré-datado do sócio".
     */
    paymentType?: 'PIX' | 'TED' | 'DOC' | 'DINHEIRO' | 'CHEQUE' | 'PERMUTA';
    notes?: string;
    /**
     * Classificação da parcela dentro do cronograma (Plano de Pagamento) — o QUE
     * ela representa (Sinal, mensal, trimestral...), distinto de `paymentType`
     * (COMO ela é paga: PIX/TED/...). `handleGenerateInstallments` marca as
     * parcelas geradas como 'MENSAL' por padrão (o gerador espaça 1 mês entre
     * elas); o usuário pode reclassificar linha a linha.
     */
    installmentType?: 'SINAL' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'AVULSA' | 'CHAVES' | (string & {});
}

export interface FinancialTransaction {
    id: string;
    date: string;
    type: 'EXPENSE' | 'INCOME';
    category: string;
    description: string;
    value: number;
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    supplier?: string;       // nome (label, legado)
    supplierId?: string;     // FK suppliers — alimenta supplier_id no razão (ÒPURA)
    orderId?: string;
    measurementId?: string;
    paymentDate?: string;
    bankAccount?: string;
    costCenter?: string;
    chartOfAccounts?: string;
    /**
     * Campo de anotações livres. Convenção de tags obrigatórias:
     * - `[contract:UUID]` — identifica transações geradas automaticamente por um contrato recorrente.
     *   Usado para localização e exclusão em cascata ao deletar o contrato.
     *   Exemplo: `[contract:e5631aa5-2618-4ffa-...] Gerado automaticamente do contrato 001`
     */
    notes?: string;
    updated_at?: string;
    status_updated_at?: string;
    attachmentUrl?: string;
}

export interface BillingRule {
    id: string;
    days: number;
    time: string;
    active: boolean;
    messageTemplate?: string;
    clientId?: string;
    dealId?: string;
    triggerMode: 'MANUAL' | 'AUTOMATIC';
    minValue?: number;
}

export interface ContractTemplate {
    id: string;
    name: string;
    externalId: string;
    description?: string;
}

export interface FinancialInfo {
    totalValue: number;
    paymentMethod: string;
    webhookUrl?: string;
    billingWebhookUrl?: string;
    contractWebhookUrl?: string;
    billingRules?: BillingRule[];
    billingTriggerHour?: number;
    contractTemplates?: ContractTemplate[];
    installments: PaymentInstallment[];
    transactions: FinancialTransaction[];
}

export type InvoiceStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface Invoice {
    id: string;
    supplierId: string;
    orderId?: string;
    filePath: string;
    fileName: string;
    amount?: number;
    dueDate?: string;
    costCenterId?: string;
    chartOfAccountsId?: string;
    status: InvoiceStatus;
    notes?: string;
    createdAt: string;
}

export interface PaymentAccount {
    id: string;
    code?: string;
    organization_id: string;
    empresa_id?: string;
    name: string;
    description?: string;
    bank?: string;
    branch?: string;
    account_number?: string;
    opening_balance?: number;
    opening_balance_date?: string;
    created_at?: string;
}

// Usada tanto pela dimensão Centro de Custo (leitura via listCostCenters, hoje
// sobre cost_centers_v2) quanto pelo cadastro Plano de Contas (tabela
// `plano_de_contas`, métodos *PlanoConta* abaixo). `accounting_nature` só se
// aplica ao Plano de Contas (Credora/Devedora).
export interface CostCenter {
    id: string;
    organization_id: string;
    empresa_id?: string;
    name: string;
    code?: string;
    accounting_nature?: 'CREDORA' | 'DEVEDORA';
    created_at?: string;
}

// Módulo "Centro de Custo" (Minha Organização) — tabela nova `cost_centers_v2`,
// separada da CostCenter/`cost_centers` acima (ver migration
// 20270822000001_create_cost_centers_v2.sql). 2 níveis reais via parent_id:
// parent_id null = grupo; parent_id preenchido = subgrupo ("centro de custo").
export interface CostCenterV2 {
    id: string;
    organization_id: string;
    empresa_id?: string | null;
    parent_id?: string | null;
    code: string;
    name: string;
    description?: string | null;
    created_at?: string;
    updated_at?: string;
}

// Aposentado: mapeado agora para financial_categories (global, hierárquico, com dre_group).
// Os campos organization_id, empresa_id, code e type são mantidos opcionais para
// compatibilidade com dados históricos e callers existentes.
export interface ChartOfAccount {
    id: string;
    organization_id?: string;
    empresa_id?: string;
    name: string;
    code?: string;
    type?: string;
    parent_id?: string;
    dre_group?: string;
    nature?: string;
    // Natureza contábil (Credora/Devedora) — lado da partida dobrada em que a
    // conta normalmente aumenta. Independente do "nature" acima (grupo de DRE).
    accounting_nature?: 'CREDORA' | 'DEVEDORA';
    sort_order?: number;
    created_at?: string;
}

export type BankTransactionStatus = 'IMPORTED' | 'NORMALIZED' | 'MATCHED' | 'CONFIRMED' | 'LOCKED' | 'RULE_APPLIED';
export type InternalTransactionStatus = 'PENDING' | 'CONCILIATED' | 'CANCELLED';
export type MatchType = 'RULE' | 'HEURISTIC' | 'AI' | 'MANUAL';

export interface InternalTransaction {
    id: string;
    organization_id: string;
    source_system: 'COMMERCIAL' | 'PROJECT' | 'MANUAL' | 'BOLETO'
        | 'CONTRACT_RECURRING' | 'CONTRACT_PARCELADO' | 'CONTRACT_AVISTA' | 'CONTRACT_MEASUREMENT'
        | 'PAYROLL' | 'PURCHASE' | (string & {});
    reference_id?: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description?: string;
    category?: string;
    entity_name?: string;
    party_type?: 'SUPPLIER' | 'CLIENT' | null;
    party_name?: string | null;
    party_id?: string | null;
    supplier_id?: string | null;
    due_date?: string | null;
    payment_date?: string | null;
    approval_status?: string | null;
    status: InternalTransactionStatus;
    project_id?: string;
    cost_center_id?: string;
    created_at?: string;
    updated_at?: string;
}

export interface BankAccount {
    id: string;
    organization_id: string;
    payment_account_id?: string;
    bank_name: string;
    account_number: string;
    branch?: string;
    currency: string;
    status: 'ACTIVE' | 'INACTIVE';
    created_at?: string;
}

export interface BankTransaction {
    id: string;
    organization_id: string;
    bank_account_id: string;
    external_id?: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description_raw: string;
    description_normalized?: string;
    counterparty_name?: string;
    transaction_type?: string;
    fingerprint?: string;
    category?: string;
    status: BankTransactionStatus;
    project_id?: string;
    cost_center_id?: string;
    created_at?: string;
}

export interface ReconciliationMatch {
    id: string;
    bank_transaction_id: string;
    internal_transaction_id: string;
    match_type: MatchType;
    confidence_score?: number;
    created_by?: string;
    created_at?: string;
}

export interface MatchSuggestion {
    id: string;
    bank_transaction_id: string;
    candidate_internal_transaction_id: string;
    confidence: number;
    reason?: string;
    model_version?: string;
    created_at?: string;
}

export interface ReconciliationRule {
    id: string;
    organization_id: string;
    name: string;
    priority: number;
    conditions: Record<string, unknown>;
    actions: Record<string, unknown>;
    is_active: boolean;
    created_at?: string;
}

export interface ReconciliationAuditLog {
    id: string;
    organization_id: string;
    user_id?: string;
    event_type: 'IMPORT' | 'MATCH' | 'REJECT' | 'MANUAL_CREATE';
    target_id?: string;
    payload?: Record<string, unknown>;
    integrity_hash?: string;
    created_at?: string;
}

// ────────────────────────────────────────────────────────────
// Dashboard de Conciliação — Saldo Bancário vs. Contábil
// ────────────────────────────────────────────────────────────

export interface ReconciliationAccountBalance {
    account_id: string;
    account_name: string;
    bank_name: string | null;
    opening_balance: number;
    bank_balance: number;        // saldo inicial + extrato (CREDIT − DEBIT)
    reconciled_balance: number;  // saldo inicial + extrato já conciliado
    difference: number;          // bank_balance − reconciled_balance
    pending_value: number;       // soma bruta dos lançamentos pendentes
    pending_count: number;
    unclassified_count: number;
}

export interface ReconciliationDashboardTotals {
    opening_balance: number;
    bank_balance: number;
    reconciled_balance: number;
    difference: number;
    pending_value: number;
    pending_count: number;
    unclassified_count: number;
}

export interface ReconciliationDashboard {
    as_of: string;
    accounts: ReconciliationAccountBalance[];
    totals: ReconciliationDashboardTotals;
    system_balance: number;      // saldo inicial + lançamentos internos conciliados
    fees: { value: number; count: number };
}

export interface ConsolidatedEmpresa {
    empresa_id: string | null;
    empresa_name: string;
    account_count: number;
    bank_balance: number;
    reconciled_balance: number;
    difference: number;
    pending_value: number;
    pending_count: number;
}

export interface ConsolidatedProject {
    project_id: string;
    project_name: string;
    credit: number;
    debit: number;
    net: number;         // caixa realizado da obra (CREDIT − DEBIT conciliado)
    n: number;
}

export interface ReconciliationConsolidated {
    as_of: string;
    totals: {
        bank_balance: number;
        reconciled_balance: number;
        pending_value: number;
        account_count: number;
        empresa_count: number;
    };
    by_empresa: ConsolidatedEmpresa[];
    by_project: ConsolidatedProject[];
}

// ────────────────────────────────────────────────────────────
// Detecção de Anomalias (Tier A+)
// ────────────────────────────────────────────────────────────

export interface DuplicateAnomaly {
    source: 'BANK' | 'INTERNAL';
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
    party: string;
    id_a: string;
    id_b: string;
    date_a: string;
    date_b: string;
    days_apart: number;
}

export interface ValueOutlierAnomaly {
    id: string;
    dt: string;
    amount: number;
    party: string;
    category: string | null;
    avg_a: number;       // média histórica da contraparte
    n: number;           // nº de amostras
    z: number;           // z-score
}

export interface ReconciliationAnomalies {
    as_of: string;
    counts: { duplicates: number; value_outliers: number };
    duplicates: DuplicateAnomaly[];
    value_outliers: ValueOutlierAnomaly[];
}

// ────────────────────────────────────────────────────────────
// Fechamento Financeiro Mensal
// ────────────────────────────────────────────────────────────

export interface FinancialCloseChecklist {
    year: number;
    month: number;
    pending_bank_count: number;
    unclassified_count: number;
    fees_uncategorized_count: number;
    internal_pending_count: number;
    total_entradas: number;
    total_saidas: number;
    is_closed: boolean;
}

export interface FinancialPeriodLock {
    id: string;
    organization_id: string;
    period_year: number;
    period_month: number;
    is_closed: boolean;
    checklist?: FinancialCloseChecklist | null;
    notes?: string | null;
    closed_at?: string | null;
    closed_by?: string | null;
    reopened_at?: string | null;
    reopened_by?: string | null;
    created_at?: string;
    updated_at?: string;
}

// ────────────────────────────────────────────────────────────
// Gestão de Divergências de Conciliação
// ────────────────────────────────────────────────────────────

export interface BankWithoutInternal {
    id: string;
    bank_account_id: string;
    account_name: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description: string;
    category: string | null;
}

export interface InternalWithoutBank {
    id: string;
    transaction_date: string;
    due_date: string | null;
    ref_date: string;
    days_overdue: number;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description: string | null;
    category: string | null;
    party_name: string | null;
    business_status: string | null;
    project_id: string | null;
}

export interface ValueMismatch {
    bank_id: string;
    internal_id: string;
    bank_amount: number;
    internal_amount: number;
    difference: number;           // bank − internal
    bank_date: string;
    internal_date: string;
    bank_description: string;
    internal_description: string | null;
    direction: 'CREDIT' | 'DEBIT';
    account_name: string;
}

export interface ReconciliationDivergences {
    as_of: string;
    counts: {
        bank_without_internal: number;
        internal_without_bank: number;
        value_mismatch: number;
    };
    bank_without_internal: BankWithoutInternal[];
    internal_without_bank: InternalWithoutBank[];
    value_mismatch: ValueMismatch[];
}

// ────────────────────────────────────────────────────────────
// DRE — Demonstrativo de Resultado do Exercício
// ────────────────────────────────────────────────────────────

export type DREGroup =
    | 'RECEITA_BRUTA'
    | 'DEDUCOES'
    | 'CUSTO_OBRA'
    | 'CUSTO_SERVICO'
    | 'DESPESA_ADM'
    | 'DESPESA_COMERCIAL'
    | 'FINANCEIRO'
    | 'IMPOSTOS'
    | 'NAO_OPERACIONAL'
    | 'SEM_CLASSIFICACAO';

export type FinancialNature = 'REVENUE' | 'COST' | 'EXPENSE';

export interface FinancialCategory {
    id: string;
    organization_id?: string;
    name: string;
    parent_id?: string;
    dre_group?: DREGroup;
    nature?: FinancialNature;
    sort_order?: number;
    created_at?: string;
}

export interface DRELine {
    dre_group: DREGroup;
    nature: FinancialNature;
    sort_order: number;
    category_name: string;
    total_credit: number;
    total_debit: number;
    net: number;             // positivo = favorável
    pending_credit: number;
    pending_debit: number;
}

export interface DRESummaryLine {
    linha: string;
    valor_realizado: number;
    valor_previsto: number;
}

export interface DRESummary {
    period_from: string;
    period_to: string;
    lines: DRESummaryLine[];
    detail: DRELine[];
    receita_bruta: number;
    receita_liquida: number;
    lucro_bruto: number;
    ebitda: number;
    resultado_liquido: number;
    margem_bruta_pct: number | null;
    margem_ebitda_pct: number | null;
    margem_liquida_pct: number | null;
}

// Comparativo de resultado por obra (fn_dre_projects_summary)
export interface DREProjectSummary {
    project_id: string;
    project_name: string;
    receita: number;
    custo: number;
    margem: number;
    receita_prev: number;
    custo_prev: number;
    margem_pct: number | null;   // calculado no front (evita div/0)
}

// ────────────────────────────────────────────────────────────
// Balancete Gerencial
// ────────────────────────────────────────────────────────────

export interface BalanceteLine {
    category_id:   string | null;
    category_name: string;
    dre_group:     DREGroup;
    nature:        FinancialNature;
    sort_order:    number;
    creditos:      number;
    debitos:       number;
    saldo_liquido: number;
    n_transacoes:  number;
}

// ────────────────────────────────────────────────────────────
// Regime contábil
// ────────────────────────────────────────────────────────────

export type RegimeContabil = 'CAIXA' | 'COMPETENCIA';

// ────────────────────────────────────────────────────────────
// DRE por SPE/Empresa
// ────────────────────────────────────────────────────────────

export interface DRESPELine {
    empresa_id:             string;
    empresa_nome:           string;
    receita_bruta:          number;
    deducoes:               number;
    receita_liquida:        number;
    custos_diretos:         number;
    lucro_bruto:            number;
    despesas_operacionais:  number;
    ebitda:                 number;
    resultado_financeiro:   number;
    impostos:               number;
    resultado_liquido:      number;
    n_transacoes:           number;
    margem_bruta_pct:       number | null;
    margem_ebitda_pct:      number | null;
    margem_liquida_pct:     number | null;
}

// ────────────────────────────────────────────────────────────
// WIP — Work In Progress
// ────────────────────────────────────────────────────────────

export interface WIPLine {
    project_id:           string;
    project_name:         string;
    project_code:         string | null;
    empresa_id:           string | null;
    empresa_nome:         string | null;
    contrato_valor:       number;
    custo_incorrido:      number;
    receita_reconhecida:  number;
    custos_pendentes:     number;
    receitas_pendentes:   number;
    saldo_contrato:       number;
    margem_bruta:         number;
    margem_pct:           number | null;
}

// ────────────────────────────────────────────────────────────
// Dashboard Executivo Financeiro
// ────────────────────────────────────────────────────────────

export interface FinancialKPIs {
    a_pagar: number;
    pago: number;
    a_receber: number;
    recebido: number;
    resultado_periodo: number;
    boletos_vencidos_count: number;
    boletos_vencidos_valor: number;
}

export interface FinancialTopSupplier {
    supplier_id: string | null;
    supplier_name: string;
    total_valor: number;
    count_boletos: number;
    pct: number;
}

// ────────────────────────────────────────────────────────────
// Contas a Receber
// ────────────────────────────────────────────────────────────

export type ReceivableBusinessStatus =
    | 'PREVISTO'
    | 'EMITIDO'
    | 'ENVIADO'
    | 'RECEBIDO'
    | 'PARCIAL'
    | 'RENEGOCIADO'
    | 'CANCELADO';

// effective_status inclui 'VENCIDO' (computado na view)
export type ReceivableEffectiveStatus = ReceivableBusinessStatus | 'VENCIDO';

export interface Receivable {
    id: string;
    organization_id: string;
    source_system: string;
    reference_id?: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    direction: 'CREDIT';
    description?: string;
    category?: string;
    status: InternalTransactionStatus;
    business_status: ReceivableBusinessStatus;
    effective_status: ReceivableEffectiveStatus;
    party_id?: string;
    party_name?: string;
    party_type?: string;
    project_id?: string;
    project_name?: string;
    cost_center_id?: string;
    plano_de_contas_id?: string;
    /** Resolvidos no client (ContasReceberManager), NÃO são coluna de
     *  vw_receivables — a view só expõe os UUIDs. */
    cost_center_name?: string;
    plano_de_contas_name?: string;
    created_at?: string;
    updated_at?: string;
}

// ────────────────────────────────────────────────────────────
// Contas a Pagar (parcelas de Suprimentos — Pedidos e Contratos)
// ────────────────────────────────────────────────────────────

export type PayableBusinessStatus =
    | 'PREVISTO'
    | 'APROVADO'
    | 'PAGO'
    | 'PARCIAL'
    | 'RENEGOCIADO'
    | 'CANCELADO';

// effective_status inclui 'VENCIDO' (computado na view vw_payables)
export type PayableEffectiveStatus = PayableBusinessStatus | 'VENCIDO';

export interface Payable {
    id: string;
    organization_id: string;
    source_system: string;
    reference_id?: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    direction: 'DEBIT';
    description?: string;
    category?: string;
    status: InternalTransactionStatus;
    business_status: PayableBusinessStatus;
    effective_status: PayableEffectiveStatus;
    party_id?: string;
    party_name?: string;
    party_type?: string;
    /** Fallback de contraparte: alguns produtores preenchem só entity_name. */
    entity_name?: string;
    project_id?: string;
    project_name?: string;
    cost_center_id?: string;
    created_at?: string;
    updated_at?: string;
}

export interface InadimplenciaFaixa {
    faixa: string;
    count: number;
    valor: number;
}

// ────────────────────────────────────────────────────────────
// Tributos a Pagar (Comercial — Vendas de Ativos / Locações)
// ────────────────────────────────────────────────────────────

export type TaxPayableBusinessStatus =
    | 'PREVISTO'
    | 'PAGO'
    | 'CANCELADO';

// effective_status inclui 'VENCIDO' (computado na view)
export type TaxPayableEffectiveStatus = TaxPayableBusinessStatus | 'VENCIDO';

export interface TaxPayable {
    id: string;
    organization_id: string;
    source_system: string;
    reference_id?: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    direction: 'DEBIT';
    description?: string;
    /** Origem do tributo: 'Venda de Ativo' | 'Locação' | 'Manual' */
    category?: string;
    status: InternalTransactionStatus;
    business_status: TaxPayableBusinessStatus;
    effective_status: TaxPayableEffectiveStatus;
    party_id?: string;
    /** Nome do tributo (PIS/COFINS/IRRF/CSLL/…) */
    party_name?: string;
    party_type?: string;
    project_id?: string;
    project_name?: string;
    cost_center_id?: string;
    /** Empreendimento (Incorporação) de origem — derivado do negócio comercial, não é coluna da view. */
    empreendimento_id?: string | null;
    empreendimento_name?: string | null;
    /** Cliente do negócio de origem — usado na coluna Descrição. Derivado, não é coluna da view. */
    client_name?: string | null;
    created_at?: string;
    updated_at?: string;
}

// ────────────────────────────────────────────────────────────
// Aprovação Financeira por Faixas
// ────────────────────────────────────────────────────────────

export type ApprovalStatus = 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';

export interface ApprovalStep {
    level: 1 | 2;
    role: string;
    action: 'APROVADO' | 'REJEITADO';
    approved_by: string;
    approved_at: string;
    notes?: string;
}

export interface FinancialApprovalConfig {
    id?: string;
    organization_id: string;
    faixa_min: number;
    faixa_max: number | null;
    required_levels: 1 | 2;
    level1_label: string;
    level2_label?: string;
    is_active: boolean;
    sort_order: number;
    created_at?: string;
}

export interface ApprovalQueueItem {
    id: string;
    organization_id: string;
    transaction_date: string;
    due_date?: string;
    amount: number;
    description?: string;
    party_name?: string;
    project_name?: string;
    approval_status: ApprovalStatus;
    approval_chain: ApprovalStep[];
    approval_required_levels: number;
    business_status?: string;
    created_at?: string;
}

// ────────────────────────────────────────────────────────────
// Fluxo de Caixa
// ────────────────────────────────────────────────────────────

export type CashFlowGranularity = 'day' | 'week' | 'month';

export interface CashFlowPoint {
    period_start: string;
    period_label: string;
    credit_real: number;
    debit_real: number;
    saldo_real: number;
    credit_prev: number;
    debit_prev: number;
    saldo_prev: number;
    saldo_acumulado: number;
}

export interface CashFlowSummary {
    period_from: string;
    period_to: string;
    granularity: CashFlowGranularity;
    points: CashFlowPoint[];
    total_entradas: number;
    total_saidas: number;
    saldo_final: number;
    saldo_previsto_final: number;
}

// ────────────────────────────────────────────────────────────
// Calendário Financeiro (Fase 4) — baseado em due_date
// ────────────────────────────────────────────────────────────

export interface CalendarEvent {
    event_date: string;           // 'YYYY-MM-DD'
    credit_previsto: number;
    debit_previsto: number;
    credit_realizado: number;
    debit_realizado: number;
    n_titulos: number;
}

export interface CalendarDayTitle {
    id: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
    description?: string;
    party_name?: string;
    project_name?: string;
    business_status?: string;
    status: string;               // InternalTransactionStatus
    due_date?: string;
    transaction_date: string;
}
