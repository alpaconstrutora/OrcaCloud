// types/empreendimento.ts
// Módulo Empreendimentos (Incorporação) — entidade central que possui 1..N obras (projects).
// Hierarquia: Empreendimento → Torres (= obra) → Unidades (pavimento = floor) + Áreas Comuns.

// EM_OPERACAO vem DEPOIS de ENTREGUE e não é o fim: o edifício entregue passa a ser
// operado (condomínio). ENCERRADO continua sendo outra coisa — incorporação encerrada.
export type EmpreendimentoStatus =
    | 'PLANEJAMENTO' | 'LANCAMENTO' | 'EM_OBRAS' | 'ENTREGUE' | 'EM_OPERACAO' | 'ENCERRADO';

// Antes era um union fixo (VERTICAL/HORIZONTAL/MISTO/COND_LOGISTICO/COND_INDUSTRIAL).
// Agora é o `slug` de um registro em `empreendimento_types` (catálogo gerenciável em
// Configurações do Sistema — ver services/empreendimentoTypeService.ts). Os 5 tipos do
// sistema usam esses mesmos slugs, então dados antigos continuam válidos sem migração.
export type EmpreendimentoTipo = string;

export type FloorTipo =
    | 'SUBSOLO' | 'TERREO' | 'MEZANINO' | 'TIPO' | 'COBERTURA' | 'TECNICO' | 'GARAGEM' | 'OUTRO';

export type UnitPositionType = 'FRENTE' | 'LATERAL' | 'FUNDOS';
export type UnitSunOrientation = 'NORTE' | 'SUL' | 'LESTE' | 'OESTE';
export type UnitViewType = 'SEM_VISTA' | 'PARCIAL' | 'PLENA';
export type UnitStatus = 'DISPONIVEL' | 'RESERVADO' | 'PERMUTADO' | 'VENDIDO';
// Eixo de LOCAÇÃO — separado de UnitStatus (venda) de propósito: uma unidade pode
// estar publicada em Vendas e em Locações ao mesmo tempo, e um status não pode
// sobrescrever o outro. Ver migration 20270815000003.
export type RentalUnitStatus = 'DISPONIVEL' | 'RESERVADO' | 'LOCADO' | 'MANUTENCAO';
export type CommonAreaCategory = 'LAZER' | 'COMUM' | 'TECNICA' | 'CIRCULACAO' | 'GARAGEM' | 'OUTRO';

export interface Empreendimento {
    id: string;
    organization_id: string;
    /** Empresa (companies) dona do empreendimento — define o regime tributário
     *  usado na geração de Tributos a Pagar das Locações dos seus imóveis. */
    company_id?: string | null;
    name: string;
    code?: string;
    status: EmpreendimentoStatus;
    tipo?: EmpreendimentoTipo | null;

    // Vínculo vivo com o estudo Imovib
    imovib_study_id?: string | null;
    last_synced_at?: string | null;

    // Vínculo vivo com o estudo de arquitetura (Planta IA) — direto, sem passar pelo Imovib
    planta_ai_study_id?: string | null;

    // Obra principal (projects.id). Não substitui o vínculo por torre
    // (EmpreendimentoTower.project_id), que é o correto no multi-torre.
    project_id?: string | null;

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

    // Condomínio (ÒPURA Pós-Entrega, F0) — o MESMO edifício depois da entrega.
    // `condominio_cnpj` NÃO é `spe_cnpj`: a SPE incorporou, o condomínio opera. É
    // por aqui que a segregação de caixa se ancora quando o financeiro condominial
    // entrar (dinheiro de condomínio não encosta em razão de construtora).
    condominio_cnpj?: string | null;
    condominio_razao_social?: string | null;
    condominio_instalado_em?: string | null;
    sindico_client_id?: string | null;
    sindico_mandato_inicio?: string | null;
    /** Mandato tem fim, e síndico vencido não representa o condomínio. */
    sindico_mandato_fim?: string | null;

    // Terreno
    terreno_street?: string;
    terreno_number?: string;
    terreno_complement?: string;
    terreno_neighborhood?: string;
    terreno_city?: string;
    terreno_state?: string;
    terreno_zip_code?: string;
    terreno_area?: number;
    // 'Regular (Retangular)' | 'Irregular (Geometria complexa)' — mesmo vocabulário de plant_terrains.terrain_type
    terreno_tipo?: string;
    terreno_frente?: number;
    terreno_fundos?: number;
    terreno_profundidade?: number;
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
    suites?: number;
    parking_spaces?: number;
    position_type?: UnitPositionType | null;
    sun_orientation?: UnitSunOrientation | null;
    view_type?: UnitViewType | null;
    price?: number;                            // VGV / preço de VENDA
    status: UnitStatus;                        // eixo de VENDA
    rental_price?: number;                     // aluguel-alvo mensal (eixo de LOCAÇÃO, não é o VGV)
    rental_status?: RentalUnitStatus;           // eixo de LOCAÇÃO — independente de `status`
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

// ── Ocupações (ÒPURA Pós-Entrega, F0) ────────────────────────────────────────
// Propriedade ≠ ocupação ≠ responsabilidade financeira: três relações distintas
// entre uma pessoa e uma unidade, uma LINHA por papel. Um proprietário pode não
// morar; um morador pode não pagar.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
export type OccupancyRole =
    | 'PROPRIETARIO'            // é dono; pode não morar
    | 'INQUILINO'               // ocupa por locação
    | 'MORADOR'                 // mora sem ser dono nem locatário
    | 'RESPONSAVEL_FINANCEIRO'; // recebe a cobrança do condomínio — único por unidade vigente

export interface UnitOccupancy {
    id: string;
    unit_id: string;
    /** A pessoa é `clients` — herda a dedup por CPF/CNPJ e é a âncora de login do Portal do Condômino. */
    client_id: string;
    /** Herdado do empreendimento pelo trigger `trg_unit_occupancies_org`; nunca vem do seletor do topo. */
    organization_id: string;
    role: OccupancyRole;
    started_at: string;
    /** NULO = vigente. Encerrar não apaga: a ocupação é histórico. */
    ended_at?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

/** `organization_id` sai do insert de propósito: quem decide é o trigger, não a tela. */
export type UnitOccupancyInsert =
    Omit<UnitOccupancy, 'id' | 'organization_id' | 'created_at' | 'updated_at'>;
export type UnitOccupancyUpdate = Partial<Omit<UnitOccupancyInsert, 'unit_id'>>;

/** Ocupação já resolvida com o nome da pessoa e da unidade, para a tabela. */
export interface UnitOccupancyRow extends UnitOccupancy {
    _client_name: string;
    _client_document?: string | null;
    _client_email?: string | null;
    _unit_name: string;
    _tower_name: string;
    _fracao_ideal?: number | null;
}

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

// Mapa Regulatório — mora no empreendimento (fonte única), mostrado/editado também na
// Viabilidade e na Planta (migration 20270218000002). 21 parâmetros urbanísticos por zona.
export interface EmpreendimentoRegulatoryZone {
    id: string;
    empreendimento_id: string;
    organization_id: string;
    macroarea?: string;
    zona?: string;
    ca_minimo?: string;
    ca_basico?: string;
    ca_maximo?: string;
    taxa_ocupacao_maxima?: string;
    taxa_permeabilidade_minima?: string;
    gabarito_altura_maxima?: string;
    uso_permitido?: string;
    recuo_frente?: string;
    recuo_fundos?: string;
    recuo_lateral_direita?: string;
    recuo_lateral_esquerda?: string;
    gabarito_pavimentos?: string;
    regra_vagas?: string;
    vagas_por_unidade?: string;
    area_minima_unidade?: string;
    lei_referencia?: string;
    documento_fonte?: string;
    nivel_confianca?: string;
    observacoes?: string;
    sort_order?: number;
    created_at: string;
    updated_at: string;
}

export type EmpreendimentoRegulatoryZoneInsert = Omit<EmpreendimentoRegulatoryZone, 'id' | 'created_at' | 'updated_at'>;
export type EmpreendimentoRegulatoryZoneUpdate = Partial<EmpreendimentoRegulatoryZoneInsert>;

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

// ── Histórico / trilha de auditoria ─────────────────────────────────────────
// Tabela empreendimento_audit_logs (migration 20270839000000). Imutável: o app
// só insere e lê. Escrita em services/empreendimentoAuditService.ts.

export type EmpreendimentoAuditEntity =
    | 'empreendimento' | 'tower' | 'floor' | 'unit' | 'common_area'
    | 'regulatory_zone' | 'obra_link' | 'area_project' | 'study_link'
    | 'commercial' | 'rental' | 'proposal';

export type EmpreendimentoAuditAction =
    | 'create' | 'update' | 'delete' | 'link' | 'unlink'
    | 'sync' | 'publish' | 'pull' | 'approve' | 'reject' | 'export';

export type EmpreendimentoAuditSource =
    | 'app' | 'sync_imovib' | 'sync_planta' | 'curadoria'
    | 'comercial' | 'locacao' | 'area_engine';

export interface EmpreendimentoAuditLog {
    id: string;
    organization_id: string;
    empreendimento_id: string;
    entity_type: EmpreendimentoAuditEntity;
    entity_id: string | null;
    /** Nome legível no momento do evento — a entidade pode não existir mais. */
    entity_label: string | null;
    action: EmpreendimentoAuditAction;
    /** Preenchido só em 'update': um evento por campo alterado. */
    field_name: string | null;
    old_value: unknown;
    new_value: unknown;
    metadata: Record<string, unknown>;
    reason: string | null;
    source: EmpreendimentoAuditSource;
    user_id: string | null;
    user_email: string | null;
    created_at: string;
}

/** Entrada de escrita. `organization_id` e o usuário são resolvidos pelo service. */
export interface EmpreendimentoAuditInput {
    empreendimentoId: string;
    /** Opcional: se ausente, o service busca (com cache) a org do empreendimento. */
    organizationId?: string | null;
    entityType: EmpreendimentoAuditEntity;
    entityId?: string | null;
    entityLabel?: string | null;
    action: EmpreendimentoAuditAction;
    fieldName?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, unknown>;
    reason?: string | null;
    source?: EmpreendimentoAuditSource;
}
