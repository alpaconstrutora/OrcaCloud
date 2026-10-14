import { describe, it, expect } from 'vitest';
import {
    resolverPlanejamentoDoDiario,
    itensCronogramaVinculaveis,
    vincularAtividade,
    temAtividadeVinculada,
    aplicarEvolucaoNoCronograma,
    ProjetoParaVinculo,
} from '../utils/diaryPlanningLink';
import type { DiaryActivity, DiaryEntry } from '../types/diary';
import type { ProjectSchedule } from '../types/project';
import type { BudgetEntry } from '../types';

const proj = (id: string, classification: string, linkedProjectId?: string): ProjetoParaVinculo =>
    ({ id, settings: { classification, linkedProjectId } });

const atv = (over: Partial<DiaryActivity> = {}): DiaryActivity => ({
    itemId: '', description: '', plannedQty: 0, realizedQty: 0, evolution: 0, status: 'Em Andamento', ...over,
});

const entrada = (id: string, activities: DiaryActivity[], status: DiaryEntry['status'] = 'Rascunho'): DiaryEntry =>
    ({ id, date: '2026-10-01', weather: '', description: '', images: [], activities, status });

const cronograma = (itens: { id: string; manualRealPct?: number }[]): ProjectSchedule =>
    ({ startDate: '2026-01-01', duration: 1, periods: [], distributions: [], itemSchedules: itens } as ProjectSchedule);

const orc = (id: string, description: string | undefined, quantity = 10): BudgetEntry =>
    ({ id, quantity, sinapiItem: description === undefined ? undefined : { description } } as unknown as BudgetEntry);

describe('resolverPlanejamentoDoDiario', () => {
    it('sem vínculo → null', () => {
        expect(resolverPlanejamentoDoDiario(undefined, [])).toBeNull();
        expect(resolverPlanejamentoDoDiario('', [])).toBeNull();
    });
    it('vínculo já é Planejamento → ele mesmo', () => {
        expect(resolverPlanejamentoDoDiario('pl', [proj('pl', 'PLANEJAMENTO')])).toBe('pl');
    });
    it('Obra com Planejamento apontando direto para ela', () => {
        expect(resolverPlanejamentoDoDiario('ob', [proj('ob', 'OBRA'), proj('pl', 'PLANEJAMENTO', 'ob')])).toBe('pl');
    });
    it('Obra → Orçamento da obra → Planejamento do orçamento', () => {
        const ps = [proj('ob', 'OBRA'), proj('or', 'ORCAMENTO', 'ob'), proj('pl', 'PLANEJAMENTO', 'or')];
        expect(resolverPlanejamentoDoDiario('ob', ps)).toBe('pl');
    });
    it('Orçamento → Obra dele → Planejamento da obra', () => {
        const ps = [proj('ob', 'OBRA'), proj('or', 'ORCAMENTO', 'ob'), proj('pl', 'PLANEJAMENTO', 'ob')];
        expect(resolverPlanejamentoDoDiario('or', ps)).toBe('pl');
    });
    it('não achou → devolve o próprio vínculo (fallback histórico)', () => {
        expect(resolverPlanejamentoDoDiario('x', [])).toBe('x');
        expect(resolverPlanejamentoDoDiario('ob', [proj('ob', 'OBRA')])).toBe('ob');
    });
});

describe('itensCronogramaVinculaveis', () => {
    it('só itens que ainda existem no orçamento e têm nome', () => {
        const s = cronograma([{ id: 'a' }, { id: 'orfao' }, { id: 'semNome' }]);
        const itens = itensCronogramaVinculaveis(s, [orc('a', 'Alvenaria'), orc('semNome', undefined)]);
        expect(itens.map(i => i.schedule.id)).toEqual(['a']);
    });
    it('sem cronograma → vazio', () => {
        expect(itensCronogramaVinculaveis(null, [orc('a', 'A')])).toEqual([]);
    });
});

describe('vincularAtividade', () => {
    const vinculo = { schedule: { id: 'a', manualRealPct: 40 }, budget: orc('a', 'Alvenaria', 50) };
    it('traz descrição, quantidade e a evolução que o cronograma já registra', () => {
        const r = vincularAtividade(atv({ description: 'digitado' }), vinculo);
        expect(r).toMatchObject({ itemId: 'a', description: 'Alvenaria', plannedQty: 50, evolution: 40, realizedQty: 20, status: 'Em Andamento' });
    });
    it('100% → Finalizada', () => {
        const r = vincularAtividade(atv(), { ...vinculo, schedule: { id: 'a', manualRealPct: 100 } });
        expect(r.status).toBe('Finalizada');
    });
    it('sem vínculo → solta o itemId e mantém o resto', () => {
        const r = vincularAtividade(atv({ itemId: 'a', description: 'Alvenaria', evolution: 30 }), undefined);
        expect(r).toMatchObject({ itemId: '', description: 'Alvenaria', evolution: 30 });
    });
});

describe('temAtividadeVinculada', () => {
    it('não prevista e sem itemId não contam', () => {
        expect(temAtividadeVinculada(undefined)).toBe(false);
        expect(temAtividadeVinculada([atv(), atv({ itemId: 'a', unplanned: true })])).toBe(false);
        expect(temAtividadeVinculada([atv({ itemId: 'a' })])).toBe(true);
    });
});

describe('aplicarEvolucaoNoCronograma', () => {
    it('usa a MAIOR evolução entre os registros, ignorando recusado e não prevista', () => {
        const s = cronograma([{ id: 'a', manualRealPct: 10 }, { id: 'b', manualRealPct: 0 }]);
        const entries = [
            entrada('1', [atv({ itemId: 'a', evolution: 30 })]),
            entrada('2', [atv({ itemId: 'a', evolution: 60 })]),
            entrada('3', [atv({ itemId: 'a', evolution: 90 })], 'Recusado'),
            entrada('4', [atv({ itemId: 'b', evolution: 80, unplanned: true })]),
        ];
        const { schedule, mudou } = aplicarEvolucaoNoCronograma(s, entries);
        expect(mudou).toBe(true);
        expect(schedule.itemSchedules).toEqual([{ id: 'a', manualRealPct: 60 }, { id: 'b', manualRealPct: 0 }]);
        expect(s.itemSchedules?.[0].manualRealPct).toBe(10); // não muta a entrada
    });
    it('nada a mudar → mesmo objeto e mudou=false', () => {
        const s = cronograma([{ id: 'a', manualRealPct: 50 }]);
        const r = aplicarEvolucaoNoCronograma(s, [entrada('1', [atv({ itemId: 'a', evolution: 50 })])]);
        expect(r.mudou).toBe(false);
        expect(r.schedule).toBe(s);
    });
    it('item vinculado que não está no cronograma entra (comportamento histórico)', () => {
        const r = aplicarEvolucaoNoCronograma(cronograma([]), [entrada('1', [atv({ itemId: 'z', evolution: 20 })])]);
        expect(r.schedule.itemSchedules).toEqual([{ id: 'z', manualRealPct: 20 }]);
    });
});
