// @vitest-environment jsdom
/**
 * O controle "N tomadas → Distribuir" e a pendência das sugeridas (10/09/2026).
 *
 * *"um campo para que o usuário possa decidir a quantidade de tomadas por
 * ambiente e por parede e depois ele move para o local que ele deseja"*
 *
 * ⚠️ O que se prova aqui é o CONTRATO com quem clica: o N digitado é o N que
 * chega; zero criadas diz "sem parede livre" em vez de silêncio; a parede com
 * duas faces pergunta de que lado; e o painel de elétrica conta as sugeridas e
 * oferece "Aceitar todas" — com e sem quadro no desenho.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DistribuirTomadas, { TomadasNaParede } from '../../components/blueprint/DistribuirTomadas';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';
import type { LadoDaParede } from '../../utils/blueprintDistribuicao';

describe('DistribuirTomadas', () => {
  it('o N digitado é o N que chega, e a resposta fala em SUGERIDAS', async () => {
    const onDistribuir = vi.fn(() => 4);
    render(<DistribuirTomadas escopo="neste ambiente" onDistribuir={onDistribuir} />);
    const campo = screen.getByLabelText('Quantidade de tomadas neste ambiente');
    await userEvent.clear(campo);
    await userEvent.type(campo, '4');
    await userEvent.click(screen.getByRole('button', { name: /Distribuir/ }));
    expect(onDistribuir).toHaveBeenCalledWith(4);
    expect(screen.getByRole('status').textContent).toMatch(/4 tomadas sugeridas/);
    expect(screen.getByRole('status').textContent).not.toMatch(/criadas/);
  });

  it('⚠️ zero criadas NÃO é silêncio: diz que não há parede livre', async () => {
    render(<DistribuirTomadas escopo="nesta parede" onDistribuir={() => 0} />);
    await userEvent.click(screen.getByRole('button', { name: /Distribuir/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Sem parede livre/);
  });
});

const face = (spaceId: string, ambiente: string, x: number): LadoDaParede => ({
  a: point(x, 75),
  b: point(x, 3925),
  wallId: 'w-meio',
  spaceId,
  ambiente,
});

describe('TomadasNaParede', () => {
  it('⚠️ parede entre dois ambientes pergunta DE QUE LADO — e manda só essa face', async () => {
    const onDistribuir = vi.fn(() => 2);
    render(
      <TomadasNaParede
        lados={[face('s1', 'Sala', 3925), face('s2', 'Cozinha', 4075)]}
        onDistribuir={onDistribuir}
      />,
    );
    const seletor = screen.getByLabelText('Face da parede onde distribuir as tomadas');
    await userEvent.selectOptions(seletor, 's2');
    await userEvent.click(screen.getByRole('button', { name: /Distribuir/ }));
    const [lados, n] = onDistribuir.mock.calls[0] as unknown as [LadoDaParede[], number];
    expect(n).toBe(2);
    expect(lados).toHaveLength(1);
    expect(lados[0].spaceId).toBe('s2');
  });

  it('uma face só: sem seletor', () => {
    render(<TomadasNaParede lados={[face('s1', 'Sala', 3925)]} onDistribuir={() => 1} />);
    expect(screen.queryByLabelText('Face da parede onde distribuir as tomadas')).toBeNull();
    expect(screen.getByRole('button', { name: /Distribuir/ })).toBeTruthy();
  });

  it('parede que não fecha ambiente: explica, sem botão', () => {
    render(<TomadasNaParede lados={[]} onDistribuir={() => 1} />);
    expect(screen.getByText(/não fecha nenhum ambiente/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Distribuir/ })).toBeNull();
  });
});

function cenaComSugeridas(comQuadro: boolean): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;
  if (comQuadro) {
    m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600 })
      .model;
  }
  for (const x of [1000, 2000]) {
    m = applyCommand(m, {
      type: 'AddTerminal',
      levelId,
      disciplina: 'ELETRICA',
      tipo: 'TUG',
      at: point(x, 75),
      cotaMm: 300,
      tipoEletrico: 'TUG',
      sugerida: true,
    }).model;
  }
  return m;
}

describe('PainelEletrica · a pendência das sugeridas', () => {
  it.each([true, false])('conta e oferece "Aceitar todas" (com quadro: %s)', async (comQuadro) => {
    const onAceitar = vi.fn();
    render(
      <PainelEletrica
        model={cenaComSugeridas(comQuadro)}
        onAddCircuito={() => {}}
        onCircuitoProps={() => {}}
        onAceitarSugeridas={onAceitar}
      />,
    );
    expect(screen.getByText(/tomadas sugeridas/).textContent).toMatch(/2/);
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar todas' }));
    expect(onAceitar).toHaveBeenCalledTimes(1);
  });

  it('sem sugeridas, nada disso aparece', () => {
    const m = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    render(
      <PainelEletrica model={m} onAddCircuito={() => {}} onCircuitoProps={() => {}} onAceitarSugeridas={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Aceitar todas' })).toBeNull();
  });
});
