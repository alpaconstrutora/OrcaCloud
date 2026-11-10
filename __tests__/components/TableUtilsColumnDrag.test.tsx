// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useTableColumns, SortableHeader, moverColuna } from '../../components/ui/TableUtils';

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

// 09/11/2026, Meus Fornecedores: "a posição das colunas não está mantendo". Arrastar
// para a DIREITA soltava a coluna DEPOIS da coluna-alvo, com a linha azul de "solte
// aqui" desenhada ANTES dela. Agora o cabeçalho diz o lado (metade do <th> em que o
// mouse está) e a coluna cai exatamente ali.
describe('moverColuna / SortableHeader — a coluna cai do lado que a linha azul mostra', () => {
  beforeEach(() => localStorage.clear());

  it('moverColuna com lado, nos dois sentidos', () => {
    const ordem = ['a', 'b', 'c', 'd'];
    // para a direita
    expect(moverColuna(ordem, 'a', 'c', 'antes')).toEqual(['b', 'a', 'c', 'd']);
    expect(moverColuna(ordem, 'a', 'c', 'depois')).toEqual(['b', 'c', 'a', 'd']);
    expect(moverColuna(ordem, 'a', 'd', 'depois')).toEqual(['b', 'c', 'd', 'a']);
    // para a esquerda
    expect(moverColuna(ordem, 'd', 'b', 'antes')).toEqual(['a', 'd', 'b', 'c']);
    expect(moverColuna(ordem, 'd', 'b', 'depois')).toEqual(['a', 'b', 'd', 'c']);
    expect(moverColuna(ordem, 'd', 'a', 'antes')).toEqual(['d', 'a', 'b', 'c']);
    // sem lado = comportamento antigo (ocupa o índice do alvo)
    expect(moverColuna(ordem, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    // soltar sobre si mesma ou chave desconhecida não mexe
    expect(moverColuna(ordem, 'b', 'b', 'antes')).toBe(ordem);
    expect(moverColuna(ordem, 'x', 'b', 'antes')).toBe(ordem);
  });

  it('SortableHeader passa o lado pela metade do cabeçalho em que o mouse solta', () => {
    const events: Array<[string, string, string | undefined]> = [];
    const onMove = (drag: string, drop: string, lado?: string) => events.push([drag, drop, lado]);
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader colKey="a" label="A" onMoveColumn={onMove} />
            <SortableHeader colKey="b" label="B" onMoveColumn={onMove} />
          </tr>
        </thead>
      </table>,
    );
    const thA = screen.getByText('A').closest('th')!;
    const thB = screen.getByText('B').closest('th')!;
    thB.getBoundingClientRect = () => ({ left: 100, width: 200, right: 300, top: 0, bottom: 30, height: 30, x: 100, y: 0, toJSON: () => ({}) });
    const dt = () => ({
      data: {} as Record<string, string>, effectAllowed: '', dropEffect: '',
      setData(k: string, v: string) { this.data[k] = v; }, getData(k: string) { return this.data[k]; },
    });

    // jsdom não tem DragEvent: o clientX do init se perde — define no próprio evento.
    const comX = (ev: Event, x: number) => { Object.defineProperty(ev, 'clientX', { value: x }); return ev; };

    const d1 = dt();
    fireEvent.dragStart(thA, { dataTransfer: d1 });
    fireEvent(thB, comX(createEvent.dragOver(thB, { dataTransfer: d1 }), 120));
    expect(thB.className).toContain('before:left-0');
    fireEvent(thB, comX(createEvent.drop(thB, { dataTransfer: d1 }), 120));

    const d2 = dt();
    fireEvent.dragStart(thA, { dataTransfer: d2 });
    fireEvent(thB, comX(createEvent.dragOver(thB, { dataTransfer: d2 }), 280));
    expect(thB.className).toContain('before:right-0');
    fireEvent(thB, comX(createEvent.drop(thB, { dataTransfer: d2 }), 280));

    expect(events).toEqual([['a', 'b', 'antes'], ['a', 'b', 'depois']]);
  });

  it('aplicarPreferencia (vinda do banco) passa pela mesma mescla: coluna nova entra ao lado da vizinha', () => {
    const cols = [
      { key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'novo', label: 'Novo' }, { key: 'c', label: 'C' },
    ];
    const { result } = renderHook(() => useTableColumns(cols, 'testAplicarPreferencia'));
    // gravada antes de a coluna "novo" existir, com 'a' oculta e ordem c, a, b
    act(() => result.current.aplicarPreferencia({
      visibleColumns: ['b', 'c'], sortColumn: 'c', sortDirection: 'desc',
      knownColumns: ['a', 'b', 'c'], columnOrder: ['c', 'a', 'b'],
    }));
    expect(result.current.orderedVisibleColumns).toEqual(['c', 'b', 'novo']);
    expect(result.current.columnOrder).toEqual(['c', 'a', 'b', 'novo']);
    expect(result.current.sortColumn).toBe('c');
    expect(result.current.sortDirection).toBe('desc');
    // linha gravada antes da ordem existir no banco (column_order NULL): ordem default
    act(() => result.current.aplicarPreferencia({ visibleColumns: ['a', 'c'], sortColumn: null, sortDirection: 'asc' }));
    // (sem known_columns, as visíveis são as conhecidas — b e novo entram como novas)
    expect(result.current.orderedVisibleColumns).toEqual(['a', 'b', 'novo', 'c']);
  });
});
