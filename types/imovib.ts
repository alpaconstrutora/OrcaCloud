import { PaymentInstallment } from "./financial";

export enum PropertyStatus {
    AVAILABLE = 'AVAILABLE',
    SOLD = 'SOLD',
    RENTED = 'RENTED',
    RESERVED = 'RESERVED',
    MAINTENANCE = 'MAINTENANCE',
    EXCHANGED = 'EXCHANGED',
    STUDY = 'STUDY'
}

export interface Property {
    id: string;
    organization_id?: string;
    project_id?: string;
    name: string;
    type: 'APARTMENT' | 'HOUSE' | 'LAND' | 'COMMERCIAL' | 'BUILDING';
    purpose?: 'SALE' | 'RENTAL' | 'BOTH';
    address: string;
    street?: string;
    number?: string;
    planta_ai_study_id?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    area: number;
    private_area?: number;
    common_area?: number;
    total_area?: number;
    price: number;
    initial_price?: number;
    table_price?: number;
    current_price?: number;
    price_index?: 'INCC' | 'IPCA' | 'CUB';
    price_base_date?: string;
    status: PropertyStatus;
    specs: {
        bedrooms?: number;
        bathrooms?: number;
        parkingSpaces?: number;
        floor?: number;
        typology?: string;
        matrixConfig?: TowerMatrixConfig[];
        connectedTowers?: boolean;
        connectionDirection?: 'HORIZONTAL' | 'VERTICAL';
        grid_x?: number;
        grid_y?: number;
        };
    block?: string;
    floor?: number;
    typology?: string;
    bedrooms?: number;
    bathrooms?: number;
    parking_spaces?: number;
    sun_position?: string;
    features?: string[];
    images?: string[];
    floor_plan_url?: string;
    client_id?: string;
    parent_id?: string;
    position_type?: 'FRONT' | 'LATERAL' | 'BACK';
    view_type?: 'NONE' | 'PARTIAL' | 'FULL';
    sun_orientation?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
    created_at?: string;
}

export interface HedonicPricingConfig {
    target_vgv: number;
    floor_coefficient: number;
    include_exchanged?: boolean;
    position_weights: {
        FRONT: number;
        LATERAL: number;
        BACK: number;
        };
    view_weights: {
        NONE: number;
        PARTIAL: number;
        FULL: number;
        };
    orientation_weights: {
        NORTH: number;
        SOUTH: number;
        EAST: number;
        WEST: number;
        };
}

export interface GridCellConfig {
    x: number;
    y: number;
    unitIndex: number;
    position_type: 'FRONT' | 'LATERAL' | 'BACK' | 'NONE';
    sun_orientation?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
    is_manual_orientation?: boolean;
}

export interface TowerNumberingConfig {
    type: 'FLOOR_BASED' | 'SEQUENTIAL';
    startNumber: number;
    prefix?: string;
    suffix?: string;
}

export interface TowerMatrixConfig {
    id: string;
    name: string;
    floors: number;
    unitsWidth: number;
    unitsDepth: number;
    gridCells: GridCellConfig[];
    numberingConfig?: TowerNumberingConfig;
    top_orientation?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
}

export interface PropertyDeal {
    id: string;
    organization_id?: string;
    property_id: string;
    client_id: string;
    linked_project_id?: string;
    type: 'SALE' | 'RENTAL' | 'SERVICE';
    value: number;
    status: 'IN_NEGOTIATION' | 'PENDING' | 'WAITING_PAYMENT' | 'RESERVA' | 'CONTRATO' | 'ASSINATURA' | 'COMPLETED' | 'CANCELLED';
    date: string;
    contract_number?: string;
    notes?: string;
    payment_method?: string;
    installments?: number;
    installment_value?: number;
    down_payment?: number;
    /** Forma de pagamento, tipo de parcela e observação da Entrada — mesmos campos por parcela em custom_installments, espelhados aqui porque a Entrada não é um item do array (é o campo down_payment). */
    down_payment_payment_type?: PaymentInstallment['paymentType'];
    down_payment_installment_type?: PaymentInstallment['installmentType'];
    down_payment_notes?: string;
    payment_due_date?: string;
    /** Origem/canal do negócio (ex.: Direto, Portal, Imobiliária) — alimenta "Fontes de Locação"/Vendas */
    origin_channel?: string;
    broker_id?: string;
    broker_name?: string;
    broker_commission_pct?: number;
    broker_commission_value?: number;
    broker_payment_due_date?: string;
    broker_payment_method?: string;
    custom_installments?: PaymentInstallment[];
    created_at?: string;
    // Assinatura eletrônica (ZapSign)
    signature_token?: string;
    signature_status?: 'NONE' | 'PENDING' | 'SIGNED' | 'REFUSED';
    signature_url?: string;
    signature_completed_at?: string;
    signed_contract_url?: string;
    // Distrato / Cancelamento
    cancellation_reason?: string;
    cancellation_date?: string;
    cancellation_refund_amount?: number;
}

export interface ImovibCapexItem {
    id: string;
    study_id: string;
    category: string;
    subcategory?: string;
    name: string;
    value_type: 'currency' | 'percent';
    value: number;
    created_at: string;
    updated_at: string;
}

export type ImovibCapexItemInsert = Omit<ImovibCapexItem, 'id' | 'created_at' | 'updated_at'>;

// ImovibRegulatoryZone removido: o Mapa Regulatório mora no empreendimento
// (EmpreendimentoRegulatoryZone em types/empreendimento.ts, migration 20270218000002).

export interface ImovibStudy {
    id: string;
    organization_id: string;
    name: string;
    cnpj?: string;
    planta_ai_study_id?: string;
    developer?: string;
    manager?: string;
    version: string;
    segment?: string;
    sub_classification?: string;
    phase?: string;
    zoning?: string;
    needs_eiv?: boolean;
    spe_cnpj?: string;
    developer_name?: string;
    project_manager?: string;
    base_date?: string;
    development_modality?: string;
    zoning_info?: string;
    ca_basic?: number;
    ca_max?: number;
    occupancy_rate?: number;
    occupancy_rate_max?: number;
    land_frontage?: number;
    land_shape_raw?: string;
    efficiency_percent?: number;
    opportunity_cost_percent?: number;
    inflation_index_obra?: string;
    inflation_index_vendas?: string;
    location_macro?: string;
    location_micro?: string;
    location_score?: number;
    demand_deficit?: string;
    competitors_analysis?: string;
    vso_regional_percent?: number;
    swot_analysis?: Record<string, unknown>;
    target_audience?: string;
    land_cost?: number;
    revenue_downpayment_percent?: number;
    revenue_construction_percent?: number;
    revenue_handover_percent?: number;
    default_rate_percent?: number;
    cancellation_rate_percent?: number;
    funding_equity_percent?: number;
    funding_debt_percent?: number;
    swap_financial_percent?: number;
    swap_physical_percent?: number;
    esg_environmental_score?: number;
    esg_social_score?: number;
    esg_governance_score?: number;
    esg_certifications?: string[];
    esg_initiatives?: { id: string, name: string, category: 'E' | 'S' | 'G', cost: number, vgv_premium: number, funding_discount: number, active: boolean }[];
    esg_notes?: string;
    committee_decision?: string;
    committee_notes?: string;
    capex_mode?: 'simplified' | 'detailed';
    capex_simplified_cost_sqm?: number;
    capex_simplified_area_sqm?: number;
    terreno_frente?: number;
    terreno_fundos?: number;
    terreno_lateral_direita?: number;
    terreno_lateral_esquerda?: number;
    terreno_area?: number;
    duration_months?: number;
    construction_duration_months?: number;
    sales_duration_months?: number;
    construction_start_month?: number;
    sales_start_month?: number;
    inflation_rate?: number;
    discount_rate?: number;
    sales_velocity?: number;
    tax_rate?: number;
    brokerage_fee?: number;
    financing_percent?: number;
    financing_rate_annual?: number;
    created_at: string;
    updated_at: string;
    blocks?: ImovibBlock[];
    capex_items?: ImovibCapexItem[];
}

export type ImovibStudyInsert = Omit<ImovibStudy, 'id' | 'created_at' | 'updated_at' | 'blocks'>;
export type ImovibStudyUpdate = Partial<ImovibStudyInsert>;

export interface ImovibBlock {
    id: string;
    study_id: string;
    name: string;
    construction_cost_sqm: number;
    sales_price_sqm: number;
    created_at?: string;
    updated_at?: string;
    units?: ImovibUnit[];
}

export type ImovibBlockInsert = Omit<ImovibBlock, 'id' | 'created_at' | 'updated_at' | 'units'>;
export type ImovibBlockUpdate = Partial<ImovibBlockInsert>;

export interface ImovibUnit {
    id: string;
    block_id: string;
    name: string;
    quantity: number;
    private_area: number;
    common_area: number;
    pavimentos?: number;
    is_vendavel?: boolean;
    created_at?: string;
    updated_at?: string;
}

export type ImovibUnitInsert = Omit<ImovibUnit, 'id' | 'created_at' | 'updated_at'>;
export type ImovibUnitUpdate = Partial<ImovibUnitInsert>;

export interface ImovibUnitInstance {
    id: string;
    study_id: string;
    block_id: string;
    unit_id?: string | null;
    name: string;
    floor: number;
    private_area: number;
    position_type: 'FRENTE' | 'LATERAL' | 'FUNDOS';
    sun_orientation: 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';
    price: number;
    status: 'DISPONÍVEL' | 'RESERVADO' | 'PERMUTADO' | 'VENDIDO';
    created_at: string;
    updated_at: string;
}

export type ImovibUnitInstanceInsert = Omit<ImovibUnitInstance, 'id' | 'created_at' | 'updated_at'>;
