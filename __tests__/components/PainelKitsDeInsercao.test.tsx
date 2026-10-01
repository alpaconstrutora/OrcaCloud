// @vitest-environment jsdom
/**
 * INCÊNDIO F2 (01/10/2026): os kits de inserção da organização — lista, salvar a
 * seleção como kit (o botão desligado dizendo por quê) e apagar.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../utils/blueprintKernel';

const listarKits = vi.fn();
const salvarKit = vi.fn();
const apagarKit = vi.fn();
vi.mock('../../services/blueprintKitService', () => ({
  listarKits: (...a: unknown[]) => listarKits(...a),
  salvarKit: (...a: unknown[]) => salvarKit(...a),
  apagarKit: (...a: unknown[]) => apagarKit(...a),
}));

import PainelKitsDeInsercao from '../../components/blueprint/PainelKitsDeInsercao';

const KIT = { id: 'k1', organizationId: 'org', nome: 'Hidrante + extintor', disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES', itens: [{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: {} }], active: true };

function desenho() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m0.levels[0].id;
  const peca = (tipo: string, x: number, cota: number): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, 0), cotaMm: cota }) as Command;
  const m = applyBatch(m0, [peca('HIDRANTE_SIMPLES', 1000, 1300), peca('EXTINTOR', 1600, 1600)]).model;
  return { m, ids: m.terminais!.map((t) => t.id) };
}

beforeEach(() => {
  listarKits.mockReset().mockResolvedValue([KIT]);
  salvarKit.mockReset().mockResolvedValue({});
  apagarKit.mockReset().mockResolvedValue(undefined);
});

describe('PainelKitsDeInsercao (F2)', () => {
  it('lista os kits da organização e os entrega ao editor', async () => {
    const onKits = vi.fn();
    const { m } = desenho();
    render(<PainelKitsDeInsercao organizationId="org" model={m} selecionados={[]} onKits={onKits} />);
    expect(await screen.findByText('Hidrante + extintor')).toBeInTheDocument();
    expect(screen.getByText(/Ao inserir Hidrante simples \(Incêndio\): \+ EXTINTOR/)).toBeInTheDocument();
    expect(onKits).toHaveBeenCalledWith([KIT]);
    expect(listarKits).toHaveBeenCalledWith('org');
  });

  it('salvar fica desligado dizendo por quê; com a seleção e o nome, grava o arranjo medido a partir da principal', async () => {
    const user = userEvent.setup();
    const { m, ids } = desenho();
    const { rerender } = render(<PainelKitsDeInsercao organizationId="org" model={m} selecionados={[]} onKits={vi.fn()} />);
    await screen.findByText('Hidrante + extintor');
    const salvar = () => screen.getByRole('button', { name: 'Salvar kit' });
    expect(salvar()).toBeDisabled();
    expect(salvar()).toHaveAttribute('title', 'Selecione no desenho a peça principal e, depois, as que entram junto com ela');
    rerender(<PainelKitsDeInsercao organizationId="org" model={m} selecionados={[ids[0]]} onKits={vi.fn()} />);
    expect(salvar()).toHaveAttribute('title', 'Selecione também as peças que entram junto (no mesmo pavimento da principal)');
    rerender(<PainelKitsDeInsercao organizationId="org" model={m} selecionados={ids} onKits={vi.fn()} />);
    expect(salvar()).toHaveAttribute('title', 'Dê um nome ao kit');
    await user.type(screen.getByLabelText('Nome do kit'), 'Hidrante + extintor');
    expect(salvar()).toHaveAttribute('title', 'Já existe um kit com esse nome para essa peça');
    await user.type(screen.getByLabelText('Nome do kit'), ' 2');
    expect(salvar()).toBeEnabled();
    await user.click(salvar());
    await waitFor(() => expect(salvarKit).toHaveBeenCalled());
    expect(salvarKit).toHaveBeenCalledWith('org', {
      nome: 'Hidrante + extintor 2',
      disciplina: 'INCENDIO',
      tipo: 'HIDRANTE_SIMPLES',
      itens: [{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR' } }],
    });
    expect(listarKits).toHaveBeenCalledTimes(2);
  });

  it('apaga o kit da organização', async () => {
    const user = userEvent.setup();
    const { m } = desenho();
    render(<PainelKitsDeInsercao organizationId="org" model={m} selecionados={[]} onKits={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Remover o kit Hidrante + extintor' }));
    await waitFor(() => expect(apagarKit).toHaveBeenCalledWith('k1', 'org'));
  });
});
