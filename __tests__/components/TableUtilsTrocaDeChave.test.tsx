// @vitest-environment jsdom
/**
 * useTableColumns com a chave de gravação trocando no mesmo componente (21/11/2026).
 *
 * Engenharia › Orçamentos e › Planejamento são a MESMA instância de ProjectList (o AppRouter
 * troca só as props). O hook lia a preferência só na montagem: ao ir do Planejamento para os
 * Orçamentos, seguia com as colunas do Planejamento e as gravava na chave dos Orçamentos — a
 * tabela de Orçamentos ficava com Avanço/Prazo/Término/Início, que o "Colunas visíveis" não lista.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTableColumns, type ColumnConfig } from '../../components/ui/TableUtils';

const ORC: ColumnConfig[] = [{ key: 'code', label: 'Código' }, { key: 'status', label: 'Status' }, { key: 'extra', label: 'Extra', defaultHidden: true }];
const PLAN: ColumnConfig[] = [{ key: 'code', label: 'Código' }, { key: 'avanco', label: 'Avanço' }, { key: 'prazo', label: 'Prazo' }];

describe('useTableColumns — trocar a chave de gravação', () => {
    beforeEach(() => localStorage.clear());

    it('recarrega as colunas da chave nova e não grava as da tela anterior nela', () => {
        localStorage.setItem('orc', JSON.stringify({ visibleColumns: ['code', 'extra'], knownColumns: ['code', 'status', 'extra'], columnOrder: ['code', 'status', 'extra'], sortColumn: 'code', sortDirection: 'desc' }));
        const { result, rerender } = renderHook(({ cols, chave }) => useTableColumns(cols, chave), {
            initialProps: { cols: PLAN, chave: 'plan' },
        });
        expect(result.current.orderedVisibleColumns).toEqual(['code', 'avanco', 'prazo']);

        rerender({ cols: ORC, chave: 'orc' });
        expect(result.current.orderedVisibleColumns).toEqual(['code', 'extra']);
        expect(result.current.sortColumn).toBe('code');
        expect(result.current.sortDirection).toBe('desc');
        const gravadoOrc = JSON.parse(localStorage.getItem('orc')!);
        expect(gravadoOrc.visibleColumns).toEqual(['code', 'extra']);
        expect(gravadoOrc.visibleColumns).not.toContain('avanco');

        // e a volta ao Planejamento traz as dele, intactas
        rerender({ cols: PLAN, chave: 'plan' });
        expect(result.current.orderedVisibleColumns).toEqual(['code', 'avanco', 'prazo']);
        expect(JSON.parse(localStorage.getItem('plan')!).visibleColumns).not.toContain('extra');
    });

    it('chave nova sem nada gravado = padrão da tela nova', () => {
        const { result, rerender } = renderHook(({ cols, chave }) => useTableColumns(cols, chave), {
            initialProps: { cols: PLAN, chave: 'plan' },
        });
        rerender({ cols: ORC, chave: 'orc' });
        expect(result.current.orderedVisibleColumns).toEqual(['code', 'status']);
        expect(result.current.sortColumn).toBeNull();
    });
});
