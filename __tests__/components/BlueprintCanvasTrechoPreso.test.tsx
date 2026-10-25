// @vitest-environment jsdom
/**
 * 25/10/2026, com print: *"é possivel arrastar um trecho do eletroduto e desconecta-lo"*. O trecho
 * preso a peças nas duas pontas não se solta mais (`deslocamentoDasPontasPresas`), então arrastar
 * não o move — e a barra de dicas diz por quê, em vez de o gesto parecer travado.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';

function cena(): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  return applyBatch(m, [
    { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', at: point(0, 0), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO' },
    { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(3000, 0), cotaMm: 300, tipoEletrico: 'TUG' },
    // [0] luz → tomada (preso nas duas pontas); [1] tomada → ponta solta.
    { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2800, cotaBMm: 300, bitolaMm: 20 },
    { type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(3000, 0), b: point(3000, 2000), cotaAMm: 300, cotaBMm: 300, bitolaMm: 20 },
  ] as Command[]).model;
}

const montar = (m: BlueprintModel, sel: string[]) =>
  render(
    <BlueprintCanvas
      model={m}
      tool="selecionar"
      levelId={m.levels[0].id}
      selectedIds={sel}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={100}
      escala={0.05}
      dx={0}
      dy={0}
    />,
  );

describe('BlueprintCanvas · trecho preso nas duas pontas', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('selecionado, a barra diz que ele não se solta e o que mover', () => {
    const m = cena();
    montar(m, [m.trechos![0].id]);
    expect(screen.getByText(/ligado a peças nas duas pontas e não se solta/)).toBeTruthy();
  });

  it('trecho com uma ponta livre: a dica normal de seleção', () => {
    const m = cena();
    montar(m, [m.trechos![1].id]);
    expect(screen.queryByText(/ligado a peças nas duas pontas/)).toBeNull();
    expect(screen.getByText(/Clique para selecionar/)).toBeTruthy();
  });
});
