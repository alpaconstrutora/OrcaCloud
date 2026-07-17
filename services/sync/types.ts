// services/sync/types.ts
//
// Vocabulário único da sincronização com o Empreendimento — o "centro da verdade".
//
// Antes deste pacote existiam DOIS `SyncContext`/`SyncPlan`/`UnitPlan` homônimos e
// incompatíveis (empreendimentoService.ts e plantaEmpreendimentoSync.ts), cada um com sua
// própria noção de plano. Eles não se unificam pelo CONTEXTO — o do Imovib carrega
// `instances` + `study.blocks`, o do Planta IA carrega unidades materializadas por cenário;
// são coisas genuinamente diferentes. O que se unifica é o PRODUTO: cada adapter normaliza
// a sua origem para um `CanonicalSide`, e daí para baixo existe um planner só.
//
// A taxonomia de baldes espelha divergenceService.ts (Conciliação): em vez de um "update"
// indiferenciado, toda diferença cai em exatamente um balde.

import {
    Empreendimento, EmpreendimentoTower, EmpreendimentoUnit, EmpreendimentoCommonArea,
    EmpreendimentoTowerInsert, EmpreendimentoUnitInsert, EmpreendimentoCommonAreaInsert,
} from '../../types/empreendimento';

export type SyncOrigin = 'imovib' | 'planta_ai';
export type SyncEntity = 'empreendimento' | 'tower' | 'unit' | 'common_area';
export type FieldGroup = 'identidade' | 'estrutura' | 'area' | 'comercial';

/**
 * Os três baldes. `same` é o quarto resultado possível da classificação, mas nunca vira
 * `FieldChange` — é justamente o que o mecanismo antigo não sabia reconhecer.
 *
 *   create   — existe na origem, não no destino          → aplica direto
 *   fill     — existe no destino, mas o campo está vazio → aplica direto
 *   conflict — existe nos dois e difere além da tolerância → decisão humana (F1+)
 */
export type ChangeKind = 'fill' | 'conflict';

/** Uma diferença de UM campo de UMA entidade. É a unidade de decisão do usuário. */
export interface FieldChange {
    entity: SyncEntity;
    entityId: string;
    field: string;
    /** Rótulo em PT-BR para a UI — vem do registry, não do nome da coluna. */
    label: string;
    group: FieldGroup;
    kind: ChangeKind;
    origin: SyncOrigin;
    /** Valor atual no Empreendimento (o "de"). */
    from: unknown;
    /** Valor vindo da origem (o "para"). */
    to: unknown;
    /** Rastro da origem: {block_id|scenario_id, instance_id|plant_unit_id}. */
    sourceRef: Record<string, string>;
}

/** Torre nova + as unidades que nascem com ela. */
export interface TowerCreate {
    sourceId: string;
    insert: EmpreendimentoTowerInsert;
    units: Omit<EmpreendimentoUnitInsert, 'tower_id'>[];
}

/** Unidade nova numa torre que já existe. */
export interface UnitCreate {
    towerId: string;
    insert: Omit<EmpreendimentoUnitInsert, 'tower_id'>;
}

/**
 * O plano é o contrato entre preview e apply. `applyPlan` recebe ESTE objeto — nunca um id —
 * para que o que foi revisado seja exatamente o que é escrito. Antes, `previewSync` e
 * `syncFromStudy` recarregavam o contexto e recalculavam o plano independentemente: o
 * usuário confirmava um número e o apply escrevia outro (TOCTOU real).
 */
/**
 * Uma entidade existente no Empreendimento que estava SEM vínculo e foi casada por nome com
 * uma entidade da origem. `applyPlan` grava a coluna de proveniência (PROVENANCE[origin]) —
 * daí em diante ela é reconhecida pelo sync e não duplica mais. É o remédio do bug em que uma
 * torre criada à mão gerava uma torre-fantasma a cada sincronização.
 */
export interface Adoption {
    entity: 'tower' | 'unit';
    existingId: string;
    sourceId: string;
}

export interface SyncPlan {
    empreendimentoId: string;
    origin: SyncOrigin;
    builtAt: string;
    towerCreates: TowerCreate[];
    unitCreates: UnitCreate[];
    commonAreaCreates: EmpreendimentoCommonAreaInsert[];
    adoptions: Adoption[];
    fills: FieldChange[];
    conflicts: FieldChange[];
    /** Proveniência que sumiu da origem. Reportados, NUNCA auto-deletados. */
    orphanTowers: EmpreendimentoTower[];
    orphanUnits: EmpreendimentoUnit[];
    /** Unidades cujo estado comercial local foi preservado (ver fieldRegistry, grupo 'comercial'). */
    preservedUnitNames: string[];
    warnings: string[];
}

export interface SyncApplyResult {
    towersCreated: number;
    unitsCreated: number;
    fieldsApplied: number;
    commonAreasCreated: number;
}

// ── Lado canônico (produto dos adapters) ─────────────────────────────────────

export interface CanonicalUnit {
    /** id na origem: imovib_unit_instances.id | plant_units.id */
    sourceId: string;
    /** Campos que participam do diff (chaves = FieldSpec.field do registry). */
    fields: Record<string, unknown>;
    /** Campos escritos só na CRIAÇÃO e nunca mais (ex: preço-semente do Planta IA). */
    createOnly: Record<string, unknown>;
}

export interface CanonicalTower {
    /** id na origem: imovib_blocks.id | plant_scenarios.id */
    sourceId: string;
    /**
     * Nome pelo qual esta torre pode ser ADOTADA por uma torre existente sem proveniência
     * (casamento por nome, ver planner). Só a aresta Imovib preenche: o bloco tem um nome que
     * o usuário reconhece ("Torre A"). O cenário do Planta vira "Torre X" local, então não
     * casa por nome — fica undefined.
     */
    matchName?: string;
    fields: Record<string, unknown>;
    createOnly: Record<string, unknown>;
    units: CanonicalUnit[];
    /**
     * A linha crua da origem (imovib_blocks | plant_scenarios). O planner NÃO lê isto — ele
     * só conhece `fields`. Existe para a escrita reversa, que precisa comparar contra os
     * agregados da origem (ex: plant_scenarios.total_private_area), e não contra a projeção
     * canônica. Tipado `unknown` de propósito: só quem sabe a origem faz o cast.
     */
    sourceRaw?: unknown;
    /**
     * Imovib sem espelho de vendas: expandir as tipologias vendáveis em unidades.
     * Só vale se a torre ainda não tiver unidade nenhuma — por isso a decisão é do planner
     * (que conhece o destino), não do adapter (que só conhece a origem).
     */
    typologyFallback?: {
        units: Omit<EmpreendimentoUnitInsert, 'tower_id'>[];
        warning: string;
        /** Aviso alternativo quando a torre JÁ tem unidades e o fallback é descartado. */
        warningIfHasUnits: string;
    };
}

/** O que o adapter entrega: a origem normalizada, sem saber nada do destino. */
export interface CanonicalSide {
    origin: SyncOrigin;
    empreendimento: Empreendimento;
    towers: CanonicalTower[];
    /** Candidatas a área comum (Imovib: tipologias com is_vendavel=false). */
    commonAreaCandidates: EmpreendimentoCommonAreaInsert[];
    /** Todos os sourceIds vivos na origem — para detectar órfãos no destino. */
    liveTowerSourceIds: Set<string>;
    liveUnitSourceIds: Set<string>;
    warnings: string[];
}

/** O estado atual do Empreendimento. */
export interface TargetState {
    towers: EmpreendimentoTower[];
    units: EmpreendimentoUnit[];
    commonAreas: EmpreendimentoCommonArea[];
}

/**
 * Colunas de proveniência por origem. São as mesmas que já existem no schema desde
 * 20261228000000 (imovib_*) e 20270209000000 (planta_ai_*) — todas sem FK, de propósito
 * (evita cascade delete e permite órfão).
 */
export const PROVENANCE: Record<SyncOrigin, {
    towerKey: 'imovib_block_id' | 'planta_ai_scenario_id';
    unitKey: 'imovib_instance_id' | 'planta_ai_unit_id';
}> = {
    imovib: { towerKey: 'imovib_block_id', unitKey: 'imovib_instance_id' },
    planta_ai: { towerKey: 'planta_ai_scenario_id', unitKey: 'planta_ai_unit_id' },
};

export const ORIGIN_LABEL: Record<SyncOrigin, string> = {
    imovib: 'Viabilidade',
    planta_ai: 'Arquitetura',
};
