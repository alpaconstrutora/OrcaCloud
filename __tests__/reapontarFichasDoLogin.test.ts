/**
 * organizationService.reapontarFichasDoLogin — "Reenviar convite" troca o login (id novo) e a
 * ficha do colaborador vinculada ao antigo precisa acompanhar. Cada ficha é gravada sozinha:
 * uma ficha barrada pela trava do vínculo (42501) não pode derrubar as outras.
 * Revisão final de docs/planos/2026-11-16-usuarios-convidar-colaborador.md (achado 3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: { tabela: string; update?: unknown; filtros: [string, unknown][] }[] = [];
let respostaDoSelect: { data: unknown; error: unknown } = { data: [], error: null };
let respostaDoUpdate: (id: unknown) => { data: unknown; error: unknown } = () => ({ data: [], error: null });

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => {
            const registro: (typeof chamadas)[number] = { tabela, filtros: [] };
            chamadas.push(registro);
            const cadeia = {
                select: () => cadeia,
                update: (v: unknown) => { registro.update = v; return cadeia; },
                eq: (col: string, val: unknown) => { registro.filtros.push([col, val]); return cadeia; },
                then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => {
                    const id = registro.filtros.find(([c]) => c === 'id')?.[1];
                    const r = registro.update ? respostaDoUpdate(id) : respostaDoSelect;
                    return Promise.resolve(r).then(ok, erro);
                },
            };
            return cadeia;
        },
    },
}));

import { organizationService } from '../services/organizationService';

beforeEach(() => { chamadas.length = 0; });

describe('reapontarFichasDoLogin', () => {
    it('troca cada ficha do login antigo para o novo e conta as trocadas', async () => {
        respostaDoSelect = { data: [{ id: 'e1', name: 'Ana' }], error: null };
        respostaDoUpdate = id => ({ data: [{ id }], error: null });
        const r = await organizationService.reapontarFichasDoLogin('u-1', 'u-2');
        expect(r).toEqual({ trocadas: 1, falhas: [] });
        expect(chamadas[0].filtros).toEqual([['user_id', 'u-1']]);
        expect(chamadas[1]).toMatchObject({ tabela: 'employees', update: { user_id: 'u-2' }, filtros: [['id', 'e1']] });
    });

    it('ficha barrada (42501) vira falha com o nome, sem derrubar as outras', async () => {
        respostaDoSelect = { data: [{ id: 'e1', name: 'Ana' }, { id: 'e2', name: 'Bia' }], error: null };
        respostaDoUpdate = id => id === 'e2'
            ? { data: null, error: { code: '42501', message: 'só owner…' } }
            : { data: [{ id }], error: null };
        const r = await organizationService.reapontarFichasDoLogin('u-1', 'u-2');
        expect(r.trocadas).toBe(1);
        expect(r.falhas).toEqual(['Bia: só owner ou admin da organização do colaborador vincula']);
    });

    it('UPDATE que a RLS filtra (0 linhas, sem erro) também é falha', async () => {
        respostaDoSelect = { data: [{ id: 'e1', name: 'Ana' }], error: null };
        respostaDoUpdate = () => ({ data: [], error: null });
        const r = await organizationService.reapontarFichasDoLogin('u-1', 'u-2');
        expect(r).toEqual({ trocadas: 0, falhas: ['Ana: sem permissão para alterar a ficha'] });
    });
});
