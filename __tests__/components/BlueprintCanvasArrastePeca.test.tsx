// @vitest-environment jsdom
/**
 * 11/10/2026 (teste do usuário no app real): "não consigo mover a condensadora e/ou o
 * split". Duas causas, reproduzidas no rascunho dele:
 *  - apertar e arrastar uma peça NÃO selecionada só a selecionava (a convenção do CAD,
 *    pensada para a parede) — o arraste exigia um segundo gesto. Pedido: "Direto nas
 *    peças": equipamento/ponto, quadro, louça/móvel se arrastam no primeiro aperto; a
 *    geometria segue a convenção;
 *  - o ponto de força nascia no CENTRO da evaporadora: o aperto no meio dela pegava o
 *    ponto escondido. Agora o ponto fica ao lado (ver `blueprintEncostoEvaporadora`).
 *
 * O invólucro guarda a seleção como o editor guarda: `onSelecionar` troca `selectedIds`.
 * Vista inicial do canvas: escala 0,05 px/mm, origem a 60 px (`MARGEM_INICIAL_PX`).
 */
import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { pontoEletricoDaEvaporadora } from '../../utils/blueprintPontosHidraulicos';

const ESCALA = 0.05;
const MARGEM = 60;
const naTela = (p: { x: number; y: number }) => ({ clientX: p.x * ESCALA + MARGEM, clientY: -p.y * ESCALA + MARGEM });

function cena(): BlueprintModel {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyBatch(m, [
    // A condensadora do lado de fora da parede sul, sugerida (como o gerador a lança).
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(3000, -600), cotaMm: 350, larguraMm: 850, profundidadeMm: 330, alturaMm: 700, sugerida: true } as Command,
    // A evaporadora encostada na face interna da parede norte (y = 4000 − 75 − 110).
    { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(3000, 3815), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300, rotacaoGraus: 180 } as Command,
  ]).model;
  const ev = m.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
  // O ponto de força dela, pela regra de agora (ao lado, na face).
  return applyBatch(m, pontoEletricoDaEvaporadora(m, ev, 3)).model;
}

function Invólucro({ model, onMoverSelecao, inicial = [] }: { model: BlueprintModel; onMoverSelecao: ReturnType<typeof vi.fn>; inicial?: string[] }) {
  const [sel, setSel] = useState<string[]>(inicial);
  return (
    <BlueprintCanvas
      model={model}
      tool="selecionar"
      levelId={model.levels[0].id}
      selectedIds={sel}
      onSelecionar={setSel}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={100}
      escala={ESCALA}
      dx={0}
      dy={0}
      onMoverSelecao={onMoverSelecao}
    />
  );
}

function arrastar(c: HTMLCanvasElement, de: { x: number; y: number }, dxPx: number, dyPx: number) {
  const p = naTela(de);
  fireEvent.pointerDown(c, { button: 0, pointerId: 1, ...p });
  fireEvent.pointerMove(c, { pointerId: 1, buttons: 1, clientX: p.clientX + dxPx, clientY: p.clientY + dyPx });
  fireEvent.pointerUp(c, { button: 0, pointerId: 1, clientX: p.clientX + dxPx, clientY: p.clientY + dyPx });
}

describe('BlueprintCanvas · a peça se arrasta no primeiro aperto', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  const montar = (m: BlueprintModel, onMoverSelecao: ReturnType<typeof vi.fn>, inicial?: string[]) => {
    const r = render(<Invólucro model={m} onMoverSelecao={onMoverSelecao} inicial={inicial} />);
    const c = r.container.querySelector('canvas')!;
    (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (c as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
    return { c, r };
  };

  it('⚠️ PRONTO QUANDO: a condensadora NÃO selecionada anda no primeiro arraste — e só ela', () => {
    const m = cena();
    const cd = m.terminais!.find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const onMover = vi.fn();
    const { c } = montar(m, onMover);
    arrastar(c, cd.at, 40, 0);
    expect(onMover).toHaveBeenCalledTimes(1);
    const [, , , , delta, rede] = onMover.mock.calls[0];
    expect(rede.terminalIds).toEqual([cd.id]);
    expect(delta.x).toBeGreaterThan(0);
  });

  it('a evaporadora pelo CENTRO: é ela que anda, não o ponto de força (que agora fica ao lado)', () => {
    const m = cena();
    const ev = m.terminais!.find((x) => x.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const onMover = vi.fn();
    const { c } = montar(m, onMover);
    arrastar(c, ev.at, -30, 0);
    expect(onMover.mock.calls[0][5].terminalIds).toEqual([ev.id]);
  });

  it('um clique sem andar só seleciona — nada se grava', () => {
    const m = cena();
    const cd = m.terminais!.find((x) => x.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    const onMover = vi.fn();
    const { c } = montar(m, onMover);
    arrastar(c, cd.at, 0, 0);
    expect(onMover).not.toHaveBeenCalled();
  });

  it('a PAREDE segue a convenção do CAD: não selecionada, o arraste só a seleciona; selecionada, anda', () => {
    const m = cena();
    const sul = m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const meio = { x: 1500, y: 0 };
    const onMover = vi.fn();
    const { c, r } = montar(m, onMover);
    arrastar(c, meio, 0, 40);
    expect(onMover).not.toHaveBeenCalled();
    r.unmount();
    const onMover2 = vi.fn();
    const segunda = montar(m, onMover2, [sul.id]);
    arrastar(segunda.c, meio, 0, 40);
    expect(onMover2).toHaveBeenCalledTimes(1);
    expect(onMover2.mock.calls[0][0]).toEqual([sul.id]);
  });
});
