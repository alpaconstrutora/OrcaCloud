// @vitest-environment jsdom
/**
 * 25/11/2026, o reel da Hektar: *"ao passar o mouse mostre o valor de cada linha"*. Na planta, com a
 * ferramenta Selecionar e as curvas à vista, passar o mouse sobre uma curva mostra a cota dela no
 * formato da planta ("885,00"), num rótulo que segue o cursor. O `curvaSob` roda uma vez por quadro
 * (rAF): aqui os quadros são disparados à mão.
 *
 * Vista inicial do canvas: escala 0,05 px/mm, origem a 60 px (ver `BlueprintCanvasArrastePeca`).
 */
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel } from '../../utils/blueprintKernel';
import type { CurvaDeNivel } from '../../utils/blueprintTopografia';

const ESCALA = 0.05;
const MARGEM = 60;
const naTela = (p: { x: number; y: number }) => ({ clientX: p.x * ESCALA + MARGEM, clientY: -p.y * ESCALA + MARGEM });

const CURVAS: CurvaDeNivel[] = [
  { cotaM: 885, mestra: true, fechada: false, pontos: [{ x: 0, y: 1000 }, { x: 5000, y: 1000 }] },
  { cotaM: 886, mestra: false, fechada: false, pontos: [{ x: 0, y: 4000 }, { x: 5000, y: 4000 }] },
];

let quadros: FrameRequestCallback[] = [];
const rodarQuadros = () =>
  act(() => {
    const q = quadros;
    quadros = [];
    q.forEach((cb) => cb(0));
  });

function montar(props: { tool?: string; comClique?: boolean } = {}) {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const r = render(
    <BlueprintCanvas
      model={m}
      tool={(props.tool ?? 'selecionar') as never}
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
      curvasDeNivel={CURVAS}
      // O editor só passa o clique da curva com as curvas à vista (Exibir › Curvas de nível).
      onClicarCurva={props.comClique === false ? undefined : () => {}}
    />,
  );
  const c = r.container.querySelector('canvas')!;
  const rotulo = r.getByTestId('rotulo-curva-sob-o-mouse');
  return { c, rotulo };
}

const mover = (c: HTMLCanvasElement, p: { x: number; y: number }) => fireEvent.pointerMove(c, { pointerId: 1, ...naTela(p) });

describe('BlueprintCanvas · a cota da curva sob o mouse', () => {
  beforeEach(() => {
    quadros = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      quadros.push(cb);
      return quadros.length;
    };
    globalThis.cancelAnimationFrame = () => {};
  });
  afterEach(cleanup);

  it('⚠️ PRONTO QUANDO: sobre a curva, o rótulo mostra a cota como a planta escreve (885,00)', () => {
    const { c, rotulo } = montar();
    expect(rotulo.className).toContain('hidden');
    mover(c, { x: 2500, y: 1000 });
    rodarQuadros();
    expect(rotulo.textContent).toBe('885,00');
    expect(rotulo.className).not.toContain('hidden');
    // O rótulo anda com o cursor (transform), ao lado dele.
    const { clientX, clientY } = naTela({ x: 2500, y: 1000 });
    expect(rotulo.style.transform).toBe(`translate(${Math.round(clientX + 12)}px, ${Math.round(clientY - 28)}px)`);
  });

  it('passa de uma curva a outra; longe de todas, o rótulo some', () => {
    const { c, rotulo } = montar();
    mover(c, { x: 2500, y: 4000 });
    rodarQuadros();
    expect(rotulo.textContent).toBe('886,00');
    mover(c, { x: 2500, y: 2500 }); // 75 px de cada curva
    rodarQuadros();
    expect(rotulo.className).toContain('hidden');
  });

  it('vários movimentos no mesmo quadro: um `curvaSob` só, com o ÚLTIMO ponteiro', () => {
    const { c, rotulo } = montar();
    mover(c, { x: 1000, y: 4000 });
    mover(c, { x: 2000, y: 2500 });
    mover(c, { x: 3000, y: 1000 });
    expect(quadros).toHaveLength(1);
    rodarQuadros();
    expect(rotulo.textContent).toBe('885,00');
  });

  it('o mouse sai do canvas: o rótulo some', () => {
    const { c, rotulo } = montar();
    mover(c, { x: 2500, y: 1000 });
    rodarQuadros();
    fireEvent.pointerLeave(c);
    expect(rotulo.className).toContain('hidden');
  });

  it('com as curvas ocultas (sem o clique da curva) ou outra ferramenta, não há hover', () => {
    const oculta = montar({ comClique: false });
    mover(oculta.c, { x: 2500, y: 1000 });
    rodarQuadros();
    expect(oculta.rotulo.className).toContain('hidden');
    cleanup();
    const parede = montar({ tool: 'parede' });
    mover(parede.c, { x: 2500, y: 1000 });
    rodarQuadros();
    expect(parede.rotulo.className).toContain('hidden');
  });
});
