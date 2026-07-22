import type { ApprovalStep } from './financial';

export interface PurchaseOrderItem {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface PurchaseOrder {
    id: string;
    number?: string;
    supplierId: string;
    supplierName?: string;
    projectId: string;
    projectName?: string;
    empresaId?: string;
    projectClassification?: 'OBRA' | 'ORCAMENTO';
    linkedProjectName?: string;
    linkedProjectId?: string;
    deliveryDate: string;
    separationDate?: string;
    shippedDate?: string;
    actualDeliveryDate?: string;
    status: 'Rascunho' | 'Enviado' | 'Em Negociação' | 'Confirmado' | 'Separação' | 'Em Trânsito' | 'Entregue' | 'Recebido' | 'Divergência' | 'Cancelado';
    paymentMethod?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    isFinancialApproved?: boolean;
    deliveryMethod?: string;
    deliveryLocation?: string;
    receivedAt?: string;
    receiptPhotoPath?: string;
    receiptNotes?: string;
    discrepancyReport?: {
        code: string;
        description: string;
        issue: 'quebrado' | 'faltando';
        quantity: number;
        notes?: string;
        }[];
    bankAccount?: string;
    // Legado: nome copiado em texto livre — mantido só para exibir pedidos
    // antigos. Pedidos novos gravam costCenterId (FK para cost_centers_v2);
    // o form também preenche este campo com o mesmo nome, para não quebrar
    // telas que ainda leem o texto (FinancialOrderDetails, financialService).
    costCenter?: string;
    costCenterId?: string;
    chartOfAccounts?: string;
    notes?: string;
    items: PurchaseOrderItem[];
    version?: number;
    // Aprovação multinível unificada (approvalService). Independente de isFinancialApproved.
    approval_status?: 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO';
    approval_chain?: ApprovalStep[];
    approval_required_levels?: 1 | 2;
    created_at?: string;
    updated_at?: string;
    status_updated_at?: string;
}

export interface QuotationRequestItem {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice?: number;
}

export interface QuotationRequest {
    id: string;
    number: string;
    projectId: string;
    projectName?: string;
    title: string;
    description?: string;
    deadline: string;
    status: 'Aberta' | 'Em Análise' | 'Concluída' | 'Cancelada';
    items: QuotationRequestItem[];
    invitedSupplierIds: string[];
    deliveryDate?: string;
    deliveryMethod?: string;
    deliveryLocation?: string;
    paymentMethod?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    created_at?: string;
    updated_at?: string;
}

export interface NegotiationEvent {
    timestamp: string;
    action: 'Proposta' | 'Contraproposta' | 'Contraproposta enviada' | 'Aceita' | 'Aceite de contraproposta' | 'Recusada' | 'Recusa de contraproposta';
    author: 'Fornecedor' | 'Comprador';
    changes: {
        items?: { code: string; oldPrice: number; newPrice: number }[];
        deliveryDate?: { old: string; new: string };
        deliveryMethod?: { old: string; new: string };
        paymentMethod?: { old: string; new: string };
        paymentTermType?: { old: string; new: string };
        paymentDays?: { old: number; new: number };
        paymentInstallments?: { old: number; new: number };
        };
    notes?: string;
}

export interface QuotationResponse {
    id: string;
    requestId: string;
    supplierId: string;
    supplierName?: string;
    supplierNickname?: string | null;
    items: {
        code: string;
        description: string;
        unit: string;
        quantity: number;
        unitPrice: number;
        total: number;
        notes?: string;
        }[];
    deliveryDate?: string;
    deliveryMethod?: string;
    deliveryLocation?: string;
    paymentMethod?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    status: 'Pendente' | 'Enviada' | 'Selecionada' | 'Recusada';
    negotiationStatus?: 'Original' | 'Contraproposta' | 'Nova Proposta' | 'Aceita' | 'Recusada';
    counterProposal?: {
        items: { code: string; unitPrice: number }[];
        deliveryDate?: string;
        deliveryMethod?: string;
        deliveryLocation?: string;
        paymentMethod?: string;
        paymentTermType?: 'Vista' | 'Parcelado';
        paymentDays?: number;
        paymentInstallments?: number;
        notes?: string;
        };
    negotiationHistory?: NegotiationEvent[];
    notes?: string;
    created_at?: string;
}
