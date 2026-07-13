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
    retention_rate: number;
    responsible_email?: string;
    signed_contract_url?: string;
    empresa_id?: string;
    cost_center_id?: string;
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
    created_at?: string;
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

export type GuaranteeKind =
    | 'RC_GERAL' | 'RC_PROFISSIONAL' | 'SEGURO_GARANTIA' | 'FIANCA'
    | 'CAUCAO' | 'EQUIPAMENTOS' | 'AMBIENTAL' | 'GARANTIA_ADIANTAMENTO';

export type GuaranteeStatus = 'VIGENTE' | 'VENCIDA' | 'CANCELADA' | 'SUBSTITUIDA';

export interface ContractGuarantee {
    id: string;
    organization_id: string;
    contract_id: string;
    kind: GuaranteeKind;
    insurer?: string;
    policy_number?: string;
    coverage_limit?: number;
    premium?: number;
    valid_from?: string;
    valid_until?: string;
    document_url?: string;
    status: GuaranteeStatus;
    notes?: string;
    created_at?: string;
    updated_at?: string;
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
