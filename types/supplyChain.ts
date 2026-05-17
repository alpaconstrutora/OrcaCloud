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
    costCenter?: string;
    chartOfAccounts?: string;
    notes?: string;
    items: PurchaseOrderItem[];
    version?: number;
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
