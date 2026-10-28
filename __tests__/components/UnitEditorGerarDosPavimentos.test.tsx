// @vitest-environment jsdom
/**
 * GERAR A PARTIR DOS PAVIMENTOS com número inicial (28/10/2026): *"o botão de gerar a partir do pavimento inicia a
 * numeração sequencial a partir de 01. implemente opção de escolher iniciar de um número que o usuário decidir"*.
 * O botão abre um painel com "Numeração começa em" e a prévia por andar; gerar substitui as unidades.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listUnits: vi.fn(),
  deleteUnitsByTower: vi.fn(),
  generateUnitsFromFloors: vi.fn(),
}));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import UnitEditor from '../../components/empreendimento/UnitEditor';

const TORRE = { id: 't1', empreendimento_id: 'e1', name: 'Torre B', units_per_floor: 4, created_at: '', updated_at: '' };
const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra });
const PAVIMENTOS = [pav({ id: 't', name: 'Térreo', tipo: 'TERREO', floor_number: 0 }), pav({ id: 'p', name: 'Tipo', floor_number: 1, repeat_count: 2, sort_order: 1 })];

describe('Unidades › Gerar a partir dos pavimentos › número inicial', () => {
  beforeEach(() => {
    svc.listUnits.mockReset().mockResolvedValue([{ id: 'x', tower_id: 't1', name: 'velha', floor: 1, sort_order: 0 }]);
    svc.deleteUnitsByTower.mockReset().mockResolvedValue(undefined);
    svc.generateUnitsFromFloors.mockReset().mockResolvedValue([{ id: 'n', tower_id: 't1', name: '105', floor: 1, sort_order: 0 }]);
  });

  const abrir = async () => {
    render(<UnitEditor tower={TORRE as never} floors={PAVIMENTOS as never} />);
    await waitFor(() => expect(svc.listUnits).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /Gerar a partir dos pavimentos/ }));
  };

  it('abre o painel com 1 e a prévia de sempre (101…); trocar para 5 mostra 105 a 108', async () => {
    await abrir();
    const campo = screen.getByLabelText('Numeração começa em');
    expect(campo).toHaveValue(1);
    expect(screen.getByTestId('previa-dos-pavimentos')).toHaveTextContent('Andar 1: 101 a 104 (4 unid.)');
    await userEvent.clear(campo);
    await userEvent.type(campo, '5');
    const previa = screen.getByTestId('previa-dos-pavimentos');
    expect(previa).toHaveTextContent('Andar 0: TR05 a TR08 (4 unid.)');
    expect(previa).toHaveTextContent('Andar 2: 205 a 208 (4 unid.)');
    expect(screen.getByTestId('aviso-substituir')).toHaveTextContent('As 1 unidades atuais de "Torre B" serão excluídas');
  });

  it('gerar substitui as unidades com o número escolhido', async () => {
    await abrir();
    const campo = screen.getByLabelText('Numeração começa em');
    await userEvent.clear(campo);
    await userEvent.type(campo, '5');
    await userEvent.click(screen.getByRole('button', { name: /Substituir e gerar 12 unidades/ }));
    await waitFor(() => expect(svc.generateUnitsFromFloors).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 5));
    expect(svc.deleteUnitsByTower).toHaveBeenCalledWith('t1');
  });

  it('número fora de 0–99: não gera, e o botão diz por quê', async () => {
    await abrir();
    const campo = screen.getByLabelText('Numeração começa em');
    await userEvent.clear(campo);
    await userEvent.type(campo, '150');
    const gerar = screen.getByRole('button', { name: /Substituir e gerar/ });
    expect(gerar).toBeDisabled();
    expect(gerar.parentElement).toHaveAttribute('title', 'Use um número inteiro de 0 a 99 em "Numeração começa em".');
    expect(screen.queryByTestId('previa-dos-pavimentos')).not.toBeInTheDocument();
  });
});
