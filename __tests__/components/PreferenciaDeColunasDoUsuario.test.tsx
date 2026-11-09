// @vitest-environment jsdom
/**
 * Colunas visíveis + ordem + ordenação salvas no USUÁRIO (banco), 09/11/2026 —
 * Meus Fornecedores. Plano: docs/planos/2026-11-09-fornecedores-colunas-salvas-e-filtro-e-ou.md
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../../services/tableColumnPreferencesService', () => ({ tableColumnPreferencesService: banco }));
vi.mock('../../store/useStore', () => ({
  useStore: (sel: (s: unknown) => unknown) => sel({ currentProfile: { email: 'Fulano@Empresa.com' } }),
}));

import { useTableColumns } from '../../components/ui/TableUtils';
import { usePreferenciaDeColunasDoUsuario } from '../../hooks/usePreferenciaDeColunasDoUsuario';

const COLS = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];
function useTela(chave: string) {
  const t = useTableColumns(COLS, chave);
  usePreferenciaDeColunasDoUsuario(t, chave);
  return t;
}
const esperar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  localStorage.clear();
  banco.get.mockReset();
  banco.save.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
});

describe('usePreferenciaDeColunasDoUsuario', () => {
  it('a escolha do banco vence a do navegador', async () => {
    localStorage.setItem('k1', JSON.stringify({ visibleColumns: ['a', 'b', 'c'], columnOrder: ['a', 'b', 'c'], knownColumns: ['a', 'b', 'c'] }));
    banco.get.mockResolvedValue({ visibleColumns: ['c', 'a'], sortColumn: 'a', sortDirection: 'desc', columnOrder: ['c', 'b', 'a'], knownColumns: ['a', 'b', 'c'] });
    const { result } = renderHook(() => useTela('k1'));
    await esperar(0);
    expect(banco.get).toHaveBeenCalledWith('Fulano@Empresa.com', 'k1');
    expect(result.current.orderedVisibleColumns).toEqual(['c', 'a']);
    expect(result.current.sortDirection).toBe('desc');
  });

  it('mudar coluna ou arrastar grava sozinho, uma vez por rajada, com a ordem junto', async () => {
    banco.get.mockResolvedValue(null);
    const { result } = renderHook(() => useTela('k2'));
    await esperar(0);
    await esperar(1000);
    banco.save.mockClear(); // 1ª gravação = o que o navegador tinha (linha nova no banco)

    act(() => result.current.toggleColumn('b'));
    act(() => result.current.moveColumn('c', 'a', 'antes'));
    await esperar(1000);
    expect(banco.save).toHaveBeenCalledTimes(1);
    expect(banco.save).toHaveBeenCalledWith('Fulano@Empresa.com', 'k2', expect.objectContaining({
      visibleColumns: ['a', 'c'],
      columnOrder: ['c', 'a', 'b'],
      knownColumns: ['a', 'b', 'c'],
    }));
  });

  it('leitura que falha NÃO grava — não apaga a escolha feita em outro computador', async () => {
    banco.get.mockRejectedValue(new Error('rede'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useTela('k3'));
    await esperar(0);
    act(() => result.current.toggleColumn('b'));
    await esperar(2000);
    expect(banco.save).not.toHaveBeenCalled();
  });
});
