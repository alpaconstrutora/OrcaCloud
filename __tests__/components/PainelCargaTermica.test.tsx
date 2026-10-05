// @vitest-environment jsdom
/**
 * PAINEL DA CARGA TÉRMICA (04/10/2026, E2.3): condições em uso, uma linha por
 * ambiente climatizado, as parcelas ao abrir, o banner CONFERIR e a conferência.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelCargaTermica from '../../components/blueprint/PainelCargaTermica';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from '../../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../../utils/blueprintCargaTermica';

function nivel(hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: 'São Paulo', tbsExternaC: null, tbuExternaC: null, altitudeM: null } }) {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const sala = m.spaces.find((s) => s.ring.every((p) => p.x <= 4100))!;
  const dep = m.spaces.find((s) => s.id !== sala.id)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: dep.id, name: 'Depósito' },
  ]).model;
  return { n: cargaTermicaDoNivel(m, hip, t), salaId: sala.id };
}

describe('PainelCargaTermica', () => {
  it('mostra as condições (São Paulo da tabela), só o ambiente climatizado na tabela, o total, o banner CONFERIR e a conferência', () => {
    const { n } = nivel();
    render(<PainelCargaTermica nivel={n} nomeDoPavimento="Térreo" />);
    expect(screen.getByTestId('carga-condicoes')).toHaveTextContent(/São Paulo · TBS 31,9 °C · TBU 21,7 °C · ΔT 7,9 K/);
    const tabela = screen.getByTestId('tabela-carga-termica');
    expect(within(tabela).getByRole('row', { name: 'Carga de Sala' })).toBeInTheDocument();
    expect(within(tabela).queryByRole('row', { name: 'Carga de Depósito' })).toBeNull(); // não climatizado pelo uso
    expect(screen.getByTestId('carga-total')).toHaveTextContent(new RegExp(`${n.totalW.toLocaleString('pt-BR')} W`));
    expect(screen.getByTestId('carga-conferir')).toHaveTextContent(/CONFERIR NA NORMA/);
    expect(screen.getByTestId('carga-conferencia')).toHaveTextContent(/sem faltas/);
    expect(screen.getByTestId('carga-conferencia')).toHaveTextContent(/aviso\(s\)/);
  });

  it('abrir as parcelas mostra cada linha com a memória, e o total da Sala em W e BTU/h; clicar no nome seleciona', async () => {
    const user = userEvent.setup();
    const { n, salaId } = nivel();
    const onSelecionar = vi.fn();
    render(<PainelCargaTermica nivel={n} nomeDoPavimento="Térreo" onSelecionar={onSelecionar} />);
    await user.click(screen.getByRole('button', { name: 'Parcelas de Sala' }));
    const parcelas = screen.getByTestId(`parcelas-${salaId}`);
    expect(parcelas).toHaveTextContent(/Teto \*/);
    expect(parcelas).toHaveTextContent(/cobertura sem camadas|Último pavimento|laje sem camadas|típico/);
    expect(parcelas).toHaveTextContent(/Pessoas \*/);
    const sala = n.ambientes.find((a) => a.nome === 'Sala')!;
    expect(parcelas).toHaveTextContent(new RegExp(`${sala.totalW.toLocaleString('pt-BR')} W = ${sala.totalBtuH.toLocaleString('pt-BR')} BTU/h`));
    await user.click(screen.getByRole('button', { name: 'Sala' }));
    expect(onSelecionar).toHaveBeenCalledWith([salaId]);
  });

  it('sem TBS: a tabela existe mas as parcelas de condução saem como não avaliadas e a conferência acusa a falta', async () => {
    const user = userEvent.setup();
    const { n, salaId } = nivel(HIPOTESES_CLIMATIZACAO_PADRAO);
    render(<PainelCargaTermica nivel={n} nomeDoPavimento="Térreo" />);
    expect(screen.getByTestId('carga-condicoes')).toHaveTextContent(/TBS — · TBU — · ΔT —/);
    expect(screen.getByTestId('carga-conferencia')).toHaveTextContent(/1 falta\(s\)/);
    await user.click(screen.getByRole('button', { name: 'Parcelas de Sala' }));
    expect(screen.getByTestId(`parcelas-${salaId}`)).toHaveTextContent(/Teto —/);
  });
});
