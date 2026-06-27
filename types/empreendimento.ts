// types/empreendimento.ts
// Módulo Empreendimentos (Incorporação) — entidade central que possui 1..N obras (projects).
// Hierarquia: Empreendimento → Torres (= obra) → Unidades (pavimento = floor) + Áreas Comuns.

export type EmpreendimentoStatus =
    | 'PLANEJAMENTO' | 'LANCAMENTO' | 'EM_OBRAS' | 'ENTREGUE' | 'ENCERRADO';

export type UnitPositionType = 'FRENTE' | 'LATERAL' | 'FUNDOS';
export type UnitSunOrientation = 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';
export type UnitStatus = 'DISPONIVEL' | 'RESERVADO' | 'PERMUTADO' | 'VENDIDO';
export type CommonAreaCategory = 'LAZER' | 'COMUM' | 'TECNICA' | 'CIRCULACAO' | 'GARAGEM' | 'OUTRO';

export interface Empreendimento {
    id: string;
    organization_id: string;
    name: string;
    code?: string;
    status: EmpreendimentoStatus;

    // Vínculo vivo com o estudo Imovib
    imovib_study_id?: string | null;
    last_synced_at?: string | null;

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

export interface EmpreendimentoUnit {
    id: string;
    tower_id: string;
    imovib_unit_id?: string | null;
    imovib_instance_id?: string | null;
    name: string;
    floor?: number;
    typology?: string;
    private_area?: number;
    common_area?: number;
    total_area?: number;
    bedrooms?: number;
    bathrooms?: number;
    parking_spaces?: number;
    position_type?: UnitPositionType;
    sun_orientation?: UnitSunOrientation;
    price?: number;
    status: UnitStatus;
    is_vendavel?: boolean;
    commercial_property_id?: string | null;
    sort_order?: number;
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
