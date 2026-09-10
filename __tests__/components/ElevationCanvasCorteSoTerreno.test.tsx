// @vitest-environment jsdom
/**
 * O corte de um estudo SÓ COM LOTE e topografia (10/09/2026).
 *
 * Visto dirigindo a produção: sem parede nenhuma, a vista de corte mostrava
 * "Nada para mostrar — desenhe paredes" por cima do perfil do terreno que já
 * estava desenhado. O harness não pegou porque tinha casa. A guarda de vazio
 * precisa saber do perfil, como já sabia da estrutura.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ElevationCanvas from '../../components/blueprint/ElevationCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type Command,
  type Point,
} from '../../utils/blueprintKernel';

// jsdom não tem ResizeObserver; o canvas mede o container com ele ao montar.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverFalso;

function loteComCorte() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const cantos = [point(0, 0), point(12000, 0), point(12000, 30000), point(0, 30000)];
  const lados: Command[] = cantos.map((a, i) => ({
    type: 'AddBoundary',
    levelId,
    a,
    b: cantos[(i + 1) % 4],
    kind: 'TERRENO',
  }));
  let model = applyBatch(base.model, lados).model;
  model = applyCommand(model, { type: 'AddCorte', a: point(-2000, 15000), b: point(14000, 15000) }).model;
  return model;
}

describe('ElevationCanvas · corte só com terreno', () => {
  it('com perfil do terreno, NÃO diz "desenhe paredes"', () => {
    const model = loteComCorte();
    render(
      <ElevationCanvas
        model={model}
        direcao="FRENTE"
        corte={model.sections[0]}
        terreno={{ cotaEmM: (p: Point) => 100 + p.x / 100000, cotaZeroM: 100 }}
        terrenoChave="x"
      />,
    );
    expect(screen.queryByText(/Nada para mostrar/)).toBeNull();
  });

  it('sem terreno e sem parede, continua dizendo', () => {
    const model = loteComCorte();
    render(<ElevationCanvas model={model} direcao="FRENTE" corte={model.sections[0]} />);
    expect(screen.getByText(/Nada para mostrar/)).toBeTruthy();
  });
});
