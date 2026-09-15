// @vitest-environment jsdom
/**
 * O pré-dimensionamento NA TELA (13/09/2026, item 6).
 *
 * O contrato: IB e a seção mínima aparecem ao lado do declarado; "usar
 * sugerido" chama `onCircuitoProps` com os valores sugeridos — e só com eles;
 * tensão, ligação e DR são declarações que chamam o mesmo `onCircuitoProps`.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../../utils/blueprintEletricaDimensionamento';

/** QDC com C1 em 127 V e três tomadas de 600 VA (IB 14,2 A). */
function cena(declarado: { secaoMm2?: number; disjuntorA?: number } = {}): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127, ...declarado }).model;
  const circuitoId = m.circuitos[0].id;
  for (const x of [2000, 4000, 6000]) {
    m = applyCommand(m, {
      type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, 75), cotaMm: 300,
      tipoEletrico: 'TUG', potenciaW: 600,
    }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  }
  return m;
}

const props = { onAddCircuito: vi.fn(), onSelecionar: vi.fn() };

describe('PainelEletrica · pré-dimensionamento', () => {
  it('mostra IB, seção mínima e In sugerido ao lado do declarado', () => {
    render(<PainelEletrica model={cena()} onCircuitoProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} {...props} />);
    const linha = screen.getByLabelText('Pré-dimensionamento do circuito C1').textContent!;
    expect(linha).toMatch(/IB 14,2 A/);
    expect(linha).toMatch(/seção mín\. 2,5 mm²/);
    expect(linha).toMatch(/In 16 A/);
  });

  it('⚠️ "usar sugerido" grava SÓ o que difere do declarado, via onCircuitoProps', async () => {
    const onCircuitoProps = vi.fn();
    render(<PainelEletrica model={cena({ secaoMm2: 2.5 })} onCircuitoProps={onCircuitoProps} hipoteses={HIPOTESES_PADRAO} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'usar sugerido' }));
    const [, campos] = onCircuitoProps.mock.calls[0];
    // Seção declarada já é 2,5: só o disjuntor entra.
    expect(campos).toEqual({ disjuntorA: 16 });
  });

  it('declarado que fere a norma aparece com o item, em vermelho, sob o circuito', () => {
    render(<PainelEletrica model={cena({ secaoMm2: 1.5, disjuntorA: 25 })} onCircuitoProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} {...props} />);
    const linha = screen.getByLabelText('Pré-dimensionamento do circuito C1').textContent!;
    expect(linha).toMatch(/Tab\. 47/);
    expect(linha).toMatch(/5\.3\.4\.1/);
  });

  it('tensão, ligação e DR são declarações — cada uma chama onCircuitoProps', async () => {
    const onCircuitoProps = vi.fn();
    render(<PainelEletrica model={cena()} onCircuitoProps={onCircuitoProps} hipoteses={HIPOTESES_PADRAO} {...props} />);
    await userEvent.selectOptions(screen.getByLabelText('Ligação do circuito C1'), 'FFF');
    expect(onCircuitoProps).toHaveBeenLastCalledWith(expect.any(String), { ligacao: 'FFF' });
    await userEvent.click(screen.getByLabelText('Proteção DR do circuito C1'));
    expect(onCircuitoProps).toHaveBeenLastCalledWith(expect.any(String), { protecaoDR: true });
    expect(screen.getByLabelText('Tensão do circuito C1, em volts')).toHaveValue(127);
  });

  it('as hipóteses aparecem recolhidas, com o resumo, e abrem para editar', async () => {
    const onHipoteses = vi.fn();
    render(<PainelEletrica model={cena()} onCircuitoProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} onHipoteses={onHipoteses} {...props} />);
    const botao = screen.getByRole('button', { name: /Hipóteses do pré-dimensionamento/ });
    expect(botao.textContent).toMatch(/B1 · 30 °C/);
    await userEvent.click(botao);
    await userEvent.selectOptions(screen.getByLabelText('Método de instalação'), 'C');
    expect(onHipoteses).toHaveBeenCalledWith({ ...HIPOTESES_PADRAO, metodoDeInstalacao: 'C' });
  });

  it('a seção mínima de TUE (14/09/2026) é hipótese editável, com 4 mm² de padrão e dito que a Tab. 47 pede 2,5', async () => {
    const onHipoteses = vi.fn();
    render(<PainelEletrica model={cena()} onCircuitoProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} onHipoteses={onHipoteses} {...props} />);
    const botao = screen.getByRole('button', { name: /Hipóteses do pré-dimensionamento/ });
    expect(botao.textContent).toMatch(/TUE ≥ 4 mm²/);
    await userEvent.click(botao);
    const campo = screen.getByLabelText('Seção mínima de TUE');
    expect(campo).toHaveValue(4);
    expect(screen.getByText(/Tab\. 47 pede 2,5/)).toBeInTheDocument();
    // Campo controlado com prop fixa no teste: um change direto, não digitação acumulada.
    fireEvent.change(campo, { target: { value: '6' } });
    expect(onHipoteses).toHaveBeenLastCalledWith({ ...HIPOTESES_PADRAO, secaoMinimaTueMm2: 6 });
  });
});
