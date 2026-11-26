// @vitest-environment jsdom
/**
 * useTableColumns com preferência salva que cita coluna que a tela NÃO define (26/11/2026).
 *
 * Conciliação › Pendentes › Lançamentos: o #707 criou a coluna 'sequencia' entre Data e Valor e
 * o #712, no mesmo dia, a tirou. Quem abriu a tela nesse meio-tempo ficou com 'sequencia' gravada
 * no localStorage; o <tbody> desenhava uma célula vazia para ela e o <thead> (sem título para a
 * chave) a pulava — o Valor aparecia uma coluna à direita do cabeçalho "Valor".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTableColumns, type ColumnConfig } from '../../components/ui/TableUtils';

const COLS: ColumnConfig[] = [
    { key: 'description', label: 'Descrição' },
    { key: 'date', label: 'Data' },
    { key: 'amount', label: 'Valor' },
];

describe('useTableColumns — chave gravada que a tela não define', () => {
    beforeEach(() => localStorage.clear());

    it('a coluna removida não entra nas colunas desenhadas (cabeçalho e corpo alinhados)', () => {
        const comSequencia = ['description', 'date', 'sequencia', 'amount'];
        localStorage.setItem('pend', JSON.stringify({ visibleColumns: comSequencia, knownColumns: comSequencia, columnOrder: comSequencia, sortColumn: null, sortDirection: 'asc' }));

        const { result } = renderHook(() => useTableColumns(COLS, 'pend'));

        expect(result.current.orderedVisibleColumns).toEqual(['description', 'date', 'amount']);
    });

    it('formato legado (array puro) também sai limpo', () => {
        localStorage.setItem('pendLegado', JSON.stringify(['date', 'sequencia', 'amount']));
        const { result } = renderHook(() => useTableColumns(COLS, 'pendLegado'));
        expect(result.current.orderedVisibleColumns).not.toContain('sequencia');
        expect(result.current.orderedVisibleColumns).toEqual(expect.arrayContaining(['date', 'amount']));
    });

    it('coluna condicional (some num modo, volta no outro) mantém a escolha do usuário', () => {
        const comOrg: ColumnConfig[] = [{ key: 'org', label: 'Org' }, ...COLS];
        localStorage.setItem('folha', JSON.stringify({ visibleColumns: ['org', 'description', 'amount'], knownColumns: ['org', 'description', 'date', 'amount'], columnOrder: ['org', 'description', 'date', 'amount'] }));

        // modo de uma organização só: a tela não define 'org'
        const { result, rerender } = renderHook(({ cols }) => useTableColumns(cols, 'folha'), { initialProps: { cols: COLS } });
        expect(result.current.orderedVisibleColumns).toEqual(['description', 'amount']);

        // "Todas as organizações": 'org' volta, visível como o usuário deixou
        rerender({ cols: comOrg });
        expect(result.current.orderedVisibleColumns).toEqual(['org', 'description', 'amount']);
        expect(JSON.parse(localStorage.getItem('folha')!).visibleColumns).toContain('org');
    });
});
