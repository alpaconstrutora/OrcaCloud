// @vitest-environment jsdom
/**
 * Busca leve dos itens (`id, budget`) das linhas de uma lista — comum ao Planejamento e ao
 * Valor total dos Orçamentos (21/11/2026).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({
    resposta: { data: [] as unknown[] | null, error: null as unknown },
    selects: [] as { tabela: string; colunas: string; ids: string[] }[],
}));
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (tabela: string) => ({
            select: (colunas: string) => ({
                in: (_col: string, ids: string[]) => {
                    banco.selects.push({ tabela, colunas, ids });
                    return Promise.resolve(banco.resposta);
                },
            }),
        }),
    },
}));

import { useOrcamentosDaLista } from '../hooks/useOrcamentosDaLista';

beforeEach(() => {
    banco.resposta = { data: [{ id: 'p1', budget: [{ quantity: 1 }] }, { id: 'p2', budget: null }], error: null };
    banco.selects = [];
});

describe('useOrcamentosDaLista', () => {
    it('busca só id e budget pelos ids da lista; orçamento sem itens vira []', async () => {
        const { result } = renderHook(() => useOrcamentosDaLista(['p2', 'p1'], true));
        await waitFor(() => expect(result.current.estado).toBe('pronto'));
        expect(banco.selects).toEqual([{ tabela: 'projects', colunas: 'id, budget', ids: ['p1', 'p2'] }]);
        expect(result.current.orcamentos).toEqual({ p1: [{ quantity: 1 }], p2: [] });
    });

    it('inativo não busca nada', async () => {
        renderHook(() => useOrcamentosDaLista(['p1'], false));
        await new Promise(r => setTimeout(r, 10));
        expect(banco.selects).toEqual([]);
    });

    it('erro do banco vira estado "erro"', async () => {
        banco.resposta = { data: null, error: { message: 'falhou' } };
        const { result } = renderHook(() => useOrcamentosDaLista(['p1'], true));
        await waitFor(() => expect(result.current.estado).toBe('erro'));
    });
});
