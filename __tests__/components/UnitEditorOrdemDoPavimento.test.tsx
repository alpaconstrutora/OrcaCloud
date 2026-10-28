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
  updateTower: vi.fn(),
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

describe('Torres e Unidades › como a Planta arruma as unidades da torre (28/10/2026)', () => {
  beforeEach(() => {
    svc.listUnits.mockReset();
    svc.listUnits.mockResolvedValue([und('101', 1, 0)]);
    svc.updateTower.mockReset();
    svc.updateTower.mockImplementation(async (id: string, p: Record<string, unknown>) => ({ ...TORRE, id, ...p }));
  });

  it('sem escolha gravada, "Pela posição"; trocar grava na torre e avisa o pai', async () => {
    const onTowerChange = vi.fn();
    render(<UnitEditor tower={TORRE as never} onTowerChange={onTowerChange} />);
    const caixa = screen.getByTestId('ordem-na-planta');
    expect(within(caixa).getByRole('button', { name: 'Pela posição' })).toHaveAttribute('aria-pressed', 'true');
    expect(caixa).toHaveTextContent('As setas ↑↓ não mudam a Planta.');
    await userEvent.click(within(caixa).getByRole('button', { name: 'Pelas setas' }));
    await waitFor(() => expect(svc.updateTower).toHaveBeenCalledWith('t1', { ordem_das_unidades_na_planta: 'SETAS' }));
    await waitFor(() => expect(onTowerChange).toHaveBeenCalledWith('t1', { ordem_das_unidades_na_planta: 'SETAS' }));
    expect(within(caixa).getByRole('button', { name: 'Pelas setas' })).toHaveAttribute('aria-pressed', 'true');
    expect(caixa).toHaveTextContent('Posição e Orientação não mudam a Planta.');
  });

  it('erro ao gravar volta a escolha de antes', async () => {
    svc.updateTower.mockRejectedValue(new Error('sem permissão'));
    render(<UnitEditor tower={{ ...TORRE, ordem_das_unidades_na_planta: 'SETAS' } as never} />);
    const caixa = screen.getByTestId('ordem-na-planta');
    expect(within(caixa).getByRole('button', { name: 'Pelas setas' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(caixa).getByRole('button', { name: 'Pela posição' }));
    await waitFor(() => expect(within(caixa).getByRole('button', { name: 'Pelas setas' })).toHaveAttribute('aria-pressed', 'true'));
  });
});

describe('Torres e Unidades › elevação no cabeçalho do pavimento (27/10/2026)', () => {
  beforeEach(() => {
    svc.listUnits.mockReset();
  });

  it('sem pavimentos cadastrados (o Garden): calculada pelos andares das unidades, a partir do térreo da torre', async () => {
    svc.listUnits.mockResolvedValue([und('E1', -1, 0), und('002', 0, 0), und('101', 1, 0), und('201', 2, 0)]);
    render(<UnitEditor tower={{ ...TORRE, pe_direito_padrao_m: 3, elevacao_terreo_m: 0.5 } as never} />);
    await waitFor(() => expect(screen.getAllByTestId('elevacao-do-grupo')).toHaveLength(4));
    expect(screen.getAllByTestId('elevacao-do-grupo').map((e) => e.textContent)).toEqual([
      '· Elevação -2,50 m (calc.)',
      '· Elevação +0,50 m (calc.)',
      '· Elevação +3,50 m (calc.)',
      '· Elevação +6,50 m (calc.)',
    ]);
  });

  it('com pavimento cadastrado e elevação digitada, mostra a digitada', async () => {
    svc.listUnits.mockResolvedValue([und('002', 0, 0), und('101', 1, 0)]);
    const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra });
    render(<UnitEditor tower={TORRE as never} floors={[pav({ name: 'Térreo', tipo: 'TERREO', floor_number: 0, pe_direito_m: 4.5 }), pav({ name: 'Tipo', floor_number: 1, elevacao_m: 5 })] as never} />);
    await waitFor(() => expect(screen.getAllByTestId('elevacao-do-grupo')).toHaveLength(2));
    expect(screen.getAllByTestId('elevacao-do-grupo')[1]).toHaveTextContent('· Elevação +5,00 m');
    expect(screen.getAllByTestId('elevacao-do-grupo')[1]).not.toHaveTextContent('calc.');
  });
});

describe('Torres e Unidades › Unidades com o nome e a elevação do pavimento (28/10/2026)', () => {
  beforeEach(() => {
    svc.listUnits.mockReset();
  });
  const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra });

  it('o grupo leva o NOME do pavimento cadastrado ("Estacionamento 2", não "Pavimento -4") e o andar ao lado', async () => {
    svc.listUnits.mockResolvedValue([und('SS405', -4, 0), und('101', 1, 0)]);
    render(
      <UnitEditor
        tower={TORRE as never}
        floors={[pav({ id: 'g', name: 'Estacionamento 2', tipo: 'GARAGEM', floor_number: -4, elevacao_m: -12.3 }), pav({ id: 'p', name: 'Pavimento 1', floor_number: 1 })] as never}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('nome-do-pavimento')).toHaveLength(2));
    expect(screen.getAllByTestId('nome-do-pavimento').map((e) => e.textContent)).toEqual(['Estacionamento 2', 'Pavimento 1']);
    expect(screen.getByText('andar -4')).toBeInTheDocument();
  });

  it('a coluna Elevação mostra a do andar da unidade (digitada ou calculada)', async () => {
    svc.listUnits.mockResolvedValue([und('002', 0, 0), und('101', 1, 0)]);
    render(<UnitEditor tower={{ ...TORRE, pe_direito_padrao_m: 3 } as never} floors={[pav({ name: 'Térreo', tipo: 'TERREO', floor_number: 0, elevacao_m: -0.3 }), pav({ name: 'Pavimento 1', floor_number: 1 })] as never} />);
    await waitFor(() => expect(screen.getAllByTestId('elevacao-da-unidade')).toHaveLength(2));
    expect(screen.getAllByTestId('elevacao-da-unidade').map((e) => e.textContent)).toEqual(['-0,30 m', '+2,70 m (calc.)']);
    expect(screen.getByRole('columnheader', { name: 'Elevação' })).toBeInTheDocument();
  });
});
