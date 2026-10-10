import { describe, it, expect } from 'vitest';
import {
    buildTimelineColumns,
    ganttAnchorDate,
    ganttTimelineOrigin,
    GANTT_LEAD_MAX_STEPS,
    GANTT_LEAD_STEP_MONTHS,
} from '../utils/scheduleTimeline';

// Datas locais (sem fuso) para o teste não depender do TZ da máquina.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('buildTimelineColumns', () => {
    it('escala dia: uma coluna por dia, de origin até maxDate inclusive', () => {
        const cols = buildTimelineColumns(d(2026, 3, 10), d(2026, 3, 14), 'day', d(2026, 3, 12));
        expect(cols).toHaveLength(5);
        expect(cols[0].date).toEqual(d(2026, 3, 10));
        expect(cols.map(c => c.isToday)).toEqual([false, false, true, false, false]);
        expect(cols.every(c => c.width === 40)).toBe(true);
    });

    it('escala semana encaixa a 1ª coluna na segunda-feira', () => {
        // 12/03/2026 é quinta-feira → semana começa na segunda 09/03.
        const cols = buildTimelineColumns(d(2026, 3, 12), d(2026, 4, 1), 'week');
        expect(cols[0].date).toEqual(d(2026, 3, 9));
        expect(cols[0].date.getDay()).toBe(1);
        expect(cols.every(c => c.width === 70)).toBe(true);
    });

    it('escala mês encaixa no dia 1 e a largura acompanha os dias do mês', () => {
        const cols = buildTimelineColumns(d(2026, 2, 15), d(2026, 4, 20), 'month');
        expect(cols.map(c => c.date)).toEqual([d(2026, 2, 1), d(2026, 3, 1), d(2026, 4, 1)]);
        expect(cols[0].width).toBe(28 * 3);
        expect(cols[1].width).toBe(31 * 3);
    });

    it('escala ano encaixa em 1º de janeiro', () => {
        const cols = buildTimelineColumns(d(2026, 7, 1), d(2028, 2, 1), 'year');
        expect(cols.map(c => c.date.getFullYear())).toEqual([2026, 2027, 2028]);
        expect(cols[0].date).toEqual(d(2026, 1, 1));
    });

    it('data inválida devolve vazio (a tela mostra "Erro ao gerar planejamento")', () => {
        expect(buildTimelineColumns(new Date('x'), d(2026, 1, 1), 'day')).toEqual([]);
    });
});

describe('Gantt antes do início do projeto', () => {
    const inicio = d(2026, 6, 15);

    it('âncora é o início, ou a tarefa que começa antes dele', () => {
        expect(ganttAnchorDate(inicio, [undefined, '2026-08-01'])).toEqual(inicio);
        const antes = ganttAnchorDate(inicio, ['2026-08-01', '2026-05-02']);
        expect(antes.getTime()).toBe(new Date('2026-05-02').getTime());
    });

    it('origem recua um passo por escala e mais um a cada chegada à borda', () => {
        expect(ganttTimelineOrigin(inicio, 'day', 1)).toEqual(d(2026, 5, 15));
        expect(ganttTimelineOrigin(inicio, 'day', 3)).toEqual(d(2026, 3, 15));
        expect(ganttTimelineOrigin(inicio, 'month', 1)).toEqual(d(2025, 6, 15));
    });

    it('a timeline do Gantt passa a ter colunas ANTES do início, que fica dentro dela', () => {
        for (const scale of ['day', 'week', 'month', 'year'] as const) {
            const cols = buildTimelineColumns(ganttTimelineOrigin(inicio, scale, 1), d(2027, 12, 31), scale);
            expect(cols[0].date.getTime()).toBeLessThan(inicio.getTime());
            expect(cols[cols.length - 1].date.getTime()).toBeGreaterThan(inicio.getTime());
        }
    });

    it('recuo tem teto (e nunca é menor que 1 passo)', () => {
        const max = GANTT_LEAD_MAX_STEPS.day;
        expect(ganttTimelineOrigin(inicio, 'day', max + 50)).toEqual(ganttTimelineOrigin(inicio, 'day', max));
        expect(ganttTimelineOrigin(inicio, 'day', 0)).toEqual(ganttTimelineOrigin(inicio, 'day', 1));
        // Escala dia no teto: cabe no limite de colunas do gerador com folga para o projeto.
        const recuoDias = GANTT_LEAD_STEP_MONTHS.day * max * 31;
        expect(recuoDias).toBeLessThan(5000 - 3 * 365);
    });
});
