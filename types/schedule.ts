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
    plannedTotal: number;
    variation?: number;
    isCritical?: boolean;
    isMilestone?: boolean;
    earlyStart?: string;
    earlyFinish?: string;
    lateStart?: string;
    lateFinish?: string;
    totalFloat?: number;
    level: number;
    color?: string;
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

export interface ItemScheduleDetails {
    id: string;
    startDate?: string;
    endDate?: string;
    duration?: number;
    manualRealPct?: number;
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
