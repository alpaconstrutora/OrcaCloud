export interface HoldingItem {
    id?: string;
    name: string;
    cota: string;
    invested?: number;
    /** null = sem participação registrada ou sem valor do empreendimento (`utils/investidorCarteira`). */
    equity: number | null;
    /** Por que `equity` é null — mostrado no lugar do valor. */
    semPatrimonio?: string;
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
