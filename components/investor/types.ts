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
    /** Retorno total, formatado (utils/investidorCarteira: (recebido + patrimônio − aportado) ÷ aportado). */
    yield?: string;
    progress: number;
    location?: string;
    /** Retorno total em fração (0,12 = 12%). */
    yoc?: number;
    /** Recebido (dividendo + distribuição liquidados). */
    received?: number;
    /** Retorno em caixa, formatado (recebido ÷ aportado). */
    retornoEmCaixa?: string;
    /** De onde vem o patrimônio (a tela diz). */
    origemDoPatrimonio?: string;
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
