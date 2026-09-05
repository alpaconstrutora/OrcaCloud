// @vitest-environment jsdom
/**
 * A precisão do MOVER não pode depender do zoom.
 *
 * O defeito, relatado em 28/08/2026: com a Grade em "automática" o passo de
 * encaixe vinha de `passoAdaptativo(escala)`. Afastar a vista levava o passo a
 * 500 mm, 1 m, 2 m — e o arraste passava a andar de metro em metro, sem nada na
 * tela dizendo por quê. Quem estava movendo lia isso como imprecisão da
 * ferramenta.
 *
 * Aqui trava-se o contrato: `passoMoverMm` manda no deslocamento, e a Grade
 * continua mandando no TRAÇADO. Sem estes testes, uma linha trocando
 * `passoDeMover` por `passoEfetivo` desfaz a correção sem nada acusar.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { emptyModel, applyCommand, point } from '../../utils/blueprintKernel';
import type { BlueprintModel } from '../../utils/blueprintKernel';

/** Sala de 6 × 3 m, em eixos. */
function sala(): BlueprintModel {
  const H = 2800;
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const levelId = m.levels[0].id;
  const cantos = [
    [0, 0, 6000, 0],
    [6000, 0, 6000, 3000],
    [6000, 3000, 0, 3000],
    [0, 3000, 0, 0],
  ];
  for (const [ax, ay, bx, by] of cantos) {
    m = applyCommand(m, {
      type: 'AddWall',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      thicknessMm: 150,
      heightMm: H,
    }).model;
  }
  return m;
}

const model = sala();
const parede = model.walls[0].id;

function montar(passoMoverMm: number | null, onMoverSelecao: ReturnType<typeof vi.fn>) {
  render(
    <BlueprintCanvas
      model={model}
      tool="selecionar"
      levelId={model.levels[0].id}
      selectedIds={[parede]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      // Grade GROSSA de propósito: é o estado do defeito — vista afastada, passo
      // de 1 m. Se o mover seguisse a grade, nada abaixo de 1 m se moveria.
      passoGradeMm={1000}
      escala={0.05}
      dx={0}
      dy={0}
      passoMoverMm={passoMoverMm}
      onMoverSelecao={onMoverSelecao}
    />,
  );
}

/**
 * As setas do teclado e o arraste passam pelo MESMO `comitarDeslocamento`, e
 * por isso a seta serve de sonda para o passo do arraste também.
 *
 * `fireEvent.keyDown` em vez de `userEvent.type`: aquele clica no elemento
 * antes de digitar, e o clique passa por `setPointerCapture`, que jsdom não
 * implementa — o gesto de teclado não precisa do de ponteiro para ser testado.
 */
function seta(key: string, shiftKey = false) {
  fireEvent.keyDown(document.querySelector('canvas')!, { key, shiftKey });
}

describe('precisão do mover', () => {
  let onMoverSelecao: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMoverSelecao = vi.fn();
    // jsdom não implementa ResizeObserver, e o canvas o usa para acompanhar o
    // tamanho do container.
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('com precisão manual de 10 mm, a seta anda 10 mm — mesmo com a grade em 1 m', () => {
    montar(10, onMoverSelecao);
    seta('ArrowRight');

    expect(onMoverSelecao).toHaveBeenCalledTimes(1);
    // A ordem dos argumentos é (paredes, limites, estruturas, ÁGUAS, delta) —
    // as estruturas entraram no kernel 0.9.0 e as águas no 0.12.0; o delta é
    // sempre o ÚLTIMO, e é isso que os casos abaixo leem.
    const [ids, limites, estruturas, aguas, delta] = onMoverSelecao.mock.calls[0];
    expect(aguas).toEqual([]);
    expect(ids).toEqual([parede]);
    expect(limites).toEqual([]);
    expect(estruturas).toEqual([]);
    expect(delta).toEqual({ x: 10, y: 0 });
  });

  it('sem precisão manual, o passo continua sendo o da grade — nada muda para quem não pediu', () => {
    montar(null, onMoverSelecao);
    seta('ArrowRight');

    expect(onMoverSelecao.mock.calls[0][4]).toEqual({ x: 1000, y: 0 });
  });

  it('Shift multiplica por 10 o passo do MOVER, não o da grade', () => {
    montar(25, onMoverSelecao);
    seta('ArrowUp', true);

    expect(onMoverSelecao.mock.calls[0][4]).toEqual({ x: 0, y: 250 });
  });

  it('1 mm é aceito — é o piso do kernel, que só guarda milímetro inteiro', () => {
    montar(1, onMoverSelecao);
    seta('ArrowLeft');

    expect(onMoverSelecao.mock.calls[0][4]).toEqual({ x: -1, y: 0 });
  });

  it('a precisão manual NÃO mexe no traçado: o rodapé segue anunciando a grade', () => {
    montar(10, onMoverSelecao);
    // Duas informações distintas no mesmo rodapé, e é essa distinção que o
    // usuário precisa ler: encaixa o desenho em 1 m, desloca em 10 mm.
    expect(screen.getByText(/grade 1 m/)).toBeInTheDocument();
    expect(screen.getByText(/mover 10 mm/)).toBeInTheDocument();
  });
});
