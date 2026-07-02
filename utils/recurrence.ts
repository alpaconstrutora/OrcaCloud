/**
 * Tarefas recorrentes (PLANO_MODULO_PLANEJAMENTO_GAPS.md #5a): gera as datas de início
 * das N ocorrências de uma atividade recorrente, materializadas como tarefas normais no
 * outline (não são resolvidas em tempo real pelo motor — cada ocorrência é uma tarefa
 * independente, editável e removível como qualquer outra).
 */

export interface RecurrenceRule {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number; // a cada N dias/semanas/meses
    count: number;    // número de ocorrências (inclui a primeira)
}

function isWorkingDay(date: Date, workDays: number[], holidays: Set<string>): boolean {
    if (!workDays.includes(date.getUTCDay())) return false;
    if (holidays.has(date.toISOString().split('T')[0])) return false;
    return true;
}

/** Avança para o próximo dia útil (inclusive) — usado para não iniciar em fim de semana/feriado. */
function snapToWorkingDay(date: Date, workDays: number[], holidays: Set<string>): Date {
    const d = new Date(date);
    let guard = 0;
    while (!isWorkingDay(d, workDays, holidays) && guard < 366) {
        d.setUTCDate(d.getUTCDate() + 1);
        guard++;
    }
    return d;
}

/**
 * Gera as datas de início (ISO 'YYYY-MM-DD') de cada ocorrência, a partir de `startDate`.
 * A primeira ocorrência é sempre `startDate` (ajustada para o próximo dia útil, se necessário);
 * as demais somam o intervalo e são igualmente ajustadas.
 */
export function expandRecurrenceDates(
    startDate: string,
    rule: RecurrenceRule,
    workDays: number[] = [1, 2, 3, 4, 5],
    holidays: string[] = []
): string[] {
    const holidaySet = new Set(holidays);
    const count = Math.max(1, Math.min(365, Math.floor(rule.count) || 1));
    const interval = Math.max(1, Math.floor(rule.interval) || 1);

    const dates: string[] = [];
    let curr = snapToWorkingDay(new Date(`${startDate}T00:00:00Z`), workDays, holidaySet);

    for (let i = 0; i < count; i++) {
        dates.push(curr.toISOString().split('T')[0]);

        const next = new Date(curr);
        if (rule.frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + interval);
        else if (rule.frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + interval * 7);
        else next.setUTCMonth(next.getUTCMonth() + interval);

        curr = snapToWorkingDay(next, workDays, holidaySet);
    }

    return dates;
}
