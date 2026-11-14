export interface WeatherShift {
    turn: 'Manhã' | 'Tarde' | 'Noite';
    weather: 'Claro' | 'Nublado' | 'Chuvoso';
    condition: 'Praticável' | 'Impraticável';
}

export interface DiaryActivity {
    itemId: string;
    description: string;
    plannedQty: number;
    realizedQty: number;
    evolution: number;
    comment?: string;
    status: 'Em Andamento' | 'Finalizada' | 'Parada';
    /**
     * Executada fora do cronograma. Marcação explícita: sem `itemId` NÃO quer
     * dizer não prevista (o app mobile não vincula). Não prevista nunca tem
     * `itemId` e nunca alimenta o cronograma — ver `utils/diaryActivities.ts`.
     */
    unplanned?: boolean;
}

export interface LaborEntry {
    category: string;
    quantity: number;
    hours?: number;
    observations?: string;
}

export interface DiaryEntry {
    id: string;
    date: string;
    weather: string;
    weatherShifts?: WeatherShift[];
    activities?: DiaryActivity[];
    labor?: LaborEntry[];
    description: string;
    images: string[];
    videos?: string[];
    documents?: { name: string; url: string; type?: string }[];
    impediments?: string;
    temperature?: string;
    status?: 'Rascunho' | 'Em Análise' | 'Aprovado' | 'Recusado';
    /**
     * Autoria, carimbada pelo BANCO (`_diary_upsert_core`,
     * aplicar_20271113300000) — o que o cliente mandar nestes campos é
     * descartado. `registradoPor` só na criação (registro antigo pode não ter);
     * `editadoPor` a cada edição. Interno: o Portal do Cliente não recebe.
     */
    registradoPor?: DiaryAutor;
    editadoPor?: DiaryAutor;
}

/** Quem gravou: `id` = usuário, `nome` = nome exibido, `em` = ISO (UTC). */
export interface DiaryAutor {
    id: string;
    nome: string | null;
    em: string;
}
