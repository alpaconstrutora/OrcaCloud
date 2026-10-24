// @vitest-environment jsdom
/**
 * 24/10/2026 — o eletroduto elétrico é desenhado em ARCO ("Curvas, como no seu print"): o projeto de
 * referência do usuário traça o eletroduto do teto como um arco suave, que é a convenção. É DESENHO
 * (o modelo segue reto), e o clique segue a geometria desenhada: o meio da CURVA seleciona o trecho,
 * o meio da RETA (a corda) não. Contexto 2D falso por Proxy que grava as chamadas (molde:
 * `BlueprintCanvasAnotacoesEletricas.test.tsx`); cliques como em `BlueprintCanvasArrastePeca.test.tsx`.
 *
 * Vista inicial do canvas: escala 0,05 px/mm, origem a 60 px (`MARGEM_INICIAL_PX`); y do modelo sobe.
 * Trecho de 4 m: flecha de 300 mm (teto) = 15 px, acima do alcance do clique (8 px).
 */
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

const ESCALA = 0.05;
const MARGEM = 60;
const naTela = (p: { x: number; y: number }) => ({ clientX: p.x * ESCALA + MARGEM, clientY: -p.y * ESCALA + MARGEM });

function cena(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  const trecho = (disciplina: string, y: number): Command =>
    ({ type: 'AddTrecho', levelId, disciplina, a: point(0, y), b: point(4000, y), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25, circuitoIds: [] }) as Command;
  // Um elétrico (arco) e, bem longe dele, um de água fria (reto, como sempre foi).
  return applyBatch(m, [trecho('ELETRICA', 0), trecho('AGUA_FRIA', 6000)]).model;
}

describe('BlueprintCanvas · o eletroduto elétrico em arco', () => {
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
        if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 });
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
    cleanup();
    HTMLCanvasElement.prototype.getContext = original;
  });

  const montar = (m: BlueprintModel, onSelecionar: (ids: string[]) => void = () => {}) => {
    const r = render(
      <BlueprintCanvas
        model={m}
        tool="selecionar"
        levelId={m.levels[0].id}
        selectedIds={[]}
        onSelecionar={onSelecionar}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={100}
        escala={ESCALA}
        dx={0}
        dy={0}
      />,
    );
    const c = r.container.querySelector('canvas')!;
    (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (c as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
    return c;
  };
  const clicar = (c: HTMLCanvasElement, mundo: { x: number; y: number }) => {
    const p = naTela(mundo);
    fireEvent.pointerDown(c, { button: 0, pointerId: 1, ...p });
    fireEvent.pointerUp(c, { button: 0, pointerId: 1, ...p });
  };

  it('o trecho elétrico é desenhado com quadraticCurveTo, e o de água continua reto', () => {
    montar(cena());
    const inicio = chamadas.map((c) => c.metodo).lastIndexOf('clearRect');
    const doQuadro = chamadas.slice(inicio);
    // O traço reto também passa por `quadraticCurveTo` (com o controle na corda): o que importa é o
    // controle FORA da corda — só o elétrico o tem.
    const curvas = doQuadro.filter((c) => c.metodo === 'quadraticCurveTo').map((c) => c.args as number[]);
    const yDaCorda = naTela(point(0, 0)).clientY;
    const emArco = curvas.filter(([, cy, , qy]) => Math.abs(cy - qy) > 1); // trechos horizontais: controle fora da corda = arco
    expect(emArco).toHaveLength(1);
    // Ponto de controle: a 2 × flecha (600 mm = 30 px) acima da corda, no meio dela (y de tela cresce para baixo).
    const [cx, cy, qx, qy] = emArco[0];
    const meioX = (naTela(point(0, 0)).clientX + naTela(point(4000, 0)).clientX) / 2;
    expect(cx).toBeCloseTo(meioX, 6);
    expect(cy).toBeCloseTo(yDaCorda - 30, 6);
    expect(qx).toBeCloseTo(naTela(point(4000, 0)).clientX, 6);
    expect(qy).toBeCloseTo(yDaCorda, 6);
    // E o de água fria, longe dali, segue reto: o controle fica na corda dele.
    const yDaAgua = naTela(point(0, 6000)).clientY;
    expect(curvas.some(([, cy2, , qy2]) => Math.abs(cy2 - yDaAgua) < 1e-6 && Math.abs(qy2 - yDaAgua) < 1e-6)).toBe(true);
    expect(curvas).toHaveLength(2);
  });

  it('o clique no MEIO DA CURVA seleciona o trecho; no meio da reta (a corda), não', () => {
    const m = cena();
    const eletrico = m.trechos!.find((t) => t.disciplina === 'ELETRICA')!;
    const onSelecionar = vi.fn();
    const c = montar(m, onSelecionar);
    // A reta: o meio da corda, 15 px abaixo do arco — fora do alcance (8 px).
    clicar(c, { x: 2000, y: 0 });
    expect(onSelecionar).not.toHaveBeenCalledWith([eletrico.id]);
    // A curva: o meio do arco, 300 mm acima da corda (flecha no teto).
    onSelecionar.mockClear();
    clicar(c, { x: 2000, y: 300 });
    expect(onSelecionar).toHaveBeenCalledWith([eletrico.id]);
  });
});
