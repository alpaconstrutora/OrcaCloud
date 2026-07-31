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
    rental_price?: number;
    current_price?: number;
    price_index?: 'INCC' | 'IPCA' | 'CUB';
    price_base_date?: string;
    status: PropertyStatus;
    specs: {
        bedrooms?: number;
        bathrooms?: number;
        suites?: number;
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
    /** Empresa (companies) dona do imóvel — define o regime tributário na geração
     *  de Tributos a Pagar e é o primeiro degrau da resolução do LOCADOR na
     *  minuta de locação. Migration 20270826000002. */
    company_id?: string;
    /** Registro do imóvel — identificam a unidade na cláusula de objeto e na de
     *  encargos do contrato de locação. Migration 20270842000001. */
    registration_number?: string;
    registry_office?: string;
    iptu_registration?: string;
    parent_id?: string;
    position_type?: 'FRONT' | 'LATERAL' | 'BACK';
    view_type?: 'NONE' | 'PARTIAL' | 'FULL';
    sun_orientation?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
    visible_to_broker?: boolean;
    /** false = oculta nas telas de oferta (switch "Publicar" do Espelho de Vendas). */
    visible_in_sales?: boolean;
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

// Precificação de LOCAÇÃO — reusa a mesma casca hedônica de HedonicPricingConfig,
// mas o eixo de valor é o aluguel (rental_price), não o VGV. Dois modos:
//  - PER_SQM: aluguel = base_per_sqm × score (score embute área × fatores). Cada
//    unidade é precificada independentemente das outras.
//  - TARGET_TOTAL: distribui target_total_rent (aluguel mensal total do prédio)
//    entre as unidades por score, igual ao modelo de Venda.
export interface RentalPricingConfig {
    mode: 'PER_SQM' | 'TARGET_TOTAL';
    base_per_sqm: number;      // usado no modo PER_SQM
    target_total_rent: number; // usado no modo TARGET_TOTAL
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

/**
 * Uma unidade que compõe uma negociação/contrato comercial (tabela
 * `commercial_deal_units`). Um contrato de locação pode reunir apartamento +
 * vaga + box sob um único inquilino; cada linha carrega o valor daquela unidade
 * e a soma alimenta `PropertyDeal.value`.
 */
export interface DealUnit {
    id?: string;
    deal_id?: string;
    property_id: string;
    organization_id?: string;
    value: number;
    /** A unidade principal é a que espelha `PropertyDeal.property_id`. */
    is_primary?: boolean;
    /** Campo transitório de UI (nome da unidade) — nunca vai ao banco. */
    _propertyName?: string;
}

export interface PropertyDeal {
    id: string;
    organization_id?: string;
    /** Código sequencial de 3 dígitos (001, 002, ...) gerado automaticamente por
     *  organização entre as negociações de Venda de Ativos (type='SALE'). Estável:
     *  atribuído na criação e nunca reaproveitado. */
    code?: string;
    /** Unidade PRINCIPAL do contrato. Mantida por compatibilidade com todo o
     *  código que lê a coluna direta (Dashboard, Corretor, BI, Espelho); a lista
     *  completa vive em `units`. */
    property_id: string;
    /** Todas as unidades do contrato. Derivada de `commercial_deal_units` na
     *  leitura e persistida por `commercialService.saveDeal` na escrita — NÃO é
     *  coluna de `commercial_deals`. Quando presente, manda em `property_id`
     *  (a is_primary) e em `value` (a soma). */
    units?: DealUnit[];
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
    /** Locação: valor mensal do contrato (a parcela). `value` é a soma das
     *  unidades — no aluguel ela funciona como valor mensal SUGERIDO. */
    installment_value?: number;
    /** Locação: valor total do contrato. SEMPRE `installment_value * installments`
     *  (campo read-only na UI). A única exceção é o ajuste por desconto aplicado
     *  em parcelas já lançadas, confirmado pelo usuário.
     *  Coluna própria porque `value` é reescrita pela soma das unidades. */
    contract_total_value?: number;
    down_payment?: number;
    /** Forma de pagamento, tipo de parcela e observação da Entrada — mesmos campos por parcela em custom_installments, espelhados aqui porque a Entrada não é um item do array (é o campo down_payment). */
    down_payment_payment_type?: PaymentInstallment['paymentType'];
    down_payment_installment_type?: PaymentInstallment['installmentType'];
    down_payment_notes?: string;
    payment_due_date?: string;
    /** Origem/canal do negócio (ex.: Direto, Portal, Imobiliária) — alimenta "Fontes de Locação"/Vendas */
    origin_channel?: string;
    /**
     * Só locação. Defasagem em meses entre a competência (auferimento do aluguel)
     * e o vencimento da parcela. Postecipado (aluguel do mês vence no mês seguinte) = 1;
     * 0 = competência no próprio mês do vencimento; negativo = antecipado. Usado só no
     * regime de competência para datar os tributos gerados (taxPayableService).
     */
    rental_competencia_offset_months?: number;
    /** Só locação. Fim da vigência (YYYY-MM-DD) — vira contracts.end_date e delimita as parcelas. */
    end_date?: string;
    /** Só locação. Periodicidade do faturamento; default Mensal em createFromDeal. */
    billing_cycle?: 'Mensal' | 'Bimestral' | 'Semestral' | 'Anual';
    /** Só locação. Índice de reajuste — MESMOS nomes de contract_index_values.index_name. */
    reajuste_index?: string;
    /** Checklist de documentos do cliente/comprador (mapa chave→marcado). As chaves
     *  variam conforme o tipo de pessoa (PF/PJ) — ver DEAL_DOC_CHECKLIST em DealModal. */
    doc_checklist?: Record<string, boolean>;
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
