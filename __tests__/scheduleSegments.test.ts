/**
 * Split de tarefa (PLANO_MODULO_PLANEJAMENTO_GAPS.md #5b): o gap entre trechos estende
 * o intervalo início→fim (comportamento MS Project), sem alterar o trabalho (duration).
 */
import { describe, it, expect } from 'vitest';
import { SchedulingEngine } from '../utils/schedulingEngine';
import { ItemScheduleDetails } from '../types';
import { splitTask, mergeSegments, totalWorkDays, applySplitToTask, removeSplitFromTask } from '../utils/scheduleSegments';

describe('effectiveSpan / motor com tarefas divididas', () => {
    it('gap estende o término, mas o trabalho (duration) permanece', () => {
        // 2 dias de trabalho + 3 de pausa + 1 de trabalho = span 6; trabalho = 3.
        const split: ItemScheduleDetails = {
            id: 't1', duration: 3,
            segments: [{ workDays: 2, gapAfter: 3 }, { workDays: 1, gapAfter: 0 }],
        };
        const contig: ItemScheduleDetails = { id: 't2', duration: 3 };

        const result = SchedulingEngine.calculate([split, contig], '2025-01-06', undefined, true);
        const t1 = result.find(t => t.id === 't1')!;
        const t2 = result.find(t => t.id === 't2')!;

        expect(SchedulingEngine.getEffectiveSpan(split)).toBe(6);
        // t1 (dividida): seg 06 + span 6 dias úteis = 14/01
        expect(t1.earlyFinish).toBe('2025-01-14');
        // t2 (contígua, mesma duração 3): termina 09/01
        expect(t2.earlyFinish).toBe('2025-01-09');
    });

    it('sucessora FS respeita o término estendido da tarefa dividida', () => {
        const tasks: ItemScheduleDetails[] = [
            { id: 't1', duration: 3, segments: [{ workDays: 2, gapAfter: 3 }, { workDays: 1, gapAfter: 0 }] },
            { id: 't2', duration: 1, predecessors: [{ id: 't1', type: 'FS' as any, lag: 0 }] },
        ];
        const result = SchedulingEngine.calculate(tasks, '2025-01-06', undefined, true);
        const t1 = result.find(t => t.id === 't1')!;
        const t2 = result.find(t => t.id === 't2')!;
        expect(t2.earlyStart).toBe(t1.earlyFinish); // começa no término estendido, não no dia 09
    });

    it('resolveSegmentDates devolve as sub-barras absolutas com o gap', () => {
        const tasks: ItemScheduleDetails[] = [
            { id: 't1', duration: 3, segments: [{ workDays: 2, gapAfter: 3 }, { workDays: 1, gapAfter: 0 }] },
        ];
        const [t1] = SchedulingEngine.calculate(tasks, '2025-01-06', undefined, true);
        const subBars = SchedulingEngine.resolveSegmentDates(t1, true);
        expect(subBars).toEqual([
            { start: '2025-01-06', end: '2025-01-08' },
            { start: '2025-01-13', end: '2025-01-14' },
        ]);
    });
});

describe('utils/scheduleSegments', () => {
    it('splitTask divide o trabalho preservando a duração total', () => {
        const segs = splitTask(5, 2, 4);
        expect(segs).toEqual([{ workDays: 2, gapAfter: 4 }, { workDays: 3, gapAfter: 0 }]);
        expect(totalWorkDays(segs)).toBe(5);
    });

    it('mergeSegments recompõe a duração a partir dos trechos', () => {
        expect(mergeSegments([{ workDays: 2, gapAfter: 4 }, { workDays: 3, gapAfter: 0 }])).toEqual({ duration: 5 });
    });

    it('applySplitToTask desliga autoDuration e mantém o trabalho', () => {
        const task: ItemScheduleDetails = { id: 't1', duration: 6, autoDuration: true };
        const split = applySplitToTask(task, 3, 2);
        expect(split.autoDuration).toBe(false);
        expect(totalWorkDays(split.segments)).toBe(6);
    });

    it('removeSplitFromTask volta à tarefa contígua', () => {
        const task: ItemScheduleDetails = { id: 't1', duration: 6, segments: [{ workDays: 4, gapAfter: 2 }, { workDays: 2, gapAfter: 0 }] };
        const merged = removeSplitFromTask(task);
        expect(merged.segments).toBeUndefined();
        expect(merged.duration).toBe(6);
    });
});
