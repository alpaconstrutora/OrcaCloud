// services/sync/fieldRegistry.ts
//
// A lista EXPLÍCITA de campos que cada origem propõe ao Empreendimento. É a fonte única do
// que entra no diff — antes isso estava espalhado em três lugares que discordavam entre si:
// `structural` (empreendimentoService:929-941) montava todos os campos sempre, sem comparar;
// `unitFieldsDiffer` (plantaEmpreendimentoSync:142-158) comparava 9; e `buildWriteBackPlan`
// (empreendimentoService:864-868) comparava outros 5.
//
// Regra desta fase (decisão do usuário): SÓ os campos que já correspondem hoje nos dois
// lados. Coluna nova de dado (suites, dormitórios no Imovib, urbanístico) é fase posterior —
// e vai entrar aqui, uma linha por campo, já com curadoria pronta.

import { FieldGroup, SyncEntity, SyncOrigin } from './types';

export interface FieldSpec {
    entity: SyncEntity;
    field: string;
    /** Rótulo PT-BR para a UI. O usuário não deve ler nome de coluna. */
    label: string;
    group: FieldGroup;
    compare: 'exact' | 'numeric';
    /**
     * Tolerância do comparador numérico, em unidade do próprio campo.
     *
     * NÃO é detalhe de implementação: sem ela, ruído de ponto flutuante (25.87 vs
     * 25.870000000000001, de uma subtração de arredondados) marca divergência eterna — o
     * campo reapareceria como conflito a cada sync, para sempre. Esta lição já foi paga duas
     * vezes neste código (plantaEmpreendimentoSync:143-144 e :393).
     */
    tolerance?: number;
    /** O que conta como "vazio" para o balde `fill`. Default: null/undefined/''. */
    isEmpty?: (v: unknown) => boolean;
}

/** Centavo de m² / de real — mesma régua já usada nos dois comparadores antigos. */
const CENT = 0.01;

const AREA = (field: string, label: string): FieldSpec =>
    ({ entity: 'unit', field, label, group: 'area', compare: 'numeric', tolerance: CENT });

/**
 * Campos de unidade comuns às duas origens. Ficam idênticos de propósito: é o mesmo dado
 * no mesmo destino — quem diverge é a origem que o preenche, não a régua.
 */
const UNIT_SHARED: FieldSpec[] = [
    { entity: 'unit', field: 'name', label: 'Nome', group: 'identidade', compare: 'exact' },
    { entity: 'unit', field: 'floor', label: 'Pavimento', group: 'estrutura', compare: 'exact' },
    { entity: 'unit', field: 'typology', label: 'Tipologia', group: 'estrutura', compare: 'exact' },
    AREA('private_area', 'Área privativa'),
    AREA('common_area', 'Área comum'),
    AREA('total_area', 'Área total'),
];

export const SYNC_FIELDS: Record<SyncOrigin, FieldSpec[]> = {
    // ── Viabilidade (Imovib) ─────────────────────────────────────────────────
    // Traz posição/orientação/preço/status (que o Planta IA não tem), mas NÃO tem
    // dormitórios/banheiros/vagas — imovib_unit_instances só tem 11 colunas.
    imovib: [
        { entity: 'tower', field: 'name', label: 'Nome da torre', group: 'identidade', compare: 'exact' },
        { entity: 'tower', field: 'construction_cost_sqm', label: 'Custo de obra por m²', group: 'comercial', compare: 'numeric', tolerance: CENT },
        { entity: 'tower', field: 'sales_price_sqm', label: 'Preço de venda por m²', group: 'comercial', compare: 'numeric', tolerance: CENT },

        ...UNIT_SHARED,
        { entity: 'unit', field: 'position_type', label: 'Posição', group: 'estrutura', compare: 'exact' },
        { entity: 'unit', field: 'sun_orientation', label: 'Orientação solar', group: 'estrutura', compare: 'exact' },

        // Grupo 'comercial': hoje protegidos pela heurística hasLocalCommercial (ver planner).
        // Quando a inbox de curadoria existir, a heurística some e estes viram conflito normal.
        { entity: 'unit', field: 'price', label: 'Preço', group: 'comercial', compare: 'numeric', tolerance: CENT },
        { entity: 'unit', field: 'status', label: 'Status de venda', group: 'comercial', compare: 'exact' },
    ],

    // ── Arquitetura (Planta IA) ──────────────────────────────────────────────
    // Traz dormitórios/banheiros/vagas (que o Imovib não tem), mas NÃO tem posição nem
    // orientação — plant_units não possui essas colunas. As duas arestas são complementares.
    planta_ai: [
        // `name` da torre fica FORA de propósito: o nome do cenário ("Cenário Equilibrado") é
        // rótulo de análise, não nome de torre. Quem renomeia para "Torre C" continua com
        // "Torre C" no sync seguinte. Na criação o nome vem do createOnly (nextTowerName).
        { entity: 'tower', field: 'floors_count', label: 'Pavimentos', group: 'estrutura', compare: 'exact' },
        { entity: 'tower', field: 'units_per_floor', label: 'Unidades por pavimento', group: 'estrutura', compare: 'exact' },
        { entity: 'tower', field: 'construction_cost_sqm', label: 'Custo de obra por m²', group: 'comercial', compare: 'numeric', tolerance: CENT },
        { entity: 'tower', field: 'sales_price_sqm', label: 'Preço de venda por m²', group: 'comercial', compare: 'numeric', tolerance: CENT },

        ...UNIT_SHARED,
        { entity: 'unit', field: 'bedrooms', label: 'Dormitórios', group: 'estrutura', compare: 'exact' },
        { entity: 'unit', field: 'bathrooms', label: 'Banheiros', group: 'estrutura', compare: 'exact' },
        { entity: 'unit', field: 'parking_spaces', label: 'Vagas', group: 'estrutura', compare: 'exact' },
    ],
};

/** Índice (origin → entity → field) → spec. */
const INDEX = new Map<string, FieldSpec>();
for (const [origin, specs] of Object.entries(SYNC_FIELDS)) {
    for (const s of specs) INDEX.set(`${origin}|${s.entity}|${s.field}`, s);
}

export function getFieldSpec(origin: SyncOrigin, entity: SyncEntity, field: string): FieldSpec | undefined {
    return INDEX.get(`${origin}|${entity}|${field}`);
}

export function specsFor(origin: SyncOrigin, entity: SyncEntity): FieldSpec[] {
    return SYNC_FIELDS[origin].filter(s => s.entity === entity);
}
