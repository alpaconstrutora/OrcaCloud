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
}
