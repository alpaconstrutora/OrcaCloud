// @vitest-environment jsdom
/**
 * A ORDEM DAS UNIDADES NO PAVIMENTO (27/10/2026): *"Temos que fazer uma ordenação de duas maneiras, automática como
 * você está sugerindo e manual"*. A manual mora em Torres e Unidades: setas ↑↓ por unidade e "Ordenar por número" por
 * pavimento. É a ordem que a massa da Planta segue em "Ordem do Empreendimento".
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listUnits: vi.fn(),
  updateUnit: vi.fn(),
}));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import UnitEditor from '../../components/empreendimento/UnitEditor';

const TORRE = { id: 't1', empreendimento_id: 'e1', name: 'Torre A', created_at: '', updated_at: '' };
const und = (id: string, floor: number, sort_order: number) => ({ id, tower_id: 't1', name: id, floor, sort_order, status: 'DISPONIVEL', created_at: '', updated_at: '' });

/** As linhas de unidade na ordem da tela (o nome é a 2ª célula). */
const nomesNaTela = () =>
  screen
    .getAllByRole('row')
    .map((r) => within(r).queryAllByRole('cell')[1]?.textContent ?? '')
    .filter((t) => /^\d{3}$/.test(t));

describe('Torres e Unidades › ordem das unidades no pavimento', () => {
  beforeEach(() => {
    svc.listUnits.mockReset();
    svc.updateUnit.mockReset();
    svc.updateUnit.mockImplementation(async (id: string, p: Record<string, unknown>) => ({ id, ...p }));
  });

  it('a tabela mostra o pavimento na ordem do Empreendimento (sort_order, no empate o número)', async () => {
    svc.listUnits.mockResolvedValue([und('303', 3, 12), und('204', 3, 13), und('201', 3, 14), und('102', 1, 0), und('101', 1, 0)]);
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '102', '303', '204', '201']));
  });

  it('a seta troca a unidade com a vizinha e grava a ordem do pavimento', async () => {
    svc.listUnits.mockResolvedValue([und('101', 1, 0), und('102', 1, 0), und('103', 1, 0)]);
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '102', '103']));
    await userEvent.click(screen.getAllByRole('button', { name: 'Subir na ordem do pavimento' })[2]);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '103', '102']));
    expect(svc.updateUnit).toHaveBeenCalledWith('103', { sort_order: 1 });
    expect(svc.updateUnit).toHaveBeenCalledWith('102', { sort_order: 2 });
  });

  it('a primeira não sobe, e o botão diz por quê', async () => {
    svc.listUnits.mockResolvedValue([und('101', 1, 0), und('102', 1, 1)]);
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '102']));
    const subir = screen.getAllByRole('button', { name: 'Subir na ordem do pavimento' })[0];
    expect(subir).toBeDisabled();
    expect(subir.parentElement).toHaveAttribute('title', 'Já é a primeira do pavimento');
  });

  it('"Ordenar por número" grava o pavimento pela coluna do número; já em ordem, desligado com o motivo', async () => {
    svc.listUnits.mockResolvedValue([und('303', 3, 12), und('204', 3, 13), und('201', 3, 14), und('202', 3, 15), und('101', 1, 0), und('102', 1, 1)]);
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(6));
    const [doPrimeiro, doTerceiro] = screen.getAllByRole('button', { name: /Ordenar por número/ });
    expect(doPrimeiro).toBeDisabled();
    expect(doPrimeiro.parentElement).toHaveAttribute('title', 'O pavimento já está na ordem pelo número');
    await userEvent.click(doTerceiro);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '102', '201', '202', '303', '204']));
    expect(svc.updateUnit).toHaveBeenCalledWith('201', { sort_order: 12 });
    expect(svc.updateUnit).toHaveBeenCalledWith('204', { sort_order: 15 });
  });
});
