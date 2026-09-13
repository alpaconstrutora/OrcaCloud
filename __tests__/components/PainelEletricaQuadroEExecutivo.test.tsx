// @vitest-environment jsdom
/**
 * F6 e F7 na tela (13/09/2026): o bloco do QUADRO (alimentação declarada,
 * demanda, alimentador, fases) e o PROJETO EXECUTIVO ELÉTRICO (responsável,
 * verificações, emitir).
 *
 * O contrato: declarar ligação/tensão/alimentador chama `onQuadroProps`;
 * a fase de um circuito chama `onCircuitoProps`; o botão de emitir fica
 * desabilitado com pendências e habilita sem elas; a emissão válida troca o
 * formulário pelo carimbo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import PainelEletricaExecutivo from '../../components/blueprint/PainelEletricaExecutivo';
import { applyCommand, emptyModel, point, type BlueprintModel } from '../../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../../utils/blueprintEletricaDimensionamento';
import { RESPONSAVEL_VAZIO } from '../../utils/blueprintTopografiaExecutivo';
import type { ResultadoEletricoExecutivo } from '../../utils/blueprintEletricaExecutivo';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ligacao: 'FFF', tensaoV: 220, alimentadorM: 12 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127, ligacao: 'FN', fase: 'R', secaoMm2: 2.5, disjuntorA: 16 }).model;
  const c1 = m.circuitos[0].id;
  for (const x of [2000, 4000]) {
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', at: point(x, 75), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId: c1 }).model;
  }
  return m;
}

describe('PainelEletrica · quadro e alimentador (F6)', () => {
  it('mostra carga instalada, IB do alimentador e as fases; declarar alimentador chama onQuadroProps', async () => {
    const onQuadroProps = vi.fn();
    const onCircuitoProps = vi.fn();
    render(
      <PainelEletrica model={cena()} onAddCircuito={vi.fn()} onCircuitoProps={onCircuitoProps} onQuadroProps={onQuadroProps} hipoteses={HIPOTESES_PADRAO} />,
    );
    const bloco = screen.getByLabelText('Alimentador do quadro QDC');
    expect(bloco.textContent).toMatch(/1200 VA instalados/);
    expect(bloco.textContent).toMatch(/IB/);
    expect(bloco.textContent).toMatch(/Fases: R 1200 · S 0 · T 0 VA/);
    // Campo controlado pelo modelo (o mock não regrava): uma tecla, uma chamada.
    await userEvent.clear(screen.getByLabelText('Comprimento do alimentador do quadro QDC, em metros'));
    expect(onQuadroProps).toHaveBeenLastCalledWith(expect.any(String), { alimentadorM: null });
    await userEvent.type(screen.getByLabelText('Comprimento do alimentador do quadro QDC, em metros'), '7');
    expect(onQuadroProps).toHaveBeenLastCalledWith(expect.any(String), { alimentadorM: 127 });
    await userEvent.selectOptions(screen.getByLabelText('Fase do circuito C1'), 'S');
    expect(onCircuitoProps).toHaveBeenLastCalledWith(expect.any(String), { fase: 'S' });
  });

  it('sem onQuadroProps o bloco não aparece (o harness antigo e as telas só de leitura)', () => {
    render(<PainelEletrica model={cena()} onAddCircuito={vi.fn()} onCircuitoProps={vi.fn()} hipoteses={HIPOTESES_PADRAO} />);
    expect(screen.queryByLabelText('Alimentador do quadro QDC')).toBeNull();
  });
});

const resultado = (podeEmitir: boolean): ResultadoEletricoExecutivo => ({
  verificacoes: [
    { grupo: 'RESPONSAVEL', item: 'Responsável técnico identificado', norma: 'Lei 5.194', exigido: 'nome e registro', obtido: podeEmitir ? 'Ana (CREA 1)' : 'incompleto', atende: podeEmitir },
    { grupo: 'NORMA', item: 'Iluminação', norma: 'NBR 5410 9.5.2.1', exigido: 'sem falta', obtido: 'sem falta', atende: true },
  ],
  quadros: [],
  podeEmitir,
  pendencias: podeEmitir ? [] : ['Responsável técnico identificado: incompleto'],
});

const base = {
  onResponsavel: vi.fn(),
  emitidos: [],
  emissaoValida: null,
  hashDaBaseAtual: 'h'.repeat(64),
  onEmitir: vi.fn(),
  emitindo: false,
  erro: null,
  onBaixarMemorial: vi.fn(),
  persistenciaIndisponivel: false,
};

describe('PainelEletricaExecutivo (F7)', () => {
  it('com pendência o botão fica desabilitado e a lista mostra o ✗ no grupo certo', () => {
    render(<PainelEletricaExecutivo e={{ ...base, responsavel: RESPONSAVEL_VAZIO, resultado: resultado(false) }} />);
    expect(screen.getByRole('button', { name: /Emitir projeto executivo elétrico/ })).toBeDisabled();
    expect(screen.getByText(/1 verificação\(ões\) pendente/)).toBeTruthy();
    const lista = screen.getByTestId('eletrica-verificacoes').textContent!;
    expect(lista).toMatch(/Responsável técnico/);
    expect(lista).toMatch(/✗/);
  });

  it('sem pendências habilita e chama onEmitir; digitar o nome chama onResponsavel', async () => {
    const onEmitir = vi.fn();
    const onResponsavel = vi.fn();
    render(
      <PainelEletricaExecutivo
        e={{ ...base, onEmitir, onResponsavel, responsavel: { ...RESPONSAVEL_VAZIO, nome: 'Ana', registro: '1', artNumero: '9', artData: '2026-09-13' }, resultado: resultado(true) }}
      />,
    );
    await userEvent.type(screen.getByLabelText('Nome'), 'B');
    expect(onResponsavel).toHaveBeenCalledWith({ nome: 'AnaB' });
    await userEvent.click(screen.getByRole('button', { name: /Emitir projeto executivo elétrico \(ART\)/ }));
    expect(onEmitir).toHaveBeenCalledTimes(1);
  });

  it('⚠️ emissão válida para a base atual: o formulário some e o carimbo aparece', () => {
    render(
      <PainelEletricaExecutivo
        e={{
          ...base,
          responsavel: RESPONSAVEL_VAZIO,
          resultado: resultado(true),
          emissaoValida: { artNumero: '9', responsavel: 'Ana', conselho: 'CREA', registro: '1', emitidoEm: '2026-09-13T12:00:00Z' },
        }}
      />,
    );
    expect(screen.getByTestId('eletrica-emitido').textContent).toMatch(/ART nº 9 · Ana \(CREA 1\) · 13\/09\/2026/);
    expect(screen.queryByRole('button', { name: /Emitir projeto executivo/ })).toBeNull();
  });
});
