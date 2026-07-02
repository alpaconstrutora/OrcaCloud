import { ItemScheduleDetails, ScheduleSegment } from '../types';

/**
 * Split de tarefa (PLANO_MODULO_PLANEJAMENTO_GAPS.md #5b).
 * `duration` = dias úteis de trabalho (custo/HH); a soma dos workDays dos segmentos
 * deve sempre igualar `duration`. O gap estende a janela no tempo sem alterar o trabalho.
 */

/**
 * Divide o trabalho de uma tarefa em dois trechos com uma pausa entre eles.
 * @param duration total de dias úteis de trabalho da tarefa
 * @param at dias de trabalho no primeiro trecho (1..duration-1)
 * @param gapDays dias úteis de pausa entre os dois trechos
 */
export function splitTask(duration: number, at: number, gapDays: number): ScheduleSegment[] {
    const total = Math.max(2, Math.floor(duration) || 2);
    const first = Math.max(1, Math.min(total - 1, Math.floor(at)));
    const gap = Math.max(1, Math.floor(gapDays) || 1);
    return [
        { workDays: first, gapAfter: gap },
        { workDays: total - first, gapAfter: 0 },
    ];
}

/**
 * Adiciona uma nova divisão a uma tarefa já segmentada, dividindo o último trecho.
 * Mantém a soma de workDays constante (não altera a duração/trabalho).
 */
export function addSplit(segments: ScheduleSegment[], gapDays: number): ScheduleSegment[] {
    if (segments.length === 0) return segments;
    const last = segments[segments.length - 1];
    if ((last.workDays || 0) < 2) return segments; // nada a dividir
    const half = Math.floor(last.workDays / 2);
    const gap = Math.max(1, Math.floor(gapDays) || 1);
    return [
        ...segments.slice(0, -1),
        { workDays: half, gapAfter: gap },
        { workDays: last.workDays - half, gapAfter: 0 },
    ];
}

/** Remove a divisão: volta a uma tarefa contígua (soma dos trabalhos vira a duração). */
export function mergeSegments(segments?: ScheduleSegment[]): { duration: number } {
    const total = (segments || []).reduce((sum, s) => sum + (s.workDays || 0), 0);
    return { duration: total };
}

/** Soma dos dias úteis de trabalho dos segmentos (deve bater com duration). */
export function totalWorkDays(segments?: ScheduleSegment[]): number {
    return (segments || []).reduce((sum, s) => sum + (s.workDays || 0), 0);
}

/** Aplica um split a uma tarefa, retornando um novo ItemScheduleDetails (não muta o input). */
export function applySplitToTask(task: ItemScheduleDetails, at: number, gapDays: number): ItemScheduleDetails {
    const segments = task.segments && task.segments.length > 0
        ? addSplit(task.segments, gapDays)
        : splitTask(task.duration || 0, at, gapDays);
    // Split é sempre manual: desliga auto-duração para o motor não sobrescrever a duração.
    return { ...task, segments, autoDuration: false };
}

/** Remove todos os splits de uma tarefa. */
export function removeSplitFromTask(task: ItemScheduleDetails): ItemScheduleDetails {
    const { segments, ...rest } = task;
    return { ...rest, duration: totalWorkDays(task.segments) || task.duration };
}
