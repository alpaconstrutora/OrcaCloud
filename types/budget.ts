export enum ProjectPhase {
    PARAMETRIC = 'PARAMETRIC',
    ANALYTIC = 'ANALYTIC',
    DASHBOARD = 'DASHBOARD'
}

export enum SinapiType {
    COMPOSITION = 'COMPOSITION',
    INPUT = 'INPUT',
    SERVICE = 'SERVICE'
}

export enum SinapiCategory {
    MAO_DE_OBRA = 'Mão de Obra',
    MATERIAL = 'Material',
    EQUIPAMENTO = 'Equipamento'
}

export interface CompositionComponent {
    code: string;
    description: string;
    unit: string;
    price: number;
    type: SinapiType;
    quantity: number;
    category?: SinapiCategory | string;
}

export interface SinapiItem {
    code: string;
    description: string;
    unit: string;
    price: number;
    type: SinapiType;
    category: string;
    nature?: SinapiCategory;
    composition?: CompositionComponent[];
    isOverride?: boolean;
    source?: 'SINAPI' | 'Própria';
    database_id?: string;
    isFavorite?: boolean;
}

export interface CustomDatabase {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at?: string;
}

export interface BudgetEntry {
    id: string;
    sinapiItem: SinapiItem;
    quantity: number;
    phase: string;
    subPhase?: string;
    group: string;
    bdi?: number;
    isFavorite?: boolean;
}

export interface WBSPhase {
    id: string;
    name: string;
    subPhases: string[];
}

export interface WBSGroup {
    id: string;
    name: string;
    phases: WBSPhase[];
}
