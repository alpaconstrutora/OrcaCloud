import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Banco em memória de `projects` + query builder encadeável cobrindo só o que o
 * budgetResolver usa: select / eq / or / filter / order / limit / maybeSingle.
 */
type Row = { id: string; name?: string; budget?: any[] | null; settings?: any; updated_at?: string };

const db: { projects: Row[] } = { projects: [] };

vi.mock('../lib/supabase', () => {
    const makeBuilder = (rows: Row[]) => {
        let current = [...rows];
        const builder: any = {
            select: () => builder,
            order: () => builder,
            limit: (n: number) => { current = current.slice(0, n); return builder; },
            eq: (col: string, val: any) => {
                current = current.filter(r => (r as any)[col] === val);
                return builder;
            },
            // usado como .filter('settings->>linkedProjectId', 'eq', v)
            filter: (path: string, _op: string, val: any) => {
                const key = path.replace('settings->>', '');
                current = current.filter(r => r.settings?.[key] === val);
                return builder;
            },
            // usado como .or('settings->>classification.eq.A,settings->>classification.eq.B')
            or: (expr: string) => {
                const wanted = expr.split(',').map(p => p.split('.eq.')[1]);
                current = current.filter(r => wanted.includes(r.settings?.classification));
                return builder;
            },
            maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
            then: (resolve: any) => resolve({ data: current, error: null }),
        };
        return builder;
    };
    return { supabase: { from: (table: string) => makeBuilder((db as any)[table] ?? []) } };
});

import { resolveProjectBudget } from '../services/budgetResolver';

const item = (id: string) => ({ id, quantity: 1, sinapiItem: { code: id, description: id, unit: 'un', price: 10, type: 'INPUT' } }) as any;

const ORC_BUDGET = [item('A'), item('B')];

beforeEach(() => { db.projects = []; });

describe('budgetResolver — cascata de resolução', () => {
    it('usa o budget próprio quando o projeto é o ORCAMENTO', async () => {
        const proj = { id: 'orc', budget: ORC_BUDGET, settings: { classification: 'ORCAMENTO' } };
        const r = await resolveProjectBudget(proj);
        expect(r.source).toBe('own');
        expect(r.budget).toHaveLength(2);
    });

    it('num PLANEJAMENTO o snapshot congelado vence o budget próprio', async () => {
        const snap = [item('SNAP')];
        const proj = {
            id: 'plan',
            budget: ORC_BUDGET,
            settings: { classification: 'PLANEJAMENTO', basedOnBudgetSnapshot: snap, basedOnBudgetVersionId: 'v1' },
        };
        const r = await resolveProjectBudget(proj);
        expect(r.source).toBe('snapshot');
        expect(r.budget).toEqual(snap);
        expect(r.versionId).toBe('v1');
        // Já congelado: nada a persistir.
        expect(r.snapshotToPersist).toBeUndefined();
    });

    it('PLANEJAMENTO sem snapshot congela a versão fixada do orçamento vinculado', async () => {
        db.projects = [{
            id: 'orc',
            budget: [],
            settings: {
                classification: 'ORCAMENTO',
                activeVersionId: 'v2',
                versions: [
                    { id: 'v1', item: 1, budget: ORC_BUDGET },
                    { id: 'v2', item: 2, budget: [item('NOVO')] },
                ],
            },
        }];
        const proj = {
            id: 'plan',
            budget: [],
            settings: { classification: 'PLANEJAMENTO', linkedProjectId: 'orc', basedOnBudgetVersionId: 'v1' },
        };
        const r = await resolveProjectBudget(proj);
        // Fixado em v1 — não drifta para a versão ativa v2.
        expect(r.source).toBe('pinned-version');
        expect(r.versionId).toBe('v1');
        expect(r.budget).toHaveLength(2);
        expect(r.snapshotToPersist).toHaveLength(2);
    });

    it('PLANEJAMENTO sem pin fixa na versão ativa do vinculado', async () => {
        db.projects = [{
            id: 'orc',
            budget: [],
            settings: {
                classification: 'ORCAMENTO',
                activeVersionId: 'v2',
                versions: [
                    { id: 'v1', item: 1, budget: ORC_BUDGET },
                    { id: 'v2', item: 2, budget: [item('NOVO')] },
                ],
            },
        }];
        const proj = { id: 'plan', budget: [], settings: { classification: 'PLANEJAMENTO', linkedProjectId: 'orc' } };
        const r = await resolveProjectBudget(proj);
        expect(r.source).toBe('active-version');
        expect(r.versionId).toBe('v2');
        expect(r.snapshotToPersist).toHaveLength(1);
    });

    it('acha o orçamento no projeto filho quando o projeto é a OBRA (searchChildren)', async () => {
        db.projects = [{
            id: 'orc',
            budget: ORC_BUDGET,
            settings: { classification: 'ORCAMENTO', linkedProjectId: 'obra' },
        }];
        const obra = { id: 'obra', budget: [], settings: { classification: 'OBRA' } };

        // Sem opt-in, não procura filhos: é o bug original da aba Itens do Orçamento.
        const semBusca = await resolveProjectBudget(obra);
        expect(semBusca.source).toBe('none');
        expect(semBusca.budget).toHaveLength(0);

        const comBusca = await resolveProjectBudget(obra, { searchChildren: true });
        expect(comBusca.source).toBe('child-project');
        expect(comBusca.budget).toHaveLength(2);
    });

    it('um ORCAMENTO vazio vinculado a uma OBRA não herda os itens dela', async () => {
        db.projects = [{
            id: 'obra',
            budget: ORC_BUDGET,
            settings: { classification: 'OBRA', versions: [{ id: 'v1', item: 1, budget: ORC_BUDGET }] },
        }];
        const orcVazio = { id: 'orc', budget: [], settings: { classification: 'ORCAMENTO', linkedProjectId: 'obra' } };
        const r = await resolveProjectBudget(orcVazio);
        expect(r.source).toBe('none');
        expect(r.budget).toHaveLength(0);
        expect(r.snapshotToPersist).toBeUndefined();
    });

    it('resolve o vínculo legado por nome via findByName, sem ir ao banco', async () => {
        const findByName = vi.fn().mockReturnValue({
            id: 'orc',
            budget: ORC_BUDGET,
            settings: { classification: 'ORCAMENTO' },
        });
        const proj = { id: 'plan', budget: [], settings: { classification: 'PLANEJAMENTO', linkedProjectName: 'Obra X' } };
        const r = await resolveProjectBudget(proj, { findByName });
        expect(findByName).toHaveBeenCalledWith('Obra X');
        expect(r.source).toBe('linked-live');
        expect(r.budget).toHaveLength(2);
    });
});
