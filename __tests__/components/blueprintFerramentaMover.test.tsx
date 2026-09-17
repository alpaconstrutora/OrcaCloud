// @vitest-environment jsdom
/**
 * Ferramenta MOVER (17/09/2026: *"crie botão mover. mesma funcionalidade de
 * mover do botão direito do mouse"*).
 *
 * O que se prova aqui é o GESTO no canvas: com a mão ativa, o botão esquerdo
 * entra em panorâmica (o cursor vira `grabbing`, o mesmo estado que o botão
 * direito já produzia); com a seta, o esquerdo NÃO arrasta a vista. O botão
 * direito continua arrastando em qualquer ferramenta — é regressão a vigiar.
 *
 * A sonda é o `cursor` do canvas porque o deslocamento em si (`dx/dy`) é estado
 * interno e só sai por `onVistaMudou` quando o container tem tamanho, o que o
 * jsdom não dá.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel } from '../../utils/blueprintKernel';
import type { BlueprintTool } from '../../hooks/useBlueprintEditor';

const model = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: 2800,
}).model;

function montar(tool: BlueprintTool) {
  render(
    <BlueprintCanvas
      model={model}
      tool={tool}
      levelId={model.levels[0].id}
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
    />,
  );
  const c = document.querySelector('canvas')!;
  // jsdom não implementa a captura de ponteiro, e a panorâmica a usa.
  (c as any).setPointerCapture = () => {};
  (c as any).releasePointerCapture = () => {};
  return c;
}

const cursor = (c: HTMLCanvasElement) => c.style.cursor;

describe('ferramenta Mover', () => {
  beforeEach(() => {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('com a mão, o botão ESQUERDO arrasta a vista — cursor de mão antes, agarrando durante', () => {
    const c = montar('mover');
    expect(cursor(c)).toBe('grab');
    fireEvent.pointerDown(c, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    expect(cursor(c)).toBe('grabbing');
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 140, clientY: 120, movementX: 40, movementY: 20 });
    expect(cursor(c)).toBe('grabbing');
    fireEvent.pointerUp(c, { button: 0, pointerId: 1 });
    expect(cursor(c)).toBe('grab');
  });

  it('com a seta, o esquerdo NÃO arrasta a vista; o direito continua arrastando em qualquer ferramenta', () => {
    const c = montar('selecionar');
    fireEvent.pointerDown(c, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    expect(cursor(c)).not.toBe('grabbing');
    fireEvent.pointerUp(c, { button: 0, pointerId: 1 });

    fireEvent.pointerDown(c, { button: 2, pointerId: 2, clientX: 100, clientY: 100 });
    expect(cursor(c)).toBe('grabbing');
    fireEvent.pointerUp(c, { button: 2, pointerId: 2 });
  });
});
