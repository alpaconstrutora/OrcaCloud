// types/empreendimento.ts
// Módulo Empreendimentos (Incorporação) — entidade central que possui 1..N obras (projects).
// Hierarquia: Empreendimento → Torres (= obra) → Unidades (pavimento = floor) + Áreas Comuns.

export type EmpreendimentoStatus =
    | 'PLANEJAMENTO' | 'LANCAMENTO' | 'EM_OBRAS' | 'ENTREGUE' | 'ENCERRADO';

export type EmpreendimentoTipo =
    | 'VERTICAL' | 'HORIZONTAL' | 'MISTO' | 'COND_LOGISTICO' | 'COND_INDUSTRIAL';

export type FloorTipo =
    | 'SUBSOLO' | 'TERREO' | 'MEZANINO' | 'TIPO' | 'COBERTURA' | 'TECNICO' | 'GARAGEM' | 'OUTRO';

export type UnitPositionType = 'FRENTE' | 'LATERAL' | 'FUNDOS';
export type UnitSunOrientation = 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';
export type UnitViewType = 'SEM_VISTA' | 'PARCIAL' | 'PLENA';
export type UnitStatus = 'DISPONIVEL' | 'RESERVADO' | 'PERMUTADO' | 'VENDIDO';
export type CommonAreaCategory = 'LAZER' | 'COMUM' | 'TECNICA' | 'CIRCULACAO' | 'GARAGEM' | 'OUTRO';

export interface Empreendimento {
    id: string;
    organization_id: string;
    name: string;
    code?: string;
    status: EmpreendimentoStatus;
    tipo?: EmpreendimentoTipo | null;

    // Vínculo vivo com o estudo Imovib
    imovib_study_id?: string | null;
    last_synced_at?: string | null;

    // Vínculo vivo com o estudo de arquitetura (Planta IA) — direto, sem passar pelo Imovib
    planta_ai_study_id?: string | null;

    // Dados gerais / regularização
    matricula?: string;
    construtora?: string;          // distinta da incorporadora (developer_name)
    responsavel_tecnico?: string;
    crea_cau?: string;
    numero_processo?: string;

    // Endereço de divulgação / oficial (separado do terreno)
    endereco_street?: string;
    endereco_number?: string;
    endereco_complement?: string;
    endereco_neighborhood?: string;
    endereco_city?: string;
    endereco_state?: string;
    endereco_zip_code?: string;

    // SPE
    spe_razao_social?: string;
    spe_cnpj?: string;
    spe_nome_fantasia?: string;

    // Terreno
    terreno_street?: string;
    terreno_number?: string;
    terreno_complement?: string;
    terreno_neighborhood?: string;
    terreno_city?: string;
    terreno_state?: string;
    terreno_zip_code?: string;
    terreno_area?: number;
    terreno_frente?: number;
    terreno_fundos?: number;
    terreno_lateral_direita?: number;
    terreno_lateral_esquerda?: number;

    // Comercial
    vgv_total?: number;
    commercial_building_id?: string | null;  // edifício-pai no módulo Comercial (agrupa as unidades publicadas p/ venda)
    commercial_rental_building_id?: string | null;  // edifício-pai no módulo Locações (agrupa as unidades publicadas p/ aluguel)
    developer_name?: string;
    manager?: string;
    launch_date?: string;
    expected_delivery_date?: string;

    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;

    // Relacionamentos (carregados sob demanda)
    towers?: EmpreendimentoTower[];
    common_areas?: EmpreendimentoCommonArea[];
}

export type EmpreendimentoInsert = Omit<Empreendimento, 'id' | 'created_at' | 'updated_at' | 'towers' | 'common_areas'>;
export type EmpreendimentoUpdate = Partial<EmpreendimentoInsert>;

export interface EmpreendimentoTower {
    id: string;
    empreendimento_id: string;
    project_id?: string | null;
    imovib_block_id?: string | null;
    planta_ai_scenario_id?: string | null;
    name: string;
    floors_count?: number;
    units_per_floor?: number;
    construction_cost_sqm?: number;
    sales_price_sqm?: number;
    sort_order?: number;
    created_at: string;
    updated_at: string;
    units?: EmpreendimentoUnit[];
}

export type EmpreendimentoTowerInsert = Omit<EmpreendimentoTower, 'id' | 'created_at' | 'updated_at' | 'units'>;
export type EmpreendimentoTowerUpdate = Partial<EmpreendimentoTowerInsert>;

export interface EmpreendimentoFloor {
    id: string;
    tower_id: string;
    name: string;
    tipo: FloorTipo;
    floor_number: number;
    repeat_count: number;
    units_per_floor?: number | null;
    prefix?: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export type EmpreendimentoFloorInsert = Omit<EmpreendimentoFloor, 'id' | 'created_at' | 'updated_at'>;
export type EmpreendimentoFloorUpdate = Partial<EmpreendimentoFloorInsert>;

export interface EmpreendimentoUnit {
    id: string;
    tower_id: string;
    floor_id?: string | null;
    floor_tipo?: FloorTipo | null;
    imovib_unit_id?: string | null;
    imovib_instance_id?: string | null;
    planta_ai_unit_id?: string | null;
    name: string;
    floor?: number;
    typology?: string;
    private_area?: number;
    common_area?: number;
    total_area?: number;
    bedrooms?: number;
    bathrooms?: number;
    parking_spaces?: number;
    position_type?: UnitPositionType | null;
    sun_orientation?: UnitSunOrientation | null;
    view_type?: UnitViewType | null;
    price?: number;
    status: UnitStatus;
    is_vendavel?: boolean;
    commercial_property_id?: string | null;   // ponte p/ Venda de Ativos (purpose='SALE')
    rental_property_id?: string | null;        // ponte p/ Locações (purpose='RENTAL') — eixo independente
    sort_order?: number;
    // Escrita reversa do motor de Areas NBR 12721 (F4) — so-leitura no Comercial,
    // alimentados exclusivamente pela versao calculada/aprovada/travada do motor.
    fracao_ideal_decimal?: number | null;
    fracao_ideal_thousandths?: number | null;
    area_real_total_m2?: number | null;
    area_engine_version_id?: string | null;
    area_engine_synced_at?: string | null;
    created_at: string;
    updated_at: string;
}

export type EmpreendimentoUnitInsert = Omit<EmpreendimentoUnit, 'id' | 'created_at' | 'updated_at'>;
export type EmpreendimentoUnitUpdate = Partial<EmpreendimentoUnitInsert>;

export interface EmpreendimentoCommonArea {
    id: string;
    empreendimento_id: string;
    tower_id?: string | null;
    name: string;
    category: CommonAreaCategory;
    area?: number;
    floor?: number;
    description?: string;
    is_vendavel?: boolean;
    sort_order?: number;
    created_at: string;
    updated_at: string;
}

export type EmpreendimentoCommonAreaInsert = Omit<EmpreendimentoCommonArea, 'id' | 'created_at' | 'updated_at'>;
export type EmpreendimentoCommonAreaUpdate = Partial<EmpreendimentoCommonAreaInsert>;

export type EmpreendimentoWithChildren = Empreendimento & {
    towers: EmpreendimentoTower[];
    common_areas: EmpreendimentoCommonArea[];
};

// Relatório de sincronização com o estudo Imovib (Fase 2)
export interface EmpreendimentoSyncReport {
    towersCreated: number;
    towersUpdated: number;
    unitsCreated: number;
    unitsUpdated: number;
    commonAreasUpserted: number;
    orphanTowers: EmpreendimentoTower[];
    orphanUnits: EmpreendimentoUnit[];
    skippedDueToLocalChanges: string[];
    warnings: string[];
}

// ── Ponte direta com o Planta IA ────────────────────────────────────────────
// Espelha EmpreendimentoSyncReport (Imovib), mas a proveniência aqui é
// plant_scenarios → torre e plant_units → unidade.

/** Planta IA → Empreendimento. */
export interface PlantaAiSyncReport {
    towersCreated: number;
    towersUpdated: number;
    unitsCreated: number;
    unitsUpdated: number;
    /** Unidades materializadas no cenário escolhido — o tamanho do lado "Planta IA".
     *  Distinto de unitsCreated/unitsUpdated, que contam só o que o sync mudaria. */
    scenarioUnits: number;
    /** Torres cujo cenário de origem sumiu do estudo — nunca auto-deletadas. */
    orphanTowers: EmpreendimentoTower[];
    /** Unidades cuja plant_unit de origem sumiu — nunca auto-deletadas. */
    orphanUnits: EmpreendimentoUnit[];
    warnings: string[];
}

/** Empreendimento → Planta IA (só agregados estruturais; nunca preço/VGV/status). */
export interface PlantaAiWriteBackReport {
    scenarioId: string;
    scenarioName: string;
    /** Campos que divergem hoje: { campo, de, para }. Vazio = cenário já reflete o real. */
    changes: { field: string; from: number | null; to: number }[];
    /** Unidades reais sem proveniência no Planta IA (criadas à mão ou vindas do Imovib). */
    unitsWithoutPlantaOrigin: number;
}
