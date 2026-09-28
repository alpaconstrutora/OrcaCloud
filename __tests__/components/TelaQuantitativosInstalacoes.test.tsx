// @vitest-environment jsdom
/**
 * Aba INSTALAÇÕES por pavimento (28/09/2026, E0.2 do roadmap hidrossanitário):
 * o filtro de pavimento recorta a rede, e a caixa d'água sai pelo volume, fora
 * da lista de pontos.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TelaQuantitativos from '../../components/blueprint/TelaQuantitativos';
import { POLITICA_PADRAO, applyBatch, applyCommand, computeQuantities, emptyModel, point } from '../../utils/blueprintKernel';

function sobrado() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [terreo, superior] = m.levels.map((l) => l.id);
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: superior, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 1000 },
    { type: 'AddTerminal', levelId: terreo, disciplina: 'AGUA_FRIA', tipo: 'Caixa', at: point(0, 500), cotaMm: 0, tipoHidraulico: 'RESERVATORIO', volumeL: 500 },
    { type: 'AddTerminal', levelId: terreo, disciplina: 'AGUA_FRIA', tipo: 'Aquecedor', at: point(900, 500), cotaMm: 1600, tipoHidraulico: 'AQUECEDOR' },
    { type: 'AddTrecho', levelId: terreo, disciplina: 'AGUA_FRIA', a: point(0, 500), b: point(3000, 500), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'AddTrecho', levelId: superior, disciplina: 'AGUA_FRIA', a: point(0, 0), b: point(1000, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 32 },
  ]).model;
  return m;
}

describe('TelaQuantitativos › Instalações', () => {
  it("caixa d'água pelo volume (família Reservatório), aquecedor como Equipamento, e o filtro de pavimento recorta", async () => {
    const m = sobrado();
    render(
      <TelaQuantitativos model={m} quant={computeQuantities(m, POLITICA_PADRAO)} revisao={1} oficial={null} gerando={false} onGerar={() => {}} dirty={false} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /instalações/i }));
    const linha = (texto: RegExp) => screen.getAllByRole('row').find((r) => texto.test(r.textContent ?? ''));
    expect(linha(/Caixa d'água 1\.000 L/)).toHaveTextContent('Reservatório');
    expect(linha(/Caixa d'água 500 L/)).toBeTruthy();
    expect(linha(/Aquecedor/)).toHaveTextContent('Equipamento');
    expect(linha(/DN 25|Tubo água fria/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Filtrar por pavimento'), m.levels[1].id);
    expect(linha(/Caixa d'água 1\.000 L/)).toBeTruthy();
    expect(linha(/Caixa d'água 500 L/)).toBeUndefined();
    expect(linha(/Aquecedor/)).toBeUndefined();
    // Só o tubo do superior (DN 32) fica.
    const tubos = screen.getAllByRole('row').filter((r) => /Tubo água fria/.test(r.textContent ?? ''));
    expect(tubos).toHaveLength(1);
    expect(within(tubos[0]).getByText('32')).toBeTruthy();
  });
});
