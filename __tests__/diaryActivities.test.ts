import { describe, it, expect } from 'vitest';
import type { DiaryActivity } from '../types/diary';
import { isUnplannedActivity, setUnplanned, activityMatchesBudgetItem, countUnplanned } from '../utils/diaryActivities';

const atividade = (over: Partial<DiaryActivity> = {}): DiaryActivity => ({
    itemId: '', description: '', plannedQty: 0, realizedQty: 0, evolution: 0, status: 'Em Andamento', ...over,
});
const item = { id: 'b1', sinapiItem: { description: 'Alvenaria de vedação' } };

describe('atividade não prevista no cronograma', () => {
    it('sem vínculo NÃO é não prevista — a marcação é explícita (mobile não vincula)', () => {
        expect(isUnplannedActivity(atividade())).toBe(false);
        expect(isUnplannedActivity(atividade({ unplanned: true }))).toBe(true);
    });

    it('marcar solta o vínculo; desmarcar não inventa vínculo', () => {
        const marcada = setUnplanned(atividade({ itemId: 'b1' }), true);
        expect(marcada).toMatchObject({ unplanned: true, itemId: '' });
        expect(setUnplanned(marcada, false)).toMatchObject({ unplanned: false, itemId: '' });
    });

    it('vinculada casa com o item por id; legado casa pela descrição idêntica', () => {
        expect(activityMatchesBudgetItem(atividade({ itemId: 'b1' }), item)).toBe(true);
        expect(activityMatchesBudgetItem(atividade({ description: ' Alvenaria de vedação ' }), item)).toBe(true);
        expect(activityMatchesBudgetItem(atividade({ description: 'Outra coisa' }), item)).toBe(false);
    });

    it('não prevista nunca conta como avanço de item — nem com a mesma descrição', () => {
        const a = atividade({ unplanned: true, description: 'Alvenaria de vedação' });
        expect(activityMatchesBudgetItem(a, item)).toBe(false);
    });

    it('sem itemId e sem descrição não casa com item de id vazio', () => {
        expect(activityMatchesBudgetItem(atividade(), { id: '', sinapiItem: { description: '' } })).toBe(false);
    });

    it('conta as não previstas da entrada', () => {
        expect(countUnplanned(undefined)).toBe(0);
        expect(countUnplanned([atividade(), atividade({ unplanned: true }), atividade({ unplanned: true })])).toBe(2);
    });
});
