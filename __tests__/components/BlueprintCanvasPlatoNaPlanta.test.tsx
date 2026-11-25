// @vitest-environment jsdom
/**
 * O PLATÔ NA PLANTA (25/11/2026) — pedido: *"mais um item, o planta não aparece desenhado na planta"*: depois de
 * fechado, a planta só pintava as células de corte/aterro; o contorno do platô sumia. Agora o contorno em uso sai
 * em azul (a cor do platô no 3D), com uma bolinha em cada canto e a cota no meio — o mesmo texto do 3D.
 * Contexto 2D falso por Proxy que grava as chamadas (molde: `BlueprintCanvasMedidasLoteMassa.test.tsx`).
 *
 * Vista inicial: escala 0,05 px/mm, origem a 60 px; Y do desenho para cima = Y da tela para baixo.
 */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point } from '../../utils/blueprintKernel';

type Chamada = { metodo: string; args: unknown[]; traco?: unknown };
const ANEL = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: -6000 },
  { x: 0, y: -6000 },
];
const naTela = (p: { x: number; y: number }) => [p.x * 0.05 + 60, -p.y * 0.05 + 60];

describe('BlueprintCanvas · o platô desenhado aparece na planta', () => {
  let chamadas: Chamada[] = [];
  const original = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    chamadas = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const estado: Record<string | symbol, unknown> = {};
    const ctx: unknown = new Proxy(estado, {
      get(alvo, prop) {
        if (prop in alvo) return alvo[prop];
        if (prop === 'canvas') return { width: 800, height: 600 };
        if (prop === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 });
        if (prop === 'getLineDash') return () => [];
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args, traco: alvo.strokeStyle });
          return { addColorStop() {}, setTransform() {} };
        };
      },
      set(alvo, prop, valor) {
        alvo[prop] = valor;
        return true;
      },
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    cleanup();
    HTMLCanvasElement.prototype.getContext = original;
  });

  const desenhar = (extra: Record<string, unknown> = {}) => {
    // Com LOTE: o desenho do terreno (curvas, corte/aterro, platô) só acontece quando o nível tem divisas.
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m0.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' }) as const;
    const m = applyBatch(m0, [d(-2000, 2000, 10000, 2000), d(10000, 2000, 10000, -8000), d(10000, -8000, -2000, -8000), d(-2000, -8000, -2000, 2000)]).model;
    render(
      <BlueprintCanvas
        model={m}
        tool="selecionar"
        levelId={m.levels[0].id}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={100}
        escala={0.05}
        dx={0}
        dy={0}
        {...(extra as object)}
      />,
    );
  };

  it('⚠️ PRONTO QUANDO: o contorno sai em azul, com uma bolinha em cada canto e a cota escrita', () => {
    desenhar({ platoNaPlanta: { anel: ANEL, texto: '883,90 m' } });
    expect(chamadas.some((c) => c.metodo === 'fillText' && c.args[0] === '883,90 m')).toBe(true);
    expect(chamadas.some((c) => c.metodo === 'stroke' && c.traco === '#2563eb')).toBe(true);
    const arcos = chamadas.filter((c) => c.metodo === 'arc').map((c) => [c.args[0], c.args[1]]);
    for (const p of ANEL) expect(arcos).toContainEqual(naTela(p));
  });

  it('sem platô, nada de cota de platô nem bolinhas nos cantos', () => {
    desenhar();
    expect(chamadas.some((c) => c.metodo === 'fillText' && c.args[0] === '883,90 m')).toBe(false);
    const arcos = chamadas.filter((c) => c.metodo === 'arc').map((c) => [c.args[0], c.args[1]]);
    expect(arcos).not.toContainEqual(naTela(ANEL[1]));
  });
});
