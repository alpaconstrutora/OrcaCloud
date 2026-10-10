// @vitest-environment jsdom
/**
 * C11 (10/10/2026): a LINHA FRIGORÍGENA em par (líquido e sucção) aparece como
 * DOIS tubos — na planta (dois traços paralelos) e no 3D da tela (dois
 * cilindros) —, na mesma conta do IFC (`parDaLinha`). Antes a tela mostrava um
 * tubo só, e o par existia apenas no arquivo. Contexto 2D falso por Proxy que
 * grava as chamadas (molde: `BlueprintCanvasIncendio.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel, point, type BlueprintModel, type Command, type Trecho } from '../../utils/blueprintKernel';
import { cilindroDoTrecho, cilindrosDoTrecho, parDaLinha, parDaLinhaEmPlanta } from '../../utils/blueprintRede';
import { parDaLinha as parDoIfc } from '../../utils/blueprintIfc';

function cena(comSuccao: boolean): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  return applyCommand(m, { type: 'AddTrecho', levelId: l, disciplina: 'FRIGORIGENA', a: point(0, 0), b: point(4000, 0), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, ...(comSuccao ? { bitolaSuccaoMm: 10 } : {}), isolamentoMm: 9 } as Command).model;
}

describe('C11 · a geometria do par', () => {
  const t = cena(true).trechos![0] as Trecho;

  it('em planta: dois eixos a ±19 mm (maior raio do envelope 14 + 5), com o diâmetro do envelope; o IFC usa a mesma conta', () => {
    expect(parDoIfc).toBe(parDaLinha);
    const par = parDaLinhaEmPlanta(t)!;
    expect(par.map((x) => [x.a.x, x.a.y, x.b.x, x.b.y, x.diametroMm])).toEqual([
      [0, -19, 4000, -19, 24],
      [0, 19, 4000, 19, 28],
    ]);
    // Na prumada os dois ficam lado a lado em X.
    const prumada = parDaLinhaEmPlanta({ ...t, b: t.a, cotaAMm: 0, cotaBMm: 2800 })!;
    expect(prumada.map((x) => [x.a.x, x.a.y])).toEqual([[-19, 0], [19, 0]]);
    // Sem sucção declarada, ou fora da linha frigorígena, não é par.
    expect(parDaLinhaEmPlanta({ ...t, bitolaSuccaoMm: undefined })).toBeNull();
    expect(parDaLinhaEmPlanta({ ...t, disciplina: 'DRENO_AC' })).toBeNull();
  });

  it('no 3D: dois cilindros deslocados para os lados do eixo (Z do 3D é o Y da planta), com o raio do envelope; o resto, um só', () => {
    const um = cilindroDoTrecho(t, 0);
    const dois = cilindrosDoTrecho(t, 0);
    expect(dois).toHaveLength(2);
    expect(dois.map((c) => [c.centro[0], c.centro[1], Math.round(c.centro[2] * 1e6) / 1e6, c.raioM])).toEqual([
      [um.centro[0], um.centro[1], -0.019, 0.012],
      [um.centro[0], um.centro[1], 0.019, 0.014],
    ]);
    expect(dois.every((c) => c.comprimentoM === um.comprimentoM && c.eixo.join() === um.eixo.join())).toBe(true);
    expect(cilindrosDoTrecho({ ...t, bitolaSuccaoMm: undefined }, 0)).toHaveLength(1);
  });
});

describe('C11 · a planta desenha os dois tubos', () => {
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

  const desenhar = (m: BlueprintModel) =>
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
        escala={1}
        dx={0}
        dy={0}
      />,
    );

  /**
   * Os traços horizontais do trecho, fora da grade (a grade vai de borda a borda do canvas). O
   * canvas ENQUADRA o desenho (o trecho de 4 m não sai com 4000 px), então a prova é PROPORCIONAL:
   * a distância entre os dois traços ÷ o comprimento deles = 38 mm ÷ 4000 mm.
   */
  const tracosDoTrecho = () => {
    const out: { y: number; comprimento: number }[] = [];
    chamadas.forEach((c, i) => {
      if (c.metodo !== 'moveTo') return;
      const prox = chamadas[i + 1];
      if (prox?.metodo !== 'lineTo') return;
      const [x0, y0] = c.args as number[];
      const [x1, y1] = prox.args as number[];
      const daGrade = x0 === 0 || x1 === 800 || y0 === 0 || y1 === 600;
      if (!daGrade && y0 === y1 && Math.abs(x1 - x0) > 50) out.push({ y: y0, comprimento: Math.abs(x1 - x0) });
    });
    return out;
  };

  it('⚠️ PRONTO QUANDO: com sucção declarada saem DOIS traços paralelos, afastados 2 × 19 mm na escala do desenho', () => {
    desenhar(cena(true));
    const tracos = tracosDoTrecho();
    const alturas = [...new Set(tracos.map((x) => x.y))].sort((a, b) => a - b);
    expect(alturas).toHaveLength(2);
    expect((alturas[1] - alturas[0]) / tracos[0].comprimento).toBeCloseTo(38 / 4000, 4);
  });

  it('controle: sem sucção (um tubo só) não há o par de traços', () => {
    desenhar(cena(false));
    expect(tracosDoTrecho()).toHaveLength(0);
  });
});
