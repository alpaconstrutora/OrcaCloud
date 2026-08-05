// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useTableColumns, SortableHeader } from '../../components/ui/TableUtils';

// Verifica o mecanismo de reordenar colunas por arraste (estilo ClickUp),
// implementado a pedido em useTableColumns/SortableHeader: arrastar um header e
// soltar sobre outro troca a posição das duas na ordem geral, e a ordem
// persiste em localStorage (mesmo storageKey já usado para visibilidade/sort).
describe('useTableColumns — reordenar colunas por arraste', () => {
  beforeEach(() => localStorage.clear());

  it('moveColumn troca a posição de duas colunas mantendo as demais', () => {
    const { result } = renderHook(() =>
      useTableColumns(
        [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
        ],
        'testDragOrder',
      ),
    );

    expect(result.current.orderedVisibleColumns).toEqual(['a', 'b', 'c']);

    act(() => result.current.moveColumn('a', 'c'));

    expect(result.current.orderedVisibleColumns).toEqual(['b', 'c', 'a']);
  });

  it('persiste a ordem no localStorage e sobrevive a um novo mount (reload)', () => {
    const cols = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ];
    const { result, unmount } = renderHook(() => useTableColumns(cols, 'testDragOrderPersist'));
    act(() => result.current.moveColumn('c', 'a'));
    expect(result.current.orderedVisibleColumns).toEqual(['c', 'a', 'b']);
    unmount();

    const { result: reloaded } = renderHook(() => useTableColumns(cols, 'testDragOrderPersist'));
    expect(reloaded.current.orderedVisibleColumns).toEqual(['c', 'a', 'b']);
  });

  it('SortableHeader dispara onMoveColumn no drop, com a chave arrastada e a de destino', () => {
    const events: Array<[string, string]> = [];
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader colKey="a" label="A" onMoveColumn={(drag, drop) => events.push([drag, drop])} />
            <SortableHeader colKey="b" label="B" onMoveColumn={(drag, drop) => events.push([drag, drop])} />
          </tr>
        </thead>
      </table>,
    );

    const thA = screen.getByText('A').closest('th')!;
    const thB = screen.getByText('B').closest('th')!;

    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: '',
      dropEffect: '',
      setData(k: string, v: string) { this.data[k] = v; },
      getData(k: string) { return this.data[k]; },
    };

    fireEvent.dragStart(thA, { dataTransfer });
    fireEvent.dragOver(thB, { dataTransfer });
    fireEvent.drop(thB, { dataTransfer });

    expect(events).toEqual([['a', 'b']]);
  });
});
