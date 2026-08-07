/**
 * Matemática de vacância — pura, sem I/O, para poder ser testada.
 *
 * Lê o log de `commercial_property_status_events` (Fase 1 do plano
 * docs/planos/2026-08-06-kpis-locacao-primitivas.md) e responde a pergunta que
 * hoje não tem resposta: "há quantos dias esta unidade está vaga".
 *
 * Mora aqui, e não dentro do serviço, pela mesma razão que `rentalPortfolio`:
 * fórmula no ponto de uso vira cópia divergente na próxima tela.
 */

export interface StatusEvent {
    property_id: string;
    from_status: string | null;
    to_status: string;
    /** ISO completo (timestamptz). É a data do EVENTO, nunca `created_at`. */
    changed_at: string;
    source: string;
}

/**
 * Status em que a unidade está **vaga e comercializável**.
 *
 * `MAINTENANCE` fica de fora de propósito: o imóvel em reforma está
 * indisponível, não à espera de locatário. Misturar os dois inflaria os dias de
 * vacância com tempo de obra e esconderia o indicador que o catálogo chama de
 * "tempo de preparação da unidade" — são coisas que se resolvem com decisões
 * diferentes (preço/divulgação × cronograma de reforma).
 */
export const VACANT_STATUSES = ['AVAILABLE'] as const;

/** Indisponível para locação: reforma, bloqueio. Conta separado. */
export const UNAVAILABLE_STATUSES = ['MAINTENANCE'] as const;

export interface VacancySnapshot {
    propertyId: string;
    status: string;
    /** ISO de quando entrou no status atual. */
    since: string;
    days: number;
    /**
     * O marco veio do backfill, então é aproximado: `changed_at` recebeu o
     * `updated_at` do imóvel (última alteração de QUALQUER campo), não a data
     * real da mudança de status. Nos primeiros meses é um piso, não a verdade.
     */
    approximate: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Estado atual de cada unidade, a partir do último evento de cada uma.
 *
 * Empate de `changed_at` é desempatado pela ordem de chegada — a consulta já
 * traz ordenado, e dois eventos no mesmo instante para a mesma unidade só
 * acontecem em importação.
 */
export const latestEventByProperty = (events: StatusEvent[]): Map<string, StatusEvent> => {
    const latest = new Map<string, StatusEvent>();
    for (const event of events) {
        const current = latest.get(event.property_id);
        if (!current || new Date(event.changed_at).getTime() >= new Date(current.changed_at).getTime()) {
            latest.set(event.property_id, event);
        }
    }
    return latest;
};

/**
 * Quantos dias cada unidade está no status atual.
 *
 * `now` é injetado em vez de lido de dentro para a conta ser testável e para
 * duas chamadas no mesmo render não divergirem na virada do dia.
 */
export const snapshotsFrom = (events: StatusEvent[], now: Date = new Date()): VacancySnapshot[] => {
    const snapshots: VacancySnapshot[] = [];
    for (const event of latestEventByProperty(events).values()) {
        const since = new Date(event.changed_at).getTime();
        if (Number.isNaN(since)) continue;
        // `floor` e não `round`: "vago há 1 dia" só depois de 24h completas.
        // Evento com data futura (fuso torto na importação) vira 0, nunca negativo.
        const days = Math.max(0, Math.floor((now.getTime() - since) / MS_PER_DAY));
        snapshots.push({
            propertyId: event.property_id,
            status: event.to_status,
            since: event.changed_at,
            days,
            approximate: event.source === 'BACKFILL',
        });
    }
    return snapshots;
};

export const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

export interface VacancyStats {
    /** Unidades vagas agora. */
    vacantCount: number;
    averageDays: number;
    medianDays: number;
    over30: number;
    over60: number;
    over90: number;
    /** Estoque envelhecido — o corte que o catálogo trata como crítico. */
    over180: number;
    /** Unidades indisponíveis (em reforma), fora da conta de vacância. */
    unavailableCount: number;
    /**
     * Quantas das vagas ainda dependem do marco aproximado do backfill. Enquanto
     * for alto, os dias médios são um piso — a tela precisa dizer isso, senão o
     * número passa por medição exata.
     */
    approximateCount: number;
}

export const vacancyStats = (
    events: StatusEvent[],
    now: Date = new Date()
): VacancyStats => {
    const snapshots = snapshotsFrom(events, now);
    const vacant = snapshots.filter(s => (VACANT_STATUSES as readonly string[]).includes(s.status));
    const days = vacant.map(s => s.days);
    const total = days.reduce((sum, d) => sum + d, 0);

    return {
        vacantCount: vacant.length,
        averageDays: vacant.length > 0 ? Math.round(total / vacant.length) : 0,
        medianDays: Math.round(median(days)),
        over30: days.filter(d => d > 30).length,
        over60: days.filter(d => d > 60).length,
        over90: days.filter(d => d > 90).length,
        over180: days.filter(d => d > 180).length,
        unavailableCount: snapshots.filter(
            s => (UNAVAILABLE_STATUSES as readonly string[]).includes(s.status)
        ).length,
        approximateCount: vacant.filter(s => s.approximate).length,
    };
};

/**
 * Absorção líquida no período: quantas unidades foram alugadas menos quantas
 * foram desocupadas. Positivo = a carteira ganhou ocupação.
 *
 * Conta TRANSIÇÕES, não estados — por isso ignora o backfill, que não é
 * transição (não tem `from_status`) e faria toda unidade já alugada parecer uma
 * locação nova na data do backfill.
 */
export const netAbsorption = (
    events: StatusEvent[],
    from: Date,
    to: Date
): { rented: number; vacated: number; net: number } => {
    let rented = 0;
    let vacated = 0;

    for (const event of events) {
        if (event.source === 'BACKFILL' || event.from_status == null) continue;
        const at = new Date(event.changed_at).getTime();
        if (Number.isNaN(at) || at < from.getTime() || at > to.getTime()) continue;

        const wasVacant = (VACANT_STATUSES as readonly string[]).includes(event.from_status);
        const isVacant = (VACANT_STATUSES as readonly string[]).includes(event.to_status);

        if (event.to_status === 'RENTED' && event.from_status !== 'RENTED') rented++;
        else if (event.from_status === 'RENTED' && isVacant && !wasVacant) vacated++;
    }

    return { rented, vacated, net: rented - vacated };
};
