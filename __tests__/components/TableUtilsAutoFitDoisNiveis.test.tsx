// @vitest-environment jsdom
/**
 * "Ajustar largura das colunas ao conteúdo" com cabeçalho em DOIS níveis (26/11/2026).
 *
 * Conciliação › Conciliados ganhou a linha de grupos "Extrato | Vínculo | Lançamentos" acima dos
 * títulos. O autoFit pegava a PRIMEIRA linha do <thead> e casava cada <col> com a célula de mesmo
 * índice — com a linha de grupos (colSpan) as medidas caíam na coluna errada e o botão "parou de
 * funcionar". A medida vem da ÚLTIMA linha do <thead> (uma célula por coluna).
 *
 * jsdom não tem layout: getBoundingClientRect devolve a largura escrita em data-w.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useResizableColumns } from '../../components/ui/TableUtils';

let api: ReturnType<typeof useResizableColumns> | null = null;

function Tabela({ grupos }: { grupos: boolean }) {
    const cols = useResizableColumns({ a: 150, b: 150, c: 150 }, 'autofitDoisNiveis');
    api = cols;
    return (
        <div>
            <table ref={cols.tableRef} style={{ tableLayout: 'fixed' }}>
                <colgroup>
                    <col data-col-key="a" style={{ width: `${cols.getWidth('a')}px` }} />
                    <col data-col-key="b" style={{ width: `${cols.getWidth('b')}px` }} />
                    <col data-col-key="c" style={{ width: `${cols.getWidth('c')}px` }} />
                </colgroup>
                <thead>
                    {grupos && (
                        <tr>
                            <th colSpan={2} data-w="999">Extrato</th>
                            <th data-w="7">Lançamentos</th>
                        </tr>
                    )}
                    <tr>
                        <th data-w="210">A</th>
                        <th data-w="120">B</th>
                        <th data-w="330">C</th>
                    </tr>
                </thead>
                <tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody>
            </table>
        </div>
    );
}

describe('useResizableColumns.autoFit — cabeçalho em dois níveis', () => {
    beforeEach(() => {
        localStorage.clear();
        api = null;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const w = Number(this.dataset.w ?? 0);
            return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['uma linha de cabeçalho', false],
        ['com a linha de grupos por cima', true],
    ])('%s: cada coluna recebe a medida do SEU título', (_n, grupos) => {
        render(<Tabela grupos={grupos} />);
        act(() => api!.autoFit({ fill: false }));
        expect([api!.getWidth('a'), api!.getWidth('b'), api!.getWidth('c')]).toEqual([210, 120, 330]);
    });
});
