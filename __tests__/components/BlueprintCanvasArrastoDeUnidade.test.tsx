// @vitest-environment jsdom
/**
 * AS UNIDADES NA PLANTA BAIXA (28/10/2026): *"Implemente uma terceira forma de posicionar as unidades além das setas e
 * da posição. Essa terceira forma seria clicar, segurar e arrastar para a posição desejada na planta"*. Apertar sobre a
 * fatia de uma unidade e soltar sobre outra do mesmo bloco chama `onArrastarUnidade(bloco, de, para)`; clicar sem
 * arrastar seleciona o bloco e chama `onClicarUnidade`; sem as unidades na planta, o bloco se arrasta como antes.
 *
 * Vista inicial do canvas: escala 0,05 px/mm, origem a 60 px (`MARGEM_INICIAL_PX`).
 */
import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintCanvas, { type UnidadesDoBlocoNaPlanta } from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

const ESCALA = 0.05;
const MARGEM = 60;
const naTela = (p: { x: number; y: number }) => ({ clientX: p.x * ESCALA + MARGEM, clientY: -p.y * ESCALA + MARGEM });

function cena(): BlueprintModel {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  return applyBatch(a, [
    { type: 'AddBloco', levelId: t, nome: 'Torre B', pontos: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 20000 }, { x: 0, y: 20000 }], cotaBaseMm: 0, pavimentos: 4, peDireitoMm: 3000, uso: 'RESIDENCIAL' } as Command,
  ]).model;
}

/** Duas fatias: 105 embaixo (y 0–10 m) e 108 em cima (y 10–20 m). */
function unidades(m: BlueprintModel): UnidadesDoBlocoNaPlanta[] {
  const b = m.blocos![0];
  return [
    {
      blocoId: b.id,
      levelId: b.levelId,
      pavimento: '2º pavimento — Pavimento 1',
      fatias: [
        { chave: 'u105', nome: '105', anel: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }], selecionada: false },
        { chave: 'u108', nome: '108', anel: [{ x: 0, y: 10000 }, { x: 10000, y: 10000 }, { x: 10000, y: 20000 }, { x: 0, y: 20000 }], selecionada: false },
      ],
    },
  ];
}

function Invólucro(props: { model: BlueprintModel; unidadesNaPlanta: UnidadesDoBlocoNaPlanta[] | null; onArrastar: ReturnType<typeof vi.fn>; onClicar: ReturnType<typeof vi.fn>; onMoverSelecao: ReturnType<typeof vi.fn>; onSel: ReturnType<typeof vi.fn> }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <BlueprintCanvas
      model={props.model}
      tool="selecionar"
      levelId={props.model.levels[0].id}
      selectedIds={sel}
      onSelecionar={(ids) => {
        props.onSel(ids);
        setSel(ids);
      }}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={100}
      escala={ESCALA}
      dx={0}
      dy={0}
      onMoverSelecao={props.onMoverSelecao}
      unidadesNaPlanta={props.unidadesNaPlanta}
      onArrastarUnidade={props.onArrastar}
      onClicarUnidade={props.onClicar}
    />
  );
}

describe('BlueprintCanvas · arrastar as unidades do bloco', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  const montar = (comUnidades = true) => {
    const m = cena();
    const fns = { onArrastar: vi.fn(), onClicar: vi.fn(), onMoverSelecao: vi.fn(), onSel: vi.fn() };
    const r = render(<Invólucro model={m} unidadesNaPlanta={comUnidades ? unidades(m) : null} {...fns} />);
    const c = r.container.querySelector('canvas')!;
    (c as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (c as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
    return { c, m, ...fns };
  };
  const gesto = (c: HTMLCanvasElement, de: { x: number; y: number }, para: { x: number; y: number }) => {
    const a = naTela(de);
    const b = naTela(para);
    fireEvent.pointerDown(c, { button: 0, pointerId: 1, ...a });
    fireEvent.pointerMove(c, { pointerId: 1, buttons: 1, clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
    fireEvent.pointerMove(c, { pointerId: 1, buttons: 1, ...b });
    fireEvent.pointerUp(c, { button: 0, pointerId: 1, ...b });
  };

  it('⚠️ PRONTO QUANDO: soltar a 105 sobre a 108 troca as duas — e o bloco não anda', () => {
    const { c, m, onArrastar, onMoverSelecao } = montar();
    gesto(c, { x: 5000, y: 5000 }, { x: 5000, y: 15000 });
    expect(onArrastar).toHaveBeenCalledWith(m.blocos![0].id, 'u105', 'u108');
    expect(onMoverSelecao).not.toHaveBeenCalled();
  });

  it('soltar sobre a própria unidade (ou fora do bloco) não troca nada', () => {
    const { c, onArrastar } = montar();
    gesto(c, { x: 5000, y: 5000 }, { x: 6000, y: 6000 });
    gesto(c, { x: 5000, y: 5000 }, { x: 30000, y: 5000 });
    expect(onArrastar).not.toHaveBeenCalled();
  });

  it('clicar sem arrastar seleciona o bloco e a unidade', () => {
    const { c, m, onArrastar, onClicar, onSel } = montar();
    gesto(c, { x: 5000, y: 15000 }, { x: 5000, y: 15000 });
    expect(onArrastar).not.toHaveBeenCalled();
    expect(onSel).toHaveBeenCalledWith([m.blocos![0].id]);
    expect(onClicar).toHaveBeenCalledWith(m.blocos![0].id, 'u108');
  });

  it('sem as unidades na planta (Exibir desligado), apertar no bloco é o gesto de sempre — nada de unidade', () => {
    const { c, onArrastar, onClicar, onSel, m } = montar(false);
    gesto(c, { x: 5000, y: 5000 }, { x: 5000, y: 15000 });
    expect(onArrastar).not.toHaveBeenCalled();
    expect(onClicar).not.toHaveBeenCalled();
    expect(onSel).toHaveBeenCalledWith([m.blocos![0].id]);
  });
});
