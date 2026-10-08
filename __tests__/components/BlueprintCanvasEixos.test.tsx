// @vitest-environment jsdom
/**
 * EIXOS NO CANVAS (07/10/2026) — *"opção de exibir ou não eixos"*: com `mostrarEixos` desligado o eixo não é
 * desenhado (nem a bolha com o nome); a prévia da gaveta "Eixos automáticos" desenha a bolha e o nome do eixo
 * proposto. Contexto 2D falso por Proxy que grava as chamadas (molde: `BlueprintCanvasMedidasLoteMassa.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';

function cena(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return applyBatch(m, [
    { type: 'AddEixo', a: point(0, -3000), b: point(0, 9000) }, // vertical → "A"
    { type: 'AddEixo', a: point(-3000, 6000), b: point(9000, 6000) }, // horizontal → "1"
  ]).model;
}

describe('BlueprintCanvas · eixos', () => {
  type Chamada = { metodo: string; args: unknown[] };
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
          chamadas.push({ metodo: String(prop), args });
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
    HTMLCanvasElement.prototype.getContext = original;
  });

  const desenhar = (m: BlueprintModel, extra: Partial<React.ComponentProps<typeof BlueprintCanvas>> = {}) =>
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
        passoGradeMm={200}
        escala={0.05}
        dx={0}
        dy={0}
        {...extra}
      />,
    );

  const textos = () => chamadas.filter((c) => c.metodo === 'fillText').map((c) => String(c.args[0]));

  it('o eixo vertical nasce "A" e o horizontal "1"; cada um com a bolha nas duas pontas', () => {
    const m = cena();
    expect(m.eixos.map((e) => e.nome)).toEqual(['A', '1']);
    desenhar(m);
    const t = textos();
    expect(t.filter((x) => x === 'A').length).toBeGreaterThan(0);
    expect(t.filter((x) => x === 'A').length % 2).toBe(0);
    expect(t.filter((x) => x === '1').length).toBe(t.filter((x) => x === 'A').length);
  });

  it('"Eixos" desligado: nem a linha nem a bolha', () => {
    desenhar(cena(), { mostrarEixos: false });
    const t = textos();
    expect(t).not.toContain('A');
    expect(t).not.toContain('1');
  });

  it('a prévia da gaveta desenha a bolha e o nome do eixo proposto (mesmo com os eixos do modelo ocultos)', () => {
    desenhar(cena(), { mostrarEixos: false, eixosPrevistos: [{ a: point(4000, -3000), b: point(4000, 9000), nome: 'B' }] });
    const t = textos();
    expect(t.filter((x) => x === 'B').length).toBeGreaterThan(0);
    expect(t).not.toContain('A');
  });

  /**
   * 08/10/2026 — *"cotas e eixo se sobrepondo. eixos devem ficar mais externos"*. Lote 10 × 30 (cotas por fora, ligadas
   * por padrão) e um eixo que passa só 0,5 m além: na escala 0,05 o fim dele (y = −1525 px) cai dentro da faixa das
   * cotas (o total a 32 px da divisa, a chamada a 36 px). A bolha tem de sair por fora: centro além de −1536 − 8 − 12.
   */
  it('a bolha fica POR FORA das cotas do lote, mesmo com o eixo curto', () => {
    const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m0.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO' }) as const;
    const m = applyBatch(m0, [d(0, 0, 10000, 0), d(10000, 0, 10000, 30000), d(10000, 30000, 0, 30000), d(0, 30000, 0, 0), { type: 'AddEixo', a: point(0, -500), b: point(0, 30500) }]).model;
    desenhar(m);
    const ys = chamadas.filter((c) => c.metodo === 'fillText' && c.args[0] === 'A').map((c) => Number(c.args[2]));
    expect(ys.length).toBeGreaterThan(0);
    const topo = Math.min(...ys);
    const base = Math.max(...ys);
    // A vista não nasce na origem: mede-se a DISTÂNCIA entre as bolhas. O lote tem 1500 px; cada bolha fica a
    // 36 (cota + chamada) + 8 (respiro) + 12 (raio + folga) px da divisa. Sem a correção seriam 1550 + 2 × 12 = 1574.
    expect(base - topo).toBeGreaterThanOrEqual(1500 + 2 * (36 + 8 + 12) - 1e-6);
  });
});
