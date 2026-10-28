// @vitest-environment jsdom
/**
 * PAVIMENTO DA LISTA (27/10/2026): *"ao clicar na gaveta nova unidade, o campo Pavimento deve listar os pavimentos
 * criados na seção Pavimentos"*. Com cadastro, o campo é uma lista dos andares (a repetição expandida); escolher grava
 * o andar, o tipo e o vínculo (`floor_id`). Sem cadastro, continua o número digitado.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UnitFormFields, { emptyUnitFormValues, unitFormFromRecord, unitFormToPayload } from '../../components/empreendimento/UnitFormFields';
import { andaresDoCadastro } from '../../utils/blueprintEstruturaDaTorre';

const pav = (extra: Record<string, unknown>) => ({ id: 'f', tower_id: 't1', tipo: 'TIPO', repeat_count: 1, sort_order: 0, created_at: '', updated_at: '', ...extra }) as never;
const CADASTRO = [
  pav({ id: 'fg', name: 'Garagem', tipo: 'GARAGEM', floor_number: -2, repeat_count: 2 }),
  pav({ id: 'ft', name: 'Térreo', tipo: 'TERREO', floor_number: 0, sort_order: 1 }),
  pav({ id: 'fp', name: 'Tipo', tipo: 'TIPO', floor_number: 1, repeat_count: 3, sort_order: 2 }),
];

describe('andaresDoCadastro', () => {
  it('expande a repetição, de baixo para cima, com o pavimento de onde veio', () => {
    expect(andaresDoCadastro(CADASTRO).map((a) => [a.numero, a.nome, a.floorId])).toEqual([
      [-2, 'Garagem 1', 'fg'],
      [-1, 'Garagem 2', 'fg'],
      [0, 'Térreo', 'ft'],
      [1, 'Tipo 1', 'fp'],
      [2, 'Tipo 2', 'fp'],
      [3, 'Tipo 3', 'fp'],
    ]);
  });
});

describe('Nova unidade › Pavimento', () => {
  it('com pavimentos cadastrados: lista os andares; escolher grava andar, tipo e vínculo', async () => {
    const onChange = vi.fn();
    render(<UnitFormFields value={emptyUnitFormValues()} onChange={onChange} pavimentos={andaresDoCadastro(CADASTRO)} />);
    const campo = screen.getByLabelText('Pavimento') as HTMLSelectElement;
    expect([...campo.options].map((o) => o.textContent)).toEqual([
      'Selecione o pavimento…',
      'Garagem 1 — andar -2',
      'Garagem 2 — andar -1',
      'Térreo — andar 0',
      'Tipo 1 — andar 1',
      'Tipo 2 — andar 2',
      'Tipo 3 — andar 3',
    ]);
    await userEvent.selectOptions(campo, '2');
    expect(onChange).toHaveBeenLastCalledWith({ floor: '2', floor_tipo: 'TIPO', floor_id: 'fp' });
  });

  it('o andar que a unidade já tem e não está no cadastro continua na lista', () => {
    render(<UnitFormFields value={{ ...emptyUnitFormValues(), floor: '7' }} onChange={vi.fn()} pavimentos={andaresDoCadastro(CADASTRO)} />);
    expect(screen.getByRole('option', { name: 'Andar 7 (fora do cadastro)' })).toBeInTheDocument();
  });

  it('sem pavimentos cadastrados: número digitado, e digitar desfaz o vínculo', async () => {
    const onChange = vi.fn();
    render(<UnitFormFields value={{ ...emptyUnitFormValues(), floor_id: 'antigo' }} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Pavimento'), '4');
    expect(onChange).toHaveBeenLastCalledWith({ floor: '4', floor_id: '' });
  });

  it('o vínculo vai e volta do registro (editar não o apaga)', () => {
    const form = unitFormFromRecord({ name: '101', floor: 1, floor_tipo: 'TIPO', floor_id: 'fp' } as never);
    expect(form.floor_id).toBe('fp');
    expect(unitFormToPayload(form).floor_id).toBe('fp');
    expect(unitFormToPayload(emptyUnitFormValues()).floor_id).toBeNull();
  });
});
