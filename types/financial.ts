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
    linkedProjectId?: string;
    commissionRate?: number;
    brokerName?: string;
    attachmentUrl?: string;
}

export interface FinancialTransaction {
    id: string;
    date: string;
    type: 'EXPENSE' | 'INCOME';
    category: string;
    description: string;
    value: number;
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    supplier?: string;
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
    organization_id: string;
    name: string;
    description?: string;
    bank?: string;
    branch?: string;
    account_number?: string;
    created_at?: string;
}

export interface CostCenter {
    id: string;
    organization_id: string;
    name: string;
    code?: string;
    created_at?: string;
}

export interface ChartOfAccount {
    id: string;
    organization_id: string;
    name: string;
    code: string;
    type?: string;
    parent_id?: string;
    created_at?: string;
}

export type BankTransactionStatus = 'IMPORTED' | 'NORMALIZED' | 'MATCHED' | 'CONFIRMED' | 'LOCKED' | 'RULE_APPLIED';
export type InternalTransactionStatus = 'PENDING' | 'CONCILIATED' | 'CANCELLED';
export type MatchType = 'RULE' | 'HEURISTIC' | 'AI' | 'MANUAL';

export interface InternalTransaction {
    id: string;
    organization_id: string;
    source_system: 'COMMERCIAL' | 'PROJECT' | 'MANUAL';
    reference_id?: string;
    transaction_date: string;
    amount: number;
    direction: 'CREDIT' | 'DEBIT';
    description?: string;
    category?: string;
    entity_name?: string;
    status: InternalTransactionStatus;
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
