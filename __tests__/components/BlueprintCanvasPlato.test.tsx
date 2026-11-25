// @vitest-environment jsdom
/**
 * 25/11/2026: a ferramenta "Platô" na planta (plano docs/planos/2026-11-25-planta-plato-desenhado-3d.md,
 * Tarefa 4): clica os cantos; fecha no 1º canto ou com duplo clique; menos de 3 pontos distintos não grava; a
 * trava de 90° vale por padrão (Shift libera), como no Perfil.
 *
 * Vista inicial do canvas: escala 0,05 px/mm, origem a 60 px (ver `BlueprintCanvasArrastePeca`). A grade de 100 mm
 * encaixa os cliques — os pontos usados são múltiplos de 1000.
 */
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel } from '../../utils/blueprintKernel';

const ESCALA = 0.05;
const MARGEM = 60;
const naTela = (p: { x: number; y: number }) => ({ clientX: p.x * ESCALA + MARGEM, clientY: -p.y * ESCALA + MARGEM });

function montar(onPlatoDesenhado: ReturnType<typeof vi.fn>) {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const r = render(
    <BlueprintCanvas
      model={m}
      tool={'plato' as never}
      levelId={m.levels[0].id}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={100}
      escala={ESCALA}
      dx={0}
      dy={0}
      ortogonal
      onPlatoDesenhado={onPlatoDesenhado}
    />,
  );
  const c = r.container.querySelector('canvas')!;
  (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  return c;
}

function clicar(c: HTMLCanvasElement, p: { x: number; y: number }, shift = false) {
  const t = naTela(p);
  fireEvent.pointerMove(c, { pointerId: 1, shiftKey: shift, ...t });
  fireEvent.pointerDown(c, { button: 0, pointerId: 1, shiftKey: shift, ...t });
  fireEvent.pointerUp(c, { button: 0, pointerId: 1, shiftKey: shift, ...t });
}
const duplo = (c: HTMLCanvasElement, p: { x: number; y: number }) => fireEvent.doubleClick(c, naTela(p));

describe('BlueprintCanvas · ferramenta Platô', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(cleanup);

  it('⚠️ PRONTO QUANDO: 4 cantos + clique no 1º fecha o contorno com os 4 pontos', () => {
    const fn = vi.fn();
    const c = montar(fn);
    const cantos = [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: -6000 }, { x: 0, y: -6000 }];
    cantos.forEach((p) => clicar(c, p));
    clicar(c, cantos[0]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual(cantos);
  });

  it('3 cantos + duplo clique fecha com 3 pontos', () => {
    const fn = vi.fn();
    const c = montar(fn);
    clicar(c, { x: 0, y: 0 });
    clicar(c, { x: 8000, y: 0 });
    clicar(c, { x: 8000, y: -6000 });
    duplo(c, { x: 8000, y: -6000 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toHaveLength(3);
  });

  it('cliques repetidos no mesmo lugar (só 2 pontos distintos) + duplo clique: não grava', () => {
    const fn = vi.fn();
    const c = montar(fn);
    clicar(c, { x: 0, y: 0 });
    clicar(c, { x: 8000, y: 0 });
    clicar(c, { x: 8000, y: 0 });
    duplo(c, { x: 8000, y: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('a trava de 90° vale por padrão; com Shift o canto fica onde foi clicado', () => {
    const travado = vi.fn();
    let c = montar(travado);
    clicar(c, { x: 0, y: 0 });
    clicar(c, { x: 8000, y: -1000 }); // quase horizontal → vira (8000, 0)
    clicar(c, { x: 8000, y: -6000 });
    duplo(c, { x: 8000, y: -6000 });
    expect(travado.mock.calls[0][0][1]).toEqual({ x: 8000, y: 0 });
    cleanup();
    const livre = vi.fn();
    c = montar(livre);
    clicar(c, { x: 0, y: 0 });
    clicar(c, { x: 8000, y: -1000 }, true);
    clicar(c, { x: 8000, y: -6000 }, true);
    duplo(c, { x: 8000, y: -6000 });
    expect(livre.mock.calls[0][0][1]).toEqual({ x: 8000, y: -1000 });
  });
});
