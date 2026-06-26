import { describe, it, expect } from 'vitest';
import {
    seedOutlineFromBudget, insertNode, removeNode, renameNode, reorderSibling,
    moveNode, canMove, duplicateSubtree, collectLeafIds, findNode, getAncestors, parentWbsLabels, genId,
    reconcileOutlineWithBudget, outlineBudgetItemIds,
} from '../utils/scheduleOutline';
import { OutlineNode } from '../types/schedule';
import { BudgetEntry, SinapiType } from '../types/budget';

const item = (id: string, group: string, phase: string, subPhase?: string): BudgetEntry => ({
    id,
    quantity: 1,
    group,
    phase,
    subPhase,
    sinapiItem: { code: id, description: `Item ${id}`, unit: 'un', price: 10, type: SinapiType.INPUT, category: 'Material' },
});

const struct = (type: OutlineNode['type'], name: string, children: OutlineNode[] = []): OutlineNode =>
    ({ id: genId(), type, name, children });

describe('seedOutlineFromBudget', () => {
    it('materializa group > phase > (subphase) > item', () => {
        const budget = [
            item('a', 'G1', 'E1'),
            item('b', 'G1', 'E1', 'S1'),
            item('c', 'G2', 'E2'),
        ];
        const outline = seedOutlineFromBudget(budget);
        expect(outline).toHaveLength(2);
        const g1 = outline.find(g => g.name === 'G1')!;
        expect(g1.type).toBe('group');
        const e1 = g1.children!.find(c => c.name === 'E1')!;
        // E1 contém item 'a' (direto) e subetapa S1 (com item 'b')
        expect(e1.children!.some(c => c.type === 'item' && c.budgetItemId === 'a')).toBe(true);
        const s1 = e1.children!.find(c => c.type === 'subphase')!;
        expect(s1.children!.some(c => c.budgetItemId === 'b')).toBe(true);
    });
});

describe('insert / remove / rename / reorder', () => {
    it('insere e remove preservando o resto', () => {
        let roots: OutlineNode[] = [struct('group', 'G1')];
        const gId = roots[0].id;
        const phase = struct('phase', 'E1');
        roots = insertNode(roots, gId, phase);
        expect(findNode(roots, phase.id)).toBeTruthy();

        const { roots: after, removed } = removeNode(roots, phase.id);
        expect(removed?.id).toBe(phase.id);
        expect(findNode(after, phase.id)).toBeNull();
    });

    it('renomeia', () => {
        const roots = [struct('group', 'Antigo')];
        const next = renameNode(roots, roots[0].id, 'Novo');
        expect(findNode(next, roots[0].id)!.name).toBe('Novo');
        // imutável: original intacto
        expect(roots[0].name).toBe('Antigo');
    });

    it('reordena irmãos (subir/descer)', () => {
        const a = struct('group', 'A'); const b = struct('group', 'B');
        const roots = [a, b];
        const up = reorderSibling(roots, b.id, -1);
        expect(up[0].id).toBe(b.id);
        const noop = reorderSibling(roots, a.id, -1); // já é o primeiro
        expect(noop[0].id).toBe(a.id);
    });
});

describe('canMove / moveNode', () => {
    it('valida ranks e ciclos', () => {
        const sub = struct('subphase', 'S1');
        const phase = struct('phase', 'E1', [sub]);
        const group = struct('group', 'G1', [phase]);
        const roots = [group];

        expect(canMove(roots, sub.id, group.id)).toBe(true);    // subphase sob group (rank menor) ok
        expect(canMove(roots, phase.id, sub.id)).toBe(false);   // phase não pode sob subphase
        expect(canMove(roots, group.id, phase.id)).toBe(false); // ciclo: parent dentro da subárvore
        expect(canMove(roots, group.id, null)).toBe(true);      // group na raiz ok
        expect(canMove(roots, phase.id, null)).toBe(false);     // só group na raiz
    });

    it('move efetivamente', () => {
        const e1 = struct('phase', 'E1');
        const e2 = struct('phase', 'E2');
        const act = struct('activity', 'Tarefa');
        e1.children = [act];
        const group = struct('group', 'G1', [e1, e2]);
        const roots = moveNode([group], act.id, e2.id);
        const movedParent = findNode(roots, e2.id)!;
        expect(movedParent.children!.some(c => c.id === act.id)).toBe(true);
        expect(findNode(roots, e1.id)!.children!.some(c => c.id === act.id)).toBe(false);
    });
});

describe('duplicateSubtree', () => {
    it('clona com novos ids e mapeia old→new', () => {
        const child = struct('activity', 'Tarefa');
        const group = struct('group', 'G1', [child]);
        const { clone, idMap } = duplicateSubtree(group);
        expect(clone.id).not.toBe(group.id);
        expect(clone.children![0].id).not.toBe(child.id);
        expect(idMap[group.id]).toBe(clone.id);
        expect(idMap[child.id]).toBe(clone.children![0].id);
    });

    it('item clonado recebe budgetItemId = novo id', () => {
        const it: OutlineNode = { id: 'x', type: 'item', name: 'Item', budgetItemId: 'x', children: [] };
        const { clone } = duplicateSubtree(it);
        expect(clone.budgetItemId).toBe(clone.id);
        expect(clone.id).not.toBe('x');
    });
});

describe('reconcileOutlineWithBudget', () => {
    it('insere itens novos do orçamento na estrutura existente (sem duplicar)', () => {
        const budget = [item('a', 'G1', 'E1')];
        const outline = seedOutlineFromBudget(budget);
        expect(outlineBudgetItemIds(outline).has('a')).toBe(true);

        // orçamento ganhou item 'b' (mesma etapa) e 'c' (grupo novo)
        const newBudget = [...budget, item('b', 'G1', 'E1'), item('c', 'G2', 'E2')];
        const { outline: reconciled, added } = reconcileOutlineWithBudget(outline, newBudget);
        expect(added).toBe(2);
        const ids = outlineBudgetItemIds(reconciled);
        expect(ids.has('a')).toBe(true);
        expect(ids.has('b')).toBe(true);
        expect(ids.has('c')).toBe(true);
        // 'b' foi sob a etapa E1 existente (não criou outra)
        const g1 = reconciled.find(n => n.name === 'G1')!;
        const e1s = g1.children!.filter(n => n.type === 'phase' && n.name === 'E1');
        expect(e1s).toHaveLength(1);
    });

    it('é no-op quando tudo já está presente', () => {
        const budget = [item('a', 'G1', 'E1')];
        const outline = seedOutlineFromBudget(budget);
        const { added, outline: same } = reconcileOutlineWithBudget(outline, budget);
        expect(added).toBe(0);
        expect(same).toBe(outline); // mesma referência (não clonou)
    });
});

describe('collectLeafIds / getAncestors / parentWbsLabels', () => {
    it('coleta ids de itens e atividades', () => {
        const it: OutlineNode = { id: 'i1', type: 'item', name: 'I', budgetItemId: 'i1', children: [] };
        const act = struct('activity', 'A');
        const group = struct('group', 'G', [it, act]);
        const { budgetItemIds, activityIds } = collectLeafIds(group);
        expect(budgetItemIds).toContain('i1');
        expect(activityIds).toContain(act.id);
    });

    it('resolve cadeia de ancestrais e rótulos', () => {
        const sub = struct('subphase', 'S1');
        const phase = struct('phase', 'E1', [sub]);
        const group = struct('group', 'G1', [phase]);
        const roots = [group];
        const labels = parentWbsLabels(roots, sub.id);
        expect(labels).toEqual({ group: 'G1', phase: 'E1', subPhase: 'S1' });
        expect(getAncestors(roots, sub.id).map(n => n.name)).toEqual(['G1', 'E1', 'S1']);
    });
});
