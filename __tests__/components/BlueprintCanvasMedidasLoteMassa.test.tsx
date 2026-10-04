// @vitest-environment jsdom
/**
 * MEDIDAS DO LOTE E DA MASSA (04/10/2026) — *"veja print. o desenho gerado atraves do menu terreno Lote e massa nao
 * tem medidas"*. O canvas escreve os lados do lote (com o papel), os lados de cada bloco e o afastamento de cada bloco
 * até as divisas — por FORA do contorno — com o item "Medidas do lote e da massa" (ligado por padrão), independente
 * de "Medidas das paredes". Contexto 2D falso por Proxy que grava as chamadas (molde: `BlueprintCanvasIncendio.test.tsx`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';

/** Lote 12 × 30 com os quatro papéis e uma torre 10 × 20 a 1 m das laterais, 4 m da frente e 6 m dos fundos. */
function cena(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA') =>
    ({ type: 'AddBoundary', levelId: l, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel }) as const;
  return applyBatch(m, [
    d(0, 0, 12000, 0, 'FRENTE'),
    d(12000, 0, 12000, 30000, 'LATERAL_DIREITA'),
    d(12000, 30000, 0, 30000, 'FUNDOS'),
    d(0, 30000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: l, nome: 'Torre', pontos: [point(1000, 4000), point(11000, 4000), point(11000, 24000), point(1000, 24000)], pavimentos: 4 },
  ]).model;
}

describe('BlueprintCanvas · medidas do lote e da massa', () => {
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

  /** Onde o `rotuloDoTraco` ancorou o texto: o último `translate` antes do `fillText` dele. */
  function ancoraDe(texto: string): { x: number; y: number } {
    const i = chamadas.findIndex((c) => c.metodo === 'fillText' && c.args[0] === texto);
    expect(i).toBeGreaterThanOrEqual(0);
    for (let k = i; k >= 0; k -= 1) {
      if (chamadas[k].metodo === 'translate') return { x: Number(chamadas[k].args[0]), y: Number(chamadas[k].args[1]) };
    }
    throw new Error(`sem translate antes de ${texto}`);
  }

  it('por padrão (sem "Medidas das paredes"): os lados do lote com o papel, os lados do bloco e os afastamentos', () => {
    desenhar(cena());
    const t = textos();
    expect(t).toEqual(expect.arrayContaining(['frente 12,00 m', 'fundos 12,00 m', 'lat. dir. 30,00 m', 'lat. esq. 30,00 m']));
    // O canvas desenha a cena mais de uma vez ao montar (medida do contêiner): conta-se por desenho.
    const desenhos = t.filter((x) => x === 'frente 12,00 m').length;
    expect(desenhos).toBeGreaterThan(0);
    const porDesenho = (x: string) => t.filter((y) => y === x).length / desenhos;
    // Lados do bloco: 10 m (frente e fundos do bloco) e 20 m (laterais).
    expect(porDesenho('10,00 m')).toBe(2);
    expect(porDesenho('20,00 m')).toBe(2);
    // Afastamentos: 1 m de cada lateral, 4 m da frente, 6 m dos fundos.
    expect(porDesenho('1,00 m')).toBe(2);
    expect(porDesenho('4,00 m')).toBe(1);
    expect(porDesenho('6,00 m')).toBe(1);
  });

  it('⚠️ o lado do lote sai POR FORA do lote', () => {
    desenhar(cena());
    const pontos = ['frente 12,00 m', 'fundos 12,00 m', 'lat. dir. 30,00 m', 'lat. esq. 30,00 m'].map(ancoraDe);
    // Os quatro rótulos, simétricos, têm o centro no centro do lote (600 × 1500 px na escala 0,05).
    const cx = pontos.reduce((s, p) => s + p.x, 0) / 4;
    const cy = pontos.reduce((s, p) => s + p.y, 0) / 4;
    const [frente, fundos, dir, esq] = pontos;
    // Por fora: além da metade da profundidade (750 px) e da metade da frente (300 px). Por dentro ficariam aquém.
    expect(Math.abs(frente.y - cy)).toBeGreaterThan(750);
    expect(Math.abs(fundos.y - cy)).toBeGreaterThan(750);
    expect(Math.abs(dir.x - cx)).toBeGreaterThan(300);
    expect(Math.abs(esq.x - cx)).toBeGreaterThan(300);
  });

  it('desligado ("Medidas do lote e da massa" e "Medidas das paredes"), nenhuma dessas medidas', () => {
    desenhar(cena(), { mostrarMedidasLoteMassa: false, mostrarMedidasParedes: false });
    const t = textos();
    for (const x of ['frente 12,00 m', '10,00 m', '20,00 m', '1,00 m', '4,00 m', '6,00 m']) expect(t).not.toContain(x);
  });

  it('só "Medidas das paredes" continua mostrando os lados do lote, como antes', () => {
    desenhar(cena(), { mostrarMedidasLoteMassa: false, mostrarMedidasParedes: true });
    const t = textos();
    expect(t).toContain('frente 12,00 m');
    expect(t).not.toContain('4,00 m');
  });
});
