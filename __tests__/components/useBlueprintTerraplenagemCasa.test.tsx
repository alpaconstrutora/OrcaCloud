// @vitest-environment jsdom
/**
 * F25 da casa automática (18/10/2026): o platô sob a casa na premissa de terraplenagem do estudo — base CASA com o
 * anel gravado (migration `aplicar_20271018310000`); o anel em uso na tela vai junto da próxima mudança explícita, e
 * nunca grava sozinho.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const salvos: Record<string, unknown>[] = [];
vi.mock('../../services/blueprintTerraplenagemService', () => ({
  blueprintTerraplenagemService: {
    get: vi.fn(async () => null),
    save: vi.fn(async (_s: string, _o: string, premissa: Record<string, unknown>) => {
      salvos.push(premissa);
      return premissa;
    }),
  },
}));

import { anelDaColuna, useBlueprintTerraplenagem } from '../../hooks/useBlueprintTerraplenagem';

describe('anelDaColuna', () => {
  it('lista de ≥ 3 pontos numéricos → o anel; o resto → null', () => {
    expect(anelDaColuna([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(anelDaColuna(null)).toBeNull();
    expect(anelDaColuna([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    expect(anelDaColuna([{ x: 0, y: 0 }, { x: 'a', y: 1 }, { x: 2, y: 2 }])).toBeNull();
  });
});

describe('useBlueprintTerraplenagem — o platô da casa (F25)', () => {
  beforeEach(() => {
    salvos.length = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('aplicarPlatoDaCasa grava a base CASA com o anel, a cota e os muros por aresta', async () => {
    const { result } = renderHook(() => useBlueprintTerraplenagem('st1', 'org1'));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    const anel = [{ x: 400, y: 1900 }, { x: 11600, y: 1900 }, { x: 11600, y: 16950 }, { x: 400, y: 16950 }];
    act(() => result.current.aplicarPlatoDaCasa({ anel, cotaPlatoM: 100.942, taludePorAresta: [null, { muro: true }, null, { muro: true }] }));
    expect(result.current.base).toBe('CASA');
    expect(result.current.anelPlato).toEqual(anel);
    expect(result.current.cotaPlatoM).toBe(100.942);
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({ base: 'CASA', cota_plato_m: 100.942, anel_plato: anel, talude_por_aresta: [null, { muro: true }, null, { muro: true }] });
  });

  it('o anel em uso não grava por si; vai junto da próxima mudança explícita (envelope/lote)', async () => {
    const { result } = renderHook(() => useBlueprintTerraplenagem('st1', 'org1'));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    act(() => result.current.definirAnelEmUso([{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 24000 }]));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(salvos).toHaveLength(0);
    act(() => result.current.setCotaPlatoM(101));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({ base: 'ENVELOPE', cota_plato_m: 101, anel_plato: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 24000 }] });
  });
});
