import { BudgetEntry } from "./budget";
import { ResourceAllocation } from "./resources";

export enum DependencyType {
    FS = 'FS',
    SS = 'SS',
    FF = 'FF',
    SF = 'SF'
}

export enum ConstraintType {
    SNET = 'SNET',
    SNLT = 'SNLT',
    FNET = 'FNET',
    FNLT = 'FNLT',
    MSO = 'MSO',
    MFO = 'MFO',
    ASAP = 'ASAP',
    ALAP = 'ALAP'
}

export enum ReplanMode {
    CURRENT_DATE = 'CURRENT_DATE',
    AFFECTED_TASK = 'AFFECTED_TASK',
    FIXED_MILESTONES = 'FIXED_MILESTONES'
}

/**
 * Natureza da tarefa — dimensão semântica (domínio/módulo), ortogonal ao tipo estrutural.
 * Metadado: dirige cor/badge/filtro e (em fases futuras) a integração com os módulos
 * (Compra→Procurement, Aprovação→Governance, etc.). Ver PLANO_MODULO_TIPOS_NATUREZA_TAREFAS.md.
 */
export enum TaskNature {
    PRODUCAO = 'PRODUCAO',
    COMPRA = 'COMPRA',
    CONTRATACAO = 'CONTRATACAO',
    APROVACAO = 'APROVACAO',
    INSPECAO = 'INSPECAO',
    SEGURANCA = 'SEGURANCA',
    QUALIDADE = 'QUALIDADE',
    FINANCEIRO = 'FINANCEIRO',
    BIM = 'BIM',
    DOCUMENTACAO = 'DOCUMENTACAO',
    RH = 'RH',
    MANUTENCAO = 'MANUTENCAO',
}

/**
 * Explicit schedule outline (WBS) node. When `ProjectSchedule.outline` is present it
 * becomes the source of truth for structure/order, decoupling the hierarchy from the
 * budget-derived string grouping. See buildHierarchy in FinancialSchedule.
 */
export interface OutlineNode {
    id: string;                  // node id; for type 'item' this equals the BudgetEntry.id
    type: 'group' | 'phase' | 'subphase' | 'item' | 'activity';
    name: string;                // display name; for 'item' falls back to the budget description
    budgetItemId?: string;       // set on type 'item' (cost-backed) → references BudgetEntry.id
    nature?: TaskNature;         // semantic domain (leaves only); drives color/badge/filter/integrations
    children?: OutlineNode[];
}

export interface HierarchyNode {
    id: string;
    uid: string;
    type: 'group' | 'phase' | 'subphase' | 'item';
    name: string;
    children: HierarchyNode[];
    data?: BudgetEntry;
    schedule?: ItemScheduleDetails;
    total: number;
    realizedTotal: number;
    budgetedTotal: number;
    budgetedWithBdiTotal: number;
    plannedTotal: number;
    variation?: number;
    isCritical?: boolean;
    isMilestone?: boolean;
    earlyStart?: string;
    earlyFinish?: string;
    lateStart?: string;
    lateFinish?: string;
    totalFloat?: number;
    nature?: TaskNature;
    inactive?: boolean;
    level: number;
    color?: string;
    wbsCode?: string;
}

export interface Baseline {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    itemDates: Record<string, { startDate: string; endDate: string }>;
}

export interface ScheduleHistoryEntry {
    id: string;
    timestamp: string;
    action: string;
    changes: {
        itemId: string;
        field: string;
        oldValue: string | number | boolean | null | undefined;
        newValue: string | number | boolean | null | undefined;
        }[];
}

export interface Predecessor {
    id: string;
    type: DependencyType;
    lag: number;
}

export interface SchedulePeriod {
    id: string;
    name: string;
    date: string;
}

export interface ItemDistribution {
    itemId: string;
    periodId: string;
    percentage: number;
    value: number;
}

export interface EapLocation {
    bloco?: string;
    pavimento?: string;
    ambiente?: string;
    disciplina?: string;
}

export interface EapNode {
    key: string;          // unique path: "bloco|pavimento|ambiente"
    label: string;
    level: 'bloco' | 'pavimento' | 'ambiente' | 'disciplina' | 'unassigned';
    children: EapNode[];
    itemIds: string[];    // leaf schedule item IDs at this node
    completionPct: number;
    budgetedTotal: number;
    startDate?: string;
    endDate?: string;
}

export interface ItemScheduleDetails {
    id: string;
    startDate?: string;
    endDate?: string;
    duration?: number;
    manualRealPct?: number;
    phase?: string;            // propagado de BudgetEntry.phase na criação (ver ensureFullScheduleList)
    subPhase?: string;         // propagado de BudgetEntry.subPhase
    predecessors?: Predecessor[];
    earlyStart?: string;
    earlyFinish?: string;
    lateStart?: string;
    lateFinish?: string;
    totalFloat?: number;
    isCritical?: boolean;
    isMilestone?: boolean;
    slack?: number;
    constraintType?: ConstraintType;
    constraintDate?: string;
    slippage?: number;
    spi?: number;
    allocations?: ResourceAllocation[];
    budgetedValue?: number;
    plannedValue?: number;
    actualValue?: number;
    costVariation?: number;
    totalLaborCost?: number;
    totalManHours?: number;
    crewMainWorkers?: number;
    crewHelpers?: number;
    helperFactor?: number;
    effortCoefficient?: number;
    hoursPerDay?: number;
    efficiencyFactor?: number;
    mainWorkerProd?: number;
    helperProd?: number;
    autoDuration?: boolean;
    inactive?: boolean;        // tarefa suspensa: ignorada pelo motor (CPM/duração/curva S)
    location?: EapLocation;
}

export interface LevelingIssue {
    itemId: string;
    itemName: string;
    resourceId: string;
    resourceName: string;
    required: number;
    capacity: number;
    type: 'SINGLE_TASK_OVER_CAPACITY' | 'TOTAL_OVER_CAPACITY';
}

export interface LevelingResult {
    leveledSchedules: ItemScheduleDetails[];
    issues: LevelingIssue[];
    iterations: number;
}
