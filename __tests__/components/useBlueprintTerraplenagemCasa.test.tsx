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

import { anelDaColuna, passoDoPlatoDaCasa, useBlueprintTerraplenagem, type PlatoDaCasaLancado } from '../../hooks/useBlueprintTerraplenagem';

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

describe('o platô da casa acompanha o Ctrl+Z (11/11/2026)', () => {
  const anel = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 20000 }, { x: 0, y: 20000 }];
  const gravado = { anel, cotaPlatoM: 100.5, taludePorAresta: [null, { muro: true }, null, null] };
  const anterior = { base: 'ENVELOPE' as const, cotaPlatoM: 99, inclinacao: null, anelPlato: null, taludePorAresta: [] };

  it('passoDoPlatoDaCasa: o 1º modelo novo é o do lote; voltar ao de antes restaura; refazer regrava; outro modelo não mexe', () => {
    const antes = { m: 'antes' };
    const depois = { m: 'depois' };
    const outro = { m: 'outro' };
    let r: PlatoDaCasaLancado<object> = { antes, depois: null, gravado, anterior, ativo: true };
    let p = passoDoPlatoDaCasa(r, antes);
    expect(p).toEqual({ registro: r, acao: null });
    p = passoDoPlatoDaCasa(r, depois);
    expect(p.acao).toBeNull();
    r = p.registro;
    expect(r.depois).toBe(depois);
    expect(passoDoPlatoDaCasa(r, outro).acao).toBeNull();
    p = passoDoPlatoDaCasa(r, antes);
    expect(p.acao).toBe('RESTAURAR');
    r = p.registro;
    expect(r.ativo).toBe(false);
    expect(passoDoPlatoDaCasa(r, antes).acao).toBeNull();
    p = passoDoPlatoDaCasa(r, depois);
    expect(p.acao).toBe('REGRAVAR');
    expect(p.registro.ativo).toBe(true);
  });

  describe('no hook', () => {
    beforeEach(() => {
      salvos.length = 0;
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => vi.useRealTimers());

    it('aplicarPlatoDaCasa devolve o platô de antes; restaurarPlato volta base, cota, anel e muros, e grava', async () => {
      const { result } = renderHook(() => useBlueprintTerraplenagem('st1', 'org1'));
      await waitFor(() => expect(result.current.carregando).toBe(false));
      act(() => result.current.setCotaPlatoM(99));
      let antes!: ReturnType<typeof result.current.aplicarPlatoDaCasa>;
      act(() => {
        antes = result.current.aplicarPlatoDaCasa(gravado);
      });
      expect(antes).toEqual({ base: 'ENVELOPE', cotaPlatoM: 99, inclinacao: null, anelPlato: null, taludePorAresta: [] });
      expect(result.current.base).toBe('CASA');
      act(() => result.current.restaurarPlato(antes));
      expect(result.current.base).toBe('ENVELOPE');
      expect(result.current.cotaPlatoM).toBe(99);
      expect(result.current.anelPlato).toBeNull();
      expect(result.current.parametros.taludePorAresta).toEqual([]);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(salvos.at(-1)).toMatchObject({ base: 'ENVELOPE', cota_plato_m: 99, talude_por_aresta: [] });
    });
  });
});
