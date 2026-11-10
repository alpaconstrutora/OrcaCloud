/**
 * Portais › Portal do Investidor: a lista acrescenta em cada linha o campo de
 * exibição `_projectNames` (nomes das obras vinculadas, para filtro/coluna/KPI).
 * Ao editar, essa linha virava o `initialData` do modal e o PATCH levava o campo
 * junto → "Could not find the '_projectNames' column of 'investors' in the
 * schema cache" (10/11/2026). Campo `_*` é derivado de tela, nunca coluna.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates: Array<Record<string, unknown>> = [];
const inserts: Array<Record<string, unknown>> = [];

vi.mock('../lib/supabase', () => {
    const chain = (data: unknown) => {
        const c: Record<string, unknown> = {};
        c.eq = () => c;
        c.select = () => c;
        c.single = () => Promise.resolve({ data, error: null });
        return c;
    };
    return {
        supabase: {
            from: () => ({
                update: (payload: Record<string, unknown>) => { updates.push(payload); return chain({ id: 'i1' }); },
                insert: (payload: Record<string, unknown>) => { inserts.push(payload); return chain({ id: 'i2' }); },
            }),
            rpc: () => Promise.resolve({ data: '001', error: null }),
        },
    };
});
vi.mock('../services/documentDuplicateCheck', () => ({ assertDocumentNotDuplicated: async () => undefined }));
// investorService importa sinapiService, que consulta o banco ao carregar o módulo.
vi.mock('../services/sinapiService', () => ({ sinapiService: {} }));

import { investorService } from '../services/investorService';

beforeEach(() => {
    updates.length = 0;
    inserts.length = 0;
});

describe('investorService.saveInvestor — campo derivado da lista', () => {
    it('edição: _projectNames não vai no UPDATE', async () => {
        await investorService.saveInvestor({ id: 'i1', name: 'Ana', _projectNames: 'Obra X' } as never);
        expect(updates).toHaveLength(1);
        expect(updates[0]).not.toHaveProperty('_projectNames');
        expect(updates[0].name).toBe('Ana');
    });

    it('cadastro: _projectNames não vai no INSERT', async () => {
        await investorService.saveInvestor({ name: 'Bia', _projectNames: '' } as never);
        expect(inserts).toHaveLength(1);
        expect(inserts[0]).not.toHaveProperty('_projectNames');
    });
});
