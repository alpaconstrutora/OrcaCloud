/**
 * Colunas da timeline do cronograma (Planejamento) — Grade, Curva S e Gantt.
 *
 * `buildTimelineColumns` é a geração que morava inline em `FinancialSchedule.tsx`
 * (`timelineColumns`), extraída sem mudar a saída: a Grade, a Curva S e a
 * distribuição por período continuam começando no início do projeto.
 *
 * O Gantt é a exceção (pedido de 10/10/2026: "o time line esta limitado a data de
 * inicio. retirar este bloqueio e permitir navegar por datas anteiores ao inicio").
 * Ele monta as próprias colunas a partir de `ganttTimelineOrigin`, que recua antes
 * do início — e recua mais a cada vez que o usuário chega à borda esquerda.
 * A Grade fica de fora de propósito: cada coluna ali é um período de distribuição
 * (`handleDistributeEvenly` divide 100% pelo número de colunas), então períodos
 * vazios antes do início mudariam o resultado, não só a navegação.
 */

export type TimelineScale = 'day' | 'week' | 'month' | 'year';

export interface TimelineColumn {
    id: string;
    date: Date;
    name: string;
    label: string;
    subLabel: string;
    width: number;
    isToday: boolean;
}

export const TIMELINE_PX_PER_DAY: Record<TimelineScale, number> = {
    day: 40,
    week: 10,
    month: 3,
    year: 0.5,
};

const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_LOOPS = 5000;

function getWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

const labelFormats: Record<TimelineScale, (d: Date) => string> = {
    day: (d) => d.getDate().toString(),
    week: (d) => `Sem ${getWeekNumber(d)} `,
    month: (d) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(d),
    year: (d) => d.getFullYear().toString(),
};

const subLabelFormats: Record<TimelineScale, (d: Date) => string> = {
    day: (d) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).toUpperCase(),
    week: (d) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).toUpperCase(),
    month: (d) => d.getFullYear().toString(),
    year: () => '',
};

/**
 * Colunas de `origin` até `maxDate`, na escala pedida. Semana/mês/ano encaixam a
 * primeira coluna no começo do período que contém `origin` (segunda-feira, dia 1,
 * 1º de janeiro) — por isso quem desenha barras mede a partir de `columns[0].date`,
 * não de `origin`.
 */
export function buildTimelineColumns(
    origin: Date,
    maxDate: Date,
    timeScale: TimelineScale,
    now: Date = new Date(),
): TimelineColumn[] {
    if (isNaN(origin.getTime()) || isNaN(maxDate.getTime())) return [];

    const columns: TimelineColumn[] = [];
    const current = new Date(origin);
    let loopCount = 0;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const pxPerDay = TIMELINE_PX_PER_DAY[timeScale];

    if (timeScale === 'day') {
        while (current <= maxDate && loopCount++ < MAX_LOOPS) {
            columns.push({
                id: current.toISOString().split('T')[0],
                date: new Date(current),
                name: labelFormats.day(current),
                label: labelFormats.day(current),
                subLabel: subLabelFormats.day(current),
                width: pxPerDay,
                isToday: current.getTime() === today.getTime(),
            });
            current.setDate(current.getDate() + 1);
        }
    } else if (timeScale === 'week') {
        const day = current.getDay();
        current.setDate(current.getDate() - day + (day === 0 ? -6 : 1));
        while (current <= maxDate && loopCount++ < MAX_LOOPS) {
            const nextWeek = new Date(current);
            nextWeek.setDate(current.getDate() + 7);
            columns.push({
                id: current.toISOString().split('T')[0],
                date: new Date(current),
                name: labelFormats.week(current),
                label: labelFormats.week(current).toUpperCase(),
                subLabel: subLabelFormats.week(current),
                width: pxPerDay * 7,
                isToday: today >= current && today < nextWeek,
            });
            current.setDate(current.getDate() + 7);
        }
    } else if (timeScale === 'month') {
        current.setDate(1);
        while (current <= maxDate && loopCount++ < MAX_LOOPS) {
            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);
            const daysInMonth = Math.round((nextMonth.getTime() - current.getTime()) / DAY_MS);
            columns.push({
                id: current.toISOString().split('T')[0],
                date: new Date(current),
                name: labelFormats.month(current),
                label: labelFormats.month(current).split(' ')[0].toUpperCase(),
                subLabel: subLabelFormats.month(current),
                width: pxPerDay * daysInMonth,
                isToday: today >= current && today < nextMonth,
            });
            current.setMonth(current.getMonth() + 1);
        }
    } else {
        current.setMonth(0, 1);
        while (current <= maxDate && loopCount++ < MAX_LOOPS) {
            const nextYear = new Date(current);
            nextYear.setFullYear(current.getFullYear() + 1);
            const daysInYear = Math.round((nextYear.getTime() - current.getTime()) / DAY_MS);
            columns.push({
                id: current.toISOString().split('T')[0],
                date: new Date(current),
                name: labelFormats.year(current),
                label: labelFormats.year(current),
                subLabel: '',
                width: pxPerDay * daysInYear,
                isToday: today >= current && today < nextYear,
            });
            current.setFullYear(current.getFullYear() + 1);
        }
    }

    return columns;
}

/**
 * Quanto o Gantt recua antes do início, por escala: o que aparece de saída (1 passo)
 * e o que cada chegada à borda esquerda acrescenta (+1 passo). O passo é largo o
 * bastante para render ~1 tela de rolagem em cada escala; o teto segura o número de
 * colunas (escala dia: 24 meses ≈ 730 colunas a mais).
 */
export const GANTT_LEAD_STEP_MONTHS: Record<TimelineScale, number> = {
    day: 1,
    week: 3,
    month: 12,
    year: 36,
};

export const GANTT_LEAD_MAX_STEPS: Record<TimelineScale, number> = {
    day: 24,
    week: 20,
    month: 10,
    year: 5,
};

/**
 * Data em que o Gantt abre: o início do projeto ou, se alguma tarefa começa antes
 * dele, essa tarefa — é o ponto que antes ficava colado na borda esquerda.
 */
export function ganttAnchorDate(projectStart: Date, taskStarts: Array<string | undefined>): Date {
    let anchor = projectStart.getTime();
    for (const s of taskStarts) {
        if (!s) continue;
        const t = new Date(s).getTime();
        if (!isNaN(t) && t < anchor) anchor = t;
    }
    return new Date(anchor);
}

/** Primeira data da timeline do Gantt: a âncora recuada `leadSteps` passos. */
export function ganttTimelineOrigin(anchor: Date, timeScale: TimelineScale, leadSteps: number): Date {
    const steps = Math.max(1, Math.min(leadSteps, GANTT_LEAD_MAX_STEPS[timeScale]));
    const origin = new Date(anchor);
    origin.setMonth(origin.getMonth() - GANTT_LEAD_STEP_MONTHS[timeScale] * steps);
    return origin;
}
