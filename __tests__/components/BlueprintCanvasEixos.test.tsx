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
});
