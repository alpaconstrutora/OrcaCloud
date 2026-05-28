export type ContractType = 'Empreitada Global' | 'Preço Unitário' | 'Administração' | 'Subempreitada' | 'Concessionária' | 'Assinatura/SaaS' | 'Manutenção Recorrente' | 'Outros';
export type ContractNature = 'Fornecimento' | 'Serviço' | 'Mão de Obra' | 'Locação' | 'Consumo' | 'Outros';
export type ContractStatus = 'Rascunho' | 'Enviado' | 'Ativo' | 'Suspenso' | 'Encerrado' | 'Cancelado';

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
    created_at?: string;
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
    total_value: number;
    retention_value: number;
    net_value: number;
    notes?: string;
    invoice_url?: string;
    created_at?: string;
}

export interface ContractMeasurementItem {
    id: string;
    measurement_id: string;
    contract_item_id: string;
    quantity_executed: number;
    value_executed: number;
    attachment_urls?: string[];
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
