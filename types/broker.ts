import { Property } from "./imovib";

export type BrokerUnitStatus = 'AVAILABLE' | 'SOLD' | 'RENTED' | 'RESERVED' | 'MAINTENANCE';
export type BrokerUnit = Property;

export interface BrokerReservation {
    id: string;
    property_id: string;
    broker_id: string;
    broker_email: string;
    status: 'ATIVA' | 'EXPIRADA' | 'CONVERTIDA' | 'CANCELADA';
    expires_at: string;
    created_at?: string;
}

export interface BrokerPaymentPlan {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    down_payment_pct: number;
    monthly_installments: number;
    balloon_installments?: number;
    balloon_months?: number[];
    financing_pct: number;
    interest_rate?: number;
    is_default?: boolean;
}

export interface BrokerProposal {
    id: string;
    property_id: string;
    broker_id: string;
    broker_email: string;
    organization_id: string;
    buyer_name: string;
    buyer_cpf: string;
    buyer_email?: string;
    buyer_phone?: string;
    buyer_income?: number;
    unit_price: number;
    down_payment: number;
    monthly_installments: number;
    monthly_value: number;
    balloon_value?: number;
    financing_value?: number;
    payment_plan_id?: string;
    discount_pct?: number;
    total_value: number;
    status: 'RASCUNHO' | 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'CONTRAPROPOSTA' | 'REJEITADA';
    notes?: string;
    admin_notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface BrokerProfile {
    id: string;
    email: string;
    name: string;
    phone?: string;
    cpf?: string;
    creci?: string;
    agency_name?: string;
    organization_id: string;
    commission_rate?: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type BrokerLeadStage = 'LEAD' | 'VISITA' | 'PROPOSTA' | 'NEGOCIACAO' | 'VENDA';

export interface BrokerLead {
    id: string;
    broker_id: string;
    broker_email: string;
    organization_id: string;
    name: string;
    cpf?: string;
    email?: string;
    phone?: string;
    origin: 'SITE' | 'INDICACAO' | 'PLANTAO' | 'REDES_SOCIAIS' | 'IMOBILIARIA' | 'OUTRO';
    stage: BrokerLeadStage;
    interest_typology?: string;
    interest_block?: string;
    budget_range?: string;
    protection_until: string;
    notes?: string;
    interactions?: BrokerLeadInteraction[];
    created_at?: string;
    updated_at?: string;
}

export interface BrokerLeadInteraction {
    id: string;
    date: string;
    type: 'LIGACAO' | 'VISITA' | 'EMAIL' | 'WHATSAPP' | 'REUNIAO' | 'PROPOSTA';
    description: string;
}

export interface BrokerCommission {
    id: string;
    organization_id: string;
    proposal_id?: string;
    broker_email: string;
    unit_number?: string;
    block?: string;
    buyer_name?: string;
    sale_value: number;
    commission_pct: number;
    commission_predicted: number;
    commission_released: number;
    commission_paid: number;
    status: 'PENDENTE' | 'PARCIAL' | 'LIBERADA' | 'PAGA';
    milestones?: { name: string; date?: string; value: number; paid: boolean }[];
    created_at?: string;
    updated_at?: string;
}

export interface BrokerMaterial {
    id: string;
    organization_id: string;
    project_id?: string;
    project_name: string;
    title: string;
    type: 'BOOK' | 'PLANTA' | 'RENDER' | 'VIDEO' | 'TOUR_360' | 'MEMORIAL' | 'TABELA';
    file_url: string;
    thumbnail_url?: string;
    version: number;
    is_active: boolean;
    views_count?: number;
    created_at?: string;
    updated_at?: string;
}

export interface BrokerRankEntry {
    id: string;
    broker_id: string;
    broker_name: string;
    broker_email: string;
    avatar_url?: string;
    sales_count: number;
    sales_volume: number;
    leads_converted: number;
    proposals_sent: number;
    position: number;
    previous_position?: number;
    badges: BrokerBadge[];
    goal_sales: number;
    goal_volume: number;
}

export interface BrokerBadge {
    id: string;
    name: string;
    icon: string;
    description: string;
    earned_at: string;
}

export interface BrokerTrainingModule {
    id: string;
    organization_id: string;
    project_name: string;
    title: string;
    description: string;
    type: 'VIDEO' | 'DOCUMENTO' | 'QUIZ';
    content_url?: string;
    duration_minutes?: number;
    is_required: boolean;
    questions?: { question: string; options: string[]; correct_index: number }[];
    progress_pct: number;
    is_completed: boolean;
    completed_at?: string;
    certificate_url?: string;
    expires_at?: string;
}

export interface BrokerEvent {
    id: string;
    organization_id: string;
    project_name?: string;
    title: string;
    description?: string;
    type: 'PLANTAO' | 'LANCAMENTO' | 'TREINAMENTO' | 'VISITA_OBRA' | 'NETWORKING' | 'OUTRO';
    date: string;
    end_date?: string;
    location?: string;
    max_capacity?: number;
    registered_count: number;
    is_registered: boolean;
    status: 'ABERTO' | 'LOTADO' | 'ENCERRADO' | 'CANCELADO';
}

export interface BrokerChatMessage {
    id: string;
    channel_id: string;
    sender_name: string;
    sender_email: string;
    sender_type: 'CORRETOR' | 'INCORPORADORA';
    message: string;
    is_pinned: boolean;
    created_at: string;
}

export interface BrokerAnalyticsData {
    period: string;
    rankings: { broker_name: string; sales: number; volume: number; conversion_rate: number }[];
    channel_performance: { channel: string; leads: number; conversions: number; rate: number }[];
    monthly_sales: { month: string; count: number; volume: number }[];
    proposal_funnel: { stage: string; count: number }[];
    top_units: { unit: string; block: string; views: number; proposals: number }[];
    avg_sale_time_days: number;
    approval_rate: number;
}

export interface BrokerHealthKPI {
    id: string;
    project_name: string;
    total_units: number;
    sold_units: number;
    available_units: number;
    reserved_units: number;
    vgv_total: number;
    vgv_sold: number;
    ivv: number;
    months_to_sell: number;
    absorption_curve: { month: string; sold_cumulative: number; projected: number }[];
    mix_sales: { typology: string; sold: number; total: number; pct: number }[];
    top_channel: string;
    avg_ticket: number;
}

export interface BrokerIntegration {
    id: string;
    name: string;
    type: 'CRM' | 'ERP' | 'ASSINATURA' | 'PAGAMENTO' | 'OUTRO';
    provider: string;
    status: 'ATIVO' | 'INATIVO' | 'CONFIGURANDO' | 'ERRO';
    last_sync?: string;
    events_count?: number;
    description: string;
    icon?: string;
}
