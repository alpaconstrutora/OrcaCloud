// @vitest-environment jsdom
/**
 * A COTA DA ORIGEM (12/10/2026): gerar com DEM de satélite preenche "Onde
 * fica › Cota do terreno" quando está vazia — o aviso *"o zero do desenho
 * está na cota média … informe a Cota do terreno"* pedia um número que o app
 * acabara de medir.
 *
 * A Edge Function devolve um PLANO de altitude conhecida (875 m na latitude da
 * origem, subindo 10 m a cada 0,001° para o norte): a cota esperada na origem
 * é exata, e a de qualquer outro ponto é diferente — dá para ver de onde veio.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintTopografiaRow } from '../../types/blueprint';
import type { Georreferencia } from '../../utils/blueprintKernel';

const GEO: Georreferencia = { latitude: -22.6164, longitude: -46.0412 };
const chamadas: { lat: number; lon: number }[][] = [];

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_nome: string, { body }: { body: { coordenadas: { lat: number; lon: number }[] } }) => {
        chamadas.push(body.coordenadas);
        return { data: { elevation: body.coordenadas.map((c) => 875 + (c.lat - GEO.latitude) * 10_000) }, error: null };
      }),
    },
  },
}));
vi.mock('../../services/blueprintLevantamentoService', () => ({
  blueprintLevantamentoService: { get: vi.fn(async () => null), save: vi.fn(async () => null) },
}));
const versoes: BlueprintTopografiaRow[] = [];
vi.mock('../../services/blueprintTopografiaService', () => ({
  blueprintTopografiaService: {
    listar: vi.fn(async () => []),
    criar: vi.fn(async (input: Omit<BlueprintTopografiaRow, 'id' | 'created_by' | 'created_at'>) => {
      const row = { ...input, id: `v${versoes.length + 1}`, created_by: null, created_at: '2026-10-12T00:00:00Z' } as BlueprintTopografiaRow;
      versoes.unshift(row);
      return row;
    }),
    apagar: vi.fn(async () => {}),
  },
}));

const { useBlueprintTopografia } = await import('../../hooks/useBlueprintTopografia');

/** Lote de 300 × 250 m com a origem num canto (dentro da grade). */
const LOTE_NA_ORIGEM = [
  { x: 0, y: 0 },
  { x: 300_000, y: 0 },
  { x: 300_000, y: 250_000 },
  { x: 0, y: 250_000 },
];
/** O mesmo lote a 600 m da origem: (0, 0) fica fora da grade. */
const LOTE_LONGE = LOTE_NA_ORIGEM.map((p) => ({ x: p.x + 600_000, y: p.y + 600_000 }));

async function gerar(anel: { x: number; y: number }[], geo: Georreferencia | null, fonte: 'COPERNICUS_GLO30' | 'PONTOS_COTADOS', onCota: (c: number, f: string) => void) {
  const { result } = renderHook(() => useBlueprintTopografia('s1', 'o1', 'Estudo', anel, geo, onCota));
  await waitFor(() => expect(result.current.carregando).toBe(false));
  act(() => result.current.setFonteCodigo(fonte));
  if (fonte === 'PONTOS_COTADOS') {
    act(() =>
      result.current.definirPontosCotados(
        [
          { x: 0, y: 0, cotaM: 100 },
          { x: 300_000, y: 0, cotaM: 101 },
          { x: 300_000, y: 250_000, cotaM: 103 },
          { x: 0, y: 250_000, cotaM: 102 },
        ],
        null,
        'SUBSTITUIR',
      ),
    );
  }
  await act(async () => {
    await result.current.gerar();
  });
  return result;
}

describe('useBlueprintTopografia · cota da origem pelo DEM', () => {
  beforeEach(() => {
    chamadas.length = 0;
    versoes.length = 0;
  });

  it('Copernicus com "Cota do terreno" vazia: preenche com a altitude NA origem (875,00)', async () => {
    const onCota = vi.fn();
    const r = await gerar(LOTE_NA_ORIGEM, GEO, 'COPERNICUS_GLO30', onCota);
    expect(r.current.erro).toBeNull();
    expect(versoes).toHaveLength(1);
    expect(onCota).toHaveBeenCalledTimes(1);
    expect(onCota.mock.calls[0][0]).toBeCloseTo(875, 2);
    expect(onCota.mock.calls[0][1]).toBe('Copernicus 30 m');
  });

  it('cota já digitada: não mexe', async () => {
    const onCota = vi.fn();
    await gerar(LOTE_NA_ORIGEM, { ...GEO, elevacaoM: 880.5 }, 'COPERNICUS_GLO30', onCota);
    expect(versoes).toHaveLength(1);
    expect(onCota).not.toHaveBeenCalled();
  });

  it('pontos cotados (cota relativa do topógrafo): não preenche', async () => {
    const onCota = vi.fn();
    await gerar(LOTE_NA_ORIGEM, GEO, 'PONTOS_COTADOS', onCota);
    expect(versoes).toHaveLength(1);
    expect(onCota).not.toHaveBeenCalled();
  });

  it('origem fora da grade: pergunta ao DEM só aquele ponto', async () => {
    const onCota = vi.fn();
    await gerar(LOTE_LONGE, GEO, 'COPERNICUS_GLO30', onCota);
    expect(versoes).toHaveLength(1);
    const ultima = chamadas[chamadas.length - 1];
    expect(ultima).toEqual([{ lat: GEO.latitude, lon: GEO.longitude }]);
    expect(onCota.mock.calls[0][0]).toBeCloseTo(875, 2);
  });
});
