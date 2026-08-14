export type ContractType =
    | 'Empreitada Global' | 'Empreitada Parcial' | 'Preço Fechado' | 'Preço Unitário'
    | 'Contrato por Medição' | 'Contrato Recorrente' | 'Manutenção' | 'Prestação de Serviços'
    | 'Instalação' | 'Reforma' | 'Administração' | 'Subempreitada' | 'Outros'
    | 'Compra e Venda' | (string & {});

export interface ContractTypeRecord {
    id: string;
    name: string;
    category: 'Serviços' | 'Suprimentos' | 'Geral';
    organization_id?: string;
    active?: boolean;
    created_at?: string;
}

export type BillingMode = 'MEDICAO' | 'ETAPA' | 'SINAL_PARCELAS' | 'COST_PLUS';

export interface ReleaseRequirements {
    require_invoice: boolean;
    require_evidence: boolean;
    require_approval: boolean;
}

export type MeasurementMode = 'QUANTITATIVO' | 'PERCENTUAL' | 'HIBRIDO';
export type ContractNature = 'Fornecimento' | 'Serviço' | 'Mão de Obra' | 'Locação' | 'Consumo' | 'Outros';
export type ContractStatus =
    | 'Rascunho' | 'Minuta' | 'Revisão' | 'Enviado' | 'Aprovado' | 'Assinado'
    | 'Ativo' | 'Concluído' | 'Suspenso' | 'Encerrado' | 'Cancelado';

export interface MinutaVersion {
    v: number;
    url: string;
    name?: string;          // nome editável do documento
    notes: string;
    emitted?: boolean;      // true = emitida / disponível no portal do cliente
    emitted_at?: string;    // quando foi emitida
    created_at: string;
}

export interface Contract {
    id: string;
    organization_id: string;
    project_id: string;
    budget_id?: string;
    supplier_id?: string;
    number: string;
    // Número que o cliente/contratante deu ao contrato — livre, digitado.
    // Distinto de `number` (numeração interna gerada pela nomenclatura da org).
    client_contract_number?: string;
    title: string;
    description?: string;
    contract_type: ContractType;
    nature: ContractNature;
    start_date: string;
    end_date?: string;
    is_recurring?: boolean;
    billing_cycle?: 'Mensal' | 'Bimestral' | 'Semestral' | 'Anual';
    due_day?: number;
    status: ContractStatus;
    original_value: number;
    current_value: number;
    reajuste_index?: string;
    reajuste_data_base?: string;
    reajuste_proximo?: string;
    // Locação (domain='LOCACAO') — a garantia formal (caução/fiança/seguro) fica em
    // `contract_guarantees`; aqui ficam só os campos diretos do contrato de aluguel.
    guarantor_name?: string;            // Fiador (pessoa física)
    rescission_penalty_months?: number; // Multa rescisória em nº de aluguéis
    // Renovação de locação — o filho é um contrato NOVO (não um aditivo), com
    // número, vigência e parcelas próprias. Ver services/contractRenewalService.ts.
    parent_contract_id?: string;        // Contrato anterior que este substitui (NULL = original)
    renewal_seq?: number;               // 1 = primeira renovação da cadeia
    renewed_at?: string;                // Quando a renovação foi efetivada
    renewal_notice_days?: number;       // Antecedência do alerta (NULL = padrão do cron)
    retention_rate: number;
    responsible_email?: string;
    signed_contract_url?: string;
    empresa_id?: string;
    cost_center_id?: string;
    // Plano de Contas (tabela `plano_de_contas`) — dimensão distinta de
    // cost_center_id (cost_centers_v2) e de category_id (financial_categories,
    // rotulado "Conta Financeira" no ContractModal).
    plano_de_contas_id?: string;
    category_id?: string;
    payment_method?: string;
    payment_term_type?: 'Vista' | 'Parcelado';
    payment_days?: number;
    payment_installments?: number;
    payment_schedule?: ContractInstallment[];
    client_id?: string;
    direction?: 'OUTGOING' | 'INCOMING';
    // Domínio de negócio — separa os módulos que compartilham a tabela `contracts`.
    // Nunca misturar nas listagens. Default no banco: 'SUPRIMENTOS'.
    domain?: 'SUPRIMENTOS' | 'SERVICOS' | 'LOCACAO' | 'VENDAS';
    // Negociação de origem (Vendas de Ativos) quando gerado pela ponte deal→contrato.
    deal_id?: string;
    execution_address?: string;
    execution_street?: string;
    execution_number?: string;
    execution_neighborhood?: string;
    execution_city?: string;
    execution_state?: string;
    execution_zip?: string;
    payment_account_id?: string;
    client_responsible?: string;
    internal_responsible?: string;
    sla_days?: number;
    warranty_months?: number;
    labor_value?: number;
    materials_value?: number;
    services_included?: string;
    services_excluded?: string;
    budget_snapshot?: unknown;
    signature_status?: 'PENDING' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
    signature_token?: string;
    signature_url?: string;
    signature_completed_at?: string;
    approval_status?: 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';
    approval_chain?: ContractApprovalStep[];
    approval_required_levels?: 1 | 2;
    billing_mode?: BillingMode;
    release_requirements?: ReleaseRequirements;
    minuta_versions?: MinutaVersion[];
    // Fase 5 — Retenção faseada (CP-08 / Cl.18)
    retention_cap?: number;
    retention_release_provisional?: number;
    retention_release_definitive?: number;
    retention_definitive_days?: number;
    // Fase 5 — Penalidades e limite de responsabilidade (CP-09/10, Cl.23/31)
    liability_cap?: number;
    penalty_daily_rate?: number;
    penalty_moratoria_cap?: number;
    penalty_material_rate?: number;
    // Fase 5 — Identificação da obra (CP-02)
    cno?: string;
    obra_registration?: string;
    manager_name?: string;
    inspector_name?: string;
    // Fase 6 — Ordem de Início e subcontratação (Cl.4, CP-03)
    start_order_issued_at?: string;
    start_order_authorized_by?: string;
    subcontracting_rule?: SubcontractingRule;
    // Fase 8 — Fiscal parametrizado por documento (Cl.17.2)
    fiscal_classification?: string;
    created_at?: string;
}

export interface ContractApprovalStep {
    level: 1 | 2;
    role: string;
    action: 'APROVADO' | 'REJEITADO';
    approved_by: string;
    approved_at: string;
    notes?: string;
}

export interface ContractInstallment {
    date: string;
    value: number;
}

export interface ContractItem {
    id: string;
    contract_id: string;
    budget_item_id?: string;
    description: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    created_at?: string;
}

export type AddendumType = 'Valor' | 'Prazo' | 'Ambos' | 'Outros';
export type AddendumStatus = 'Pendente' | 'Aprovado' | 'Rejeitado' | 'Cancelado';

export interface ContractAddendum {
    id: string;
    contract_id: string;
    organization_id?: string;
    number: string;
    type: AddendumType;
    description: string;
    value_impact: number;
    new_end_date?: string;
    status: AddendumStatus;
    requested_by?: string;
    approved_by?: string;
    approved_at?: string;
    notes?: string;
    // Prorrogação de locação (migration 20270828000002). `new_start_date` é o
    // gatilho do ramo de prorrogação em approveAddendum.
    // ⚠️ Em contrato recorrente o aditivo NÃO soma montante (value_impact = 0):
    // ele TROCA a mensalidade, que vem em `new_value`.
    new_start_date?: string;
    previous_end_date?: string;
    new_value?: number;
    previous_value?: number;
    reajuste_index?: string;
    reajuste_fator?: number;
    installments_generated?: number;
    // Assinatura própria do aditivo (ZapSign)
    signature_status?: 'PENDING' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
    signature_token?: string;
    signature_url?: string;
    signature_completed_at?: string;
    signed_document_url?: string;
    created_at?: string;
}

// ─────────────────────────────────────────────────────────────
// Versões de documento (contrato e aditivo) — tabela
// contract_document_versions (migration 20270828000001).
// ⚠️ `Contract.minuta_versions` continua existindo, mas é PROJEÇÃO desta
// tabela, mantida por contractDocumentVersionService._syncMinutaMirror para o
// Portal do Cliente. Não escrever no JSONB direto.
// ─────────────────────────────────────────────────────────────

export type DocumentOwnerType = 'CONTRACT' | 'ADDENDUM';
export type DocumentKind = 'MINUTA' | 'CONTRATO' | 'ADITIVO' | 'ANEXO';
export type DocumentSource = 'UPLOAD' | 'TEMPLATE_DOCX' | 'TEMPLATE_HTML';

export interface ContractDocumentVersion {
    id: string;
    organization_id?: string;
    contract_id: string;
    owner_type: DocumentOwnerType;
    owner_id: string;
    v: number;
    kind: DocumentKind;
    name?: string;
    notes?: string;
    url: string;
    storage_path?: string;
    mime_type?: string;
    size_bytes?: number;
    source?: DocumentSource;
    template_id?: string;
    emitted: boolean;
    emitted_at?: string;
    signature_status?: 'PENDING' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
    signature_token?: string;
    signature_url?: string;
    signature_completed_at?: string;
    signed_file_url?: string;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

export type MeasurementStatus = 'Pendente' | 'Em Análise' | 'Processada' | 'Paga' | 'Cancelada';

export interface ContractMeasurement {
    id: string;
    contract_id: string;
    number: number;
    period_start: string;
    period_end: string;
    measurement_date: string;
    status: MeasurementStatus;
    measurement_mode?: MeasurementMode;
    total_value: number;
    retention_value: number;
    net_value: number;
    notes?: string;
    invoice_url?: string;
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    created_at?: string;
}

export interface ContractMeasurementItem {
    id: string;
    measurement_id: string;
    contract_item_id: string;
    quantity_executed: number;
    value_executed: number;
    attachment_urls?: string[];
    percent_executed?: number;
    item_mode?: 'QUANTITATIVO' | 'PERCENTUAL';
    created_at?: string;
}

export type UtilityBillStatus = 'Pendente' | 'Pago' | 'Atrasado' | 'Cancelado';

export interface ContractUtilityBill {
    id: string;
    contract_id: string;
    reference_month: string;
    consumption_metric?: number;
    total_value: number;
    status: UtilityBillStatus;
    due_date?: string;
    notes?: string;
    created_at?: string;
}

// ─────────────────────────────────────────────────────────────
// Fase 5 — Blindagem Jurídico-Financeira (Seguros/Garantias/Penalidades)
// PLANO_MODULO_CONTRATOS_GAPS.md
// ─────────────────────────────────────────────────────────────

/**
 * Modalidade jurídica da garantia. Os oito primeiros valores são de OBRA/
 * suprimentos (Fase 5 de Contratos); os três últimos são de LOCAÇÃO e vêm do
 * rol taxativo do art. 37 da Lei 8.245/91 (+ a ausência formal de garantia).
 *
 * ⚠️ `SEGURO_FIANCA` (locatícia) é distinto de `SEGURO_GARANTIA` (performance
 * de obra) — não reaproveitar um pelo outro.
 */
export type GuaranteeKind =
    | 'RC_GERAL' | 'RC_PROFISSIONAL' | 'SEGURO_GARANTIA' | 'FIANCA'
    | 'CAUCAO' | 'EQUIPAMENTOS' | 'AMBIENTAL' | 'GARANTIA_ADIANTAMENTO'
    | 'SEM_GARANTIA' | 'SEGURO_FIANCA' | 'CESSAO_FIDUCIARIA';

/** Modalidades juridicamente admitidas num contrato de locação (art. 37). */
export const RENTAL_GUARANTEE_KINDS = [
    'SEM_GARANTIA', 'CAUCAO', 'FIANCA', 'SEGURO_FIANCA', 'CESSAO_FIDUCIARIA',
] as const;
export type RentalGuaranteeKind = typeof RENTAL_GUARANTEE_KINDS[number];

export type GuaranteeStatus =
    | 'VIGENTE' | 'VENCIDA' | 'CANCELADA' | 'SUBSTITUIDA'
    | 'EM_ANALISE' | 'PENDENTE_DOCUMENTOS' | 'PENDENTE_ASSINATURA'
    | 'PENDENTE_REGISTRO' | 'EM_RENOVACAO' | 'INSUFICIENTE'
    | 'LIBERADA' | 'DEVOLVIDA';

/** Espécie da caução. Só `DINHEIRO` tem ciclo financeiro na Fase 1. */
export type CaucaoType = 'DINHEIRO' | 'BEM_MOVEL' | 'BEM_IMOVEL' | 'TITULOS' | 'QUOTAS';

/** Separa o uso de obra (várias apólices por contrato) do de locação (uma só). */
export type GuaranteeScope = 'OBRA' | 'LOCACAO';

export interface ContractGuarantee {
    id: string;
    organization_id: string;
    contract_id: string;
    kind: GuaranteeKind;
    /** Provedor da garantia (seguradora, banco, garantidora). */
    insurer?: string;
    policy_number?: string;
    /** Limite ATUAL da cobertura — diverge de `guaranteed_value` após deduções. */
    coverage_limit?: number;
    premium?: number;
    valid_from?: string;
    valid_until?: string;
    document_url?: string;
    status: GuaranteeStatus;
    notes?: string;
    created_at?: string;
    updated_at?: string;

    // ── Locação (migration 20270836000000) ──────────────────────────────────
    scope?: GuaranteeScope;
    /** Produto comercial, separado da modalidade jurídica (ex: título de capitalização). */
    product_name?: string;
    caucao_type?: CaucaoType;
    /** Valor originalmente garantido. */
    guaranteed_value?: number;
    /** Equivalente em nº de aluguéis — base da conferência do art. 38 (máx. 3). */
    rent_months_equivalent?: number;
    cost_bearer?: 'LOCATARIO' | 'LOCADOR' | 'AMBOS';
    scope_notes?: string;

    /** Versionamento: substituir cria versão nova, não edita a existente. */
    version?: number;
    supersedes_id?: string;
    substitution_reason?: string;
    /** É a versão que vale hoje. A trava do art. 43 conta por este campo. */
    is_active?: boolean;

    registry_office?: string;
    registry_protocol?: string;
    registered_at?: string;

    // Caução em dinheiro — o SALDO não mora aqui, é derivado do ledger.
    deposit_bank?: string;
    deposit_agency?: string;
    deposit_account?: string;
    deposit_account_holder?: string;
    deposit_date?: string;

    /** Renovação nunca herda garantia: marca que falta reanálise explícita. */
    requires_reanalysis?: boolean;
}

export interface ContractGuarantor {
    id: string;
    organization_id: string;
    guarantee_id: string;
    person_type: 'PF' | 'PJ';
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;

    /** CC 1.647-1.649: fiança sem outorga é anulável, salvo separação absoluta. */
    marital_status?: string;
    marital_regime?: string;
    spouse_name?: string;
    spouse_document?: string;
    spouse_consent: boolean;

    monthly_income?: number;
    net_worth?: number;
    income_commitment_pct?: number;
    properties_offered?: string;
    analysis_result?: 'PENDENTE' | 'APROVADO' | 'REPROVADO';
    analysis_notes?: string;
    documents_valid_until?: string;
    signed: boolean;

    /** Caução em bem: o titular do bem também é registrado aqui. */
    asset_description?: string;
    asset_value?: number;
    asset_valuation_date?: string;
    asset_registration?: string;
    asset_encumbrances?: string;

    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface GuaranteeDocument {
    id: string;
    organization_id: string;
    guarantee_id: string;
    guarantor_id?: string;
    label: string;
    is_required: boolean;
    received: boolean;
    received_at?: string;
    valid_until?: string;
    file_url?: string;
    notes?: string;
    created_at?: string;
}

/**
 * Movimento do ledger da caução em dinheiro.
 *
 * 🔴 `amount` é o efeito sobre o SALDO DEVIDO AO LOCATÁRIO, não sobre o caixa:
 * DEPOSITO/RENDIMENTO são positivos, DEDUCAO/DEVOLUCAO são negativos (o banco
 * trava o sinal por tipo). Caução é passivo — este ledger NÃO é sincronizado
 * para `internal_transactions`, senão inflaria a receita de locação.
 */
export type GuaranteeDepositEventType = 'DEPOSITO' | 'RENDIMENTO' | 'DEDUCAO' | 'DEVOLUCAO';

export interface GuaranteeDepositEvent {
    id: string;
    organization_id: string;
    guarantee_id: string;
    event_type: GuaranteeDepositEventType;
    event_date: string;
    amount: number;
    description?: string;
    document_url?: string;
    created_at?: string;
}

/** Uma linha da RPC `fn_rental_guarantee_alerts`. */
export interface RentalGuaranteeAlert {
    contract_id: string;
    contract_number?: string;
    contract_title?: string;
    guarantee_id?: string;
    alert_code:
        | 'SEM_GARANTIA_ATIVA' | 'VIGENCIA' | 'COBERTURA_MENOR_QUE_CONTRATO'
        | 'OUTORGA_CONJUGAL_AUSENTE' | 'DOCUMENTO_PENDENTE'
        | 'CAUCAO_A_DEVOLVER' | 'REANALISE_PENDENTE';
    severity: 'ALTA' | 'MEDIA' | 'BAIXA';
    detail: string;
    reference_date?: string;
}

export type PenaltyKind = 'MORATORIA' | 'COMPENSATORIA' | 'SST' | 'OUTRA';
export type PenaltyStatus = 'NOTIFICADA' | 'EM_CURA' | 'APLICADA' | 'CANCELADA';

export interface ContractPenalty {
    id: string;
    organization_id: string;
    contract_id: string;
    kind: PenaltyKind;
    reason: string;
    base_value?: number;
    amount: number;
    status: PenaltyStatus;
    cure_deadline?: string;
    applied_at?: string;
    compensated_measurement_id?: string;
    notes?: string;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

export type RetentionReleaseKind = 'PROVISORIO' | 'DEFINITIVO' | 'MANUAL';

export interface ContractRetentionRelease {
    id: string;
    organization_id: string;
    contract_id: string;
    kind: RetentionReleaseKind;
    amount: number;
    released_at: string;
    released_by?: string;
    notes?: string;
    internal_transaction_id?: string;
    created_at?: string;
}

export interface ContractRetentionLedger {
    total_retained: number;
    total_released: number;
    balance: number;
    retention_cap?: number;
}

// ─────────────────────────────────────────────────────────────
// Fase 6 — Governança da Contratação
// PLANO_MODULO_CONTRATOS_GAPS.md
// ─────────────────────────────────────────────────────────────

export type ContractRiskLevel = 'R1' | 'R2' | 'R3';

export interface ContractRiskAssessment {
    id: string;
    organization_id: string;
    contract_id: string;
    factor_canteiro: 0 | 1 | 2;
    factor_equipe: 0 | 1 | 2;
    factor_sst: 0 | 1 | 2;
    factor_valor: 0 | 1 | 2;
    factor_tecnica: 0 | 1 | 2;
    factor_dados: 0 | 1 | 2;
    factor_continuidade: 0 | 1 | 2;
    factor_pf: 0 | 1 | 2;
    score: number;
    level: ContractRiskLevel;
    assessed_by?: string;
    assessed_at?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ContractLaborQuestionnaire {
    id: string;
    organization_id: string;
    contract_id: string;
    q_horario: boolean;
    q_ordens: boolean;
    q_pessoalidade: boolean;
    q_salario_fixo: boolean;
    q_permanente: boolean;
    q_exclusividade: boolean;
    q_cargo_email: boolean;
    q_ferias: boolean;
    alert_count: number;
    legal_opinion_url?: string;
    answered_by?: string;
    answered_at?: string;
    created_at?: string;
    updated_at?: string;
}

export type SubcontractingRule = 'PROIBIDA' | 'AUTORIZACAO_PREVIA' | 'LISTA';

export interface ContractPrecedentCondition {
    id: string;
    organization_id: string;
    contract_id: string;
    item: string;
    responsible?: string;
    required: boolean;
    satisfied: boolean;
    satisfied_at?: string;
    evidence_url?: string;
    notes?: string;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export type DocumentRequirementPhase = 'ANTES_INICIO' | 'MENSAL' | 'ENCERRAMENTO';

export interface ContractDocumentRequirement {
    id: string;
    organization_id: string;
    contract_id: string;
    document: string;
    phase: DocumentRequirementPhase;
    applicable: boolean;
    last_valid_until?: string;
    document_url?: string;
    blocks_payment: boolean;
    is_sst_critical?: boolean;
    communication_deadline_hours?: number;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ContractDocumentGateItem {
    document: string;
    phase: DocumentRequirementPhase;
    last_valid_until?: string;
    is_expired: boolean;
}

// ─────────────────────────────────────────────────────────────
// Fase 7 — Ciclo de Vida & Encerramento
// PLANO_MODULO_CONTRATOS_GAPS.md
// ─────────────────────────────────────────────────────────────

export type AcceptanceKind = 'PROVISORIO' | 'DEFINITIVO';

export interface AcceptancePendingItem {
    description: string;
    deadline?: string;
    responsible?: string;
}

export interface ContractAcceptance {
    id: string;
    organization_id: string;
    contract_id: string;
    kind: AcceptanceKind;
    issued_at: string;
    pending_items: AcceptancePendingItem[];
    term_url?: string;
    issued_by?: string;
    notes?: string;
    created_at?: string;
}

export type TechnicalCouncil = 'CREA' | 'CAU' | 'CRT';
export type ArtType = 'ART' | 'RRT' | 'TRT';
export type TechnicalResponsibilityStatus = 'VALIDA' | 'SUSPENSA' | 'CANCELADA' | 'BAIXADA';

export interface ContractTechnicalResponsibility {
    id: string;
    organization_id: string;
    contract_id: string;
    professional_name: string;
    council?: TechnicalCouncil;
    council_number?: string;
    art_type: ArtType;
    art_number?: string;
    valid_from?: string;
    valid_until?: string;
    status: TechnicalResponsibilityStatus;
    document_url?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ContractTechnicalGateItem {
    professional_name: string;
    art_type: ArtType;
    art_number?: string;
    status: TechnicalResponsibilityStatus;
    valid_until?: string;
    is_blocking: boolean;
}

export interface ContractEvaluation {
    id: string;
    organization_id: string;
    contract_id: string;
    supplier_id?: string;
    period?: string;
    score_quality: number;
    score_deadline: number;
    score_sst: number;
    score_compliance: number;
    score_communication: number;
    score_commercial: number;
    weighted: number;
    critical_occurrence: boolean;
    evaluated_by?: string;
    notes?: string;
    created_at?: string;
}

export interface SupplierPerformance {
    evaluation_count: number;
    average_weighted: number | null;
    has_critical: boolean;
    should_block: boolean;
}

// ─────────────────────────────────────────────────────────────
// Fase 8 — Detalhamento Técnico & SST
// PLANO_MODULO_CONTRATOS_GAPS.md
// ─────────────────────────────────────────────────────────────

export interface ContractSupplyMatrixItem {
    id: string;
    organization_id: string;
    contract_id: string;
    item: string;
    supplies?: string;
    transports?: string;
    stores?: string;
    installs?: string;
    admissible_loss?: string;
    notes?: string;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface ContractInterface {
    id: string;
    organization_id: string;
    contract_id: string;
    interface_event: string;
    primary_responsible?: string;
    support?: string;
    deadline_trigger?: string;
    evidence?: string;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
}
