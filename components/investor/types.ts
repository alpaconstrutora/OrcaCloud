export interface HoldingItem {
    id?: string;
    name: string;
    cota: string;
    invested?: number;
    equity: string | number;
    currentValue?: number;
    status: string;
    yield?: string;
    progress: number;
    location?: string;
    yoc?: number;
}

export interface HistoricalPoint {
    month: string;
    yield: number;
    percent: number;
    selic?: number;
    ipca?: number;
    igpm?: number;
    formatted?: string;
}
