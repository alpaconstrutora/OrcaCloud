// @vitest-environment jsdom
/**
 * 25/11/2026: o platô DESENHADO (reel "Terrain Modification Tool"; plano
 * docs/planos/2026-11-25-planta-plato-desenhado-3d.md, Tarefa 2). O desenho mora em `anel_desenhado`, à parte do
 * `anel_plato` (o anel em uso, sobrescrito a cada troca de base): trocar de base e voltar não o perde.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const salvos: Record<string, unknown>[] = [];
const get = vi.fn(async (): Promise<unknown> => null);
vi.mock('../../services/blueprintTerraplenagemService', () => ({
  blueprintTerraplenagemService: {
    get: (...a: unknown[]) => get(...(a as [])),
    save: vi.fn(async (_s: string, _o: string, premissa: Record<string, unknown>) => {
      salvos.push(premissa);
      return premissa;
    }),
  },
}));

import { useBlueprintTerraplenagem } from '../../hooks/useBlueprintTerraplenagem';

const QUADRADO = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }, { x: 0, y: 8000 }];
const PENTAGONO = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 12000, y: 5000 }, { x: 6000, y: 9000 }, { x: 0, y: 6000 }];

async function montar() {
  const r = renderHook(() => useBlueprintTerraplenagem('st1', 'org1'));
  await waitFor(() => expect(r.result.current.carregando).toBe(false));
  return r;
}
const esperarGravacao = () =>
  act(async () => {
    vi.advanceTimersByTime(600);
  });

describe('useBlueprintTerraplenagem — o platô desenhado', () => {
  beforeEach(() => {
    salvos.length = 0;
    get.mockReset();
    get.mockImplementation(async () => null);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('definirAnelDesenhado grava base DESENHADO com o desenho nas duas colunas (arredondado a mm)', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado([{ x: 0.4, y: 0 }, ...QUADRADO.slice(1)]));
    expect(result.current.base).toBe('DESENHADO');
    expect(result.current.anelDesenhado).toEqual(QUADRADO);
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'DESENHADO', anel_desenhado: QUADRADO, anel_plato: QUADRADO });
  });

  it('trocar para o lote e voltar a DESENHADO mantém o desenho', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.definirAnelEmUso([{ x: -1000, y: -1000 }, { x: 20000, y: -1000 }, { x: 20000, y: 20000 }]));
    act(() => result.current.setBase('LOTE'));
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'LOTE', anel_desenhado: QUADRADO });
    act(() => result.current.setBase('DESENHADO'));
    await esperarGravacao();
    expect(result.current.anelDesenhado).toEqual(QUADRADO);
    expect(salvos.at(-1)).toMatchObject({ base: 'DESENHADO', anel_desenhado: QUADRADO, anel_plato: QUADRADO });
  });

  it('redesenhar com outro número de lados zera os taludes/muros por lado e avisa; mesmo número mantém', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.setParametros({ taludePorAresta: [null, { muro: true }, null, null] }));
    act(() => result.current.definirAnelDesenhado(QUADRADO.map((p) => ({ x: p.x + 500, y: p.y }))));
    expect(result.current.parametros.taludePorAresta).toEqual([null, { muro: true }, null, null]);
    expect(result.current.avisoDosLados).toBeNull();
    act(() => result.current.definirAnelDesenhado(PENTAGONO));
    expect(result.current.parametros.taludePorAresta ?? []).toEqual([]);
    expect(result.current.avisoDosLados).toEqual({ de: 4, para: 5 });
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'DESENHADO', talude_por_aresta: [] });
    act(() => result.current.esquecerAvisoDosLados());
    expect(result.current.avisoDosLados).toBeNull();
  });

  it('com a base DESENHADO, o restaurar do Ctrl+Z da casa não mexe no platô', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.setCotaPlatoM(101));
    await esperarGravacao();
    const antes = salvos.length;
    act(() => result.current.restaurarPlato({ base: 'ENVELOPE', cotaPlatoM: 99, inclinacao: null, anelPlato: null, taludePorAresta: [] }));
    await esperarGravacao();
    expect(result.current.base).toBe('DESENHADO');
    expect(result.current.cotaPlatoM).toBe(101);
    expect(salvos).toHaveLength(antes);
  });

  it('linha lida do banco: o desenho volta de anel_desenhado', async () => {
    get.mockImplementation(async () => ({ base: 'DESENHADO', anel_plato: QUADRADO, anel_desenhado: QUADRADO, cota_plato_m: 100, talude_por_aresta: [] }));
    const { result } = await montar();
    expect(result.current.base).toBe('DESENHADO');
    expect(result.current.anelDesenhado).toEqual(QUADRADO);
    // O `anel_plato` dessa linha é o desenho, não um platô da casa: "Sob a casa" não pode aparecer por ele.
    expect(result.current.anelPlato).toBeNull();
  });

  it('excluirAnelDesenhado apaga o desenho e, se ele estava em uso, a forma volta para o envelope', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    await esperarGravacao();
    act(() => result.current.excluirAnelDesenhado());
    expect(result.current.anelDesenhado).toBeNull();
    expect(result.current.base).toBe('ENVELOPE');
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'ENVELOPE', anel_desenhado: null });
  });

  it('excluir o desenho EM USO solta a cota fixa (volta a equilíbrio) — a cota do desenho no envelope aplainava o lote', async () => {
    // Pedido 25/11/2026: *"quando deletei o plato ... foi junto todo o relevo"* — a base voltou ao envelope (≈ o lote
    // inteiro) com a cota 883,90 do desenho, e o lote todo virou platô.
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.setCotaPlatoM(883.9));
    await esperarGravacao();
    act(() => result.current.excluirAnelDesenhado());
    expect(result.current.cotaPlatoM).toBeNull();
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'ENVELOPE', anel_desenhado: null, cota_plato_m: null });
  });

  it('excluir o desenho guardado com o LOTE em uso não mexe na cota do lote', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.setBase('LOTE'));
    act(() => result.current.setCotaPlatoM(870));
    act(() => result.current.excluirAnelDesenhado());
    expect(result.current.cotaPlatoM).toBe(870);
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'LOTE', cota_plato_m: 870 });
  });

  it('excluir com outra forma em uso (lote) apaga o desenho e mantém o lote', async () => {
    const { result } = await montar();
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    act(() => result.current.setBase('LOTE'));
    act(() => result.current.excluirAnelDesenhado());
    expect(result.current.base).toBe('LOTE');
    await esperarGravacao();
    expect(salvos.at(-1)).toMatchObject({ base: 'LOTE', anel_desenhado: null });
  });

  it('banco sem a coluna (migration não aplicada): o get falha → persistência indisponível, e o desenho fica na tela', async () => {
    get.mockImplementation(async () => {
      throw new Error('column blueprint_study_terraplenagem.anel_desenhado does not exist');
    });
    const { result } = await montar();
    expect(result.current.persistenciaIndisponivel).toBe(true);
    act(() => result.current.definirAnelDesenhado(QUADRADO));
    expect(result.current.anelDesenhado).toEqual(QUADRADO);
    expect(result.current.base).toBe('DESENHADO');
  });
});
