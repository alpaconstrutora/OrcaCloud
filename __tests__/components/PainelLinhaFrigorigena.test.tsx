// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E5 (05/10/2026): o painel da linha e do dreno — tabela por sistema,
 * hipóteses editáveis dentro da faixa, Lançar/Aceitar com motivo, conferência.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PainelLinhaFrigorigena from '../../components/blueprint/PainelLinhaFrigorigena';
import { HIPOTESES_DA_LINHA_PADRAO } from '../../utils/blueprintClimatizacao';
import { FAIXAS_DA_LINHA, type LinhaConferida, type PlanoDaLinha } from '../../utils/blueprintLinhaFrigorigena';

const faixa = FAIXAS_DA_LINHA[1];
const linhas: LinhaConferida[] = [
  { evaporadoraId: 'e1', condensadoraId: 'c1', nome: 'Split 18k', capacidadeBtuH: 18000, faixa, comprimentoM: 12.4, desnivelM: 1.9, dnLiquidoMm: [6], dnSuccaoMm: [13], isolamentoMinMm: 9, gasAdicionalG: 148, curvas: 3, raioMinimoMm: 50, pendencias: [] },
  { evaporadoraId: 'e2', condensadoraId: 'c2', nome: 'Split 9k', capacidadeBtuH: 9000, faixa: FAIXAS_DA_LINHA[0], comprimentoM: null, desnivelM: 0.5, dnLiquidoMm: [], dnSuccaoMm: [], isolamentoMinMm: null, gasAdicionalG: null, curvas: 0, raioMinimoMm: 40, pendencias: ['sem linha entre a evaporadora e a condensadora'] },
];
const plano: PlanoDaLinha = {
  comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }],
  aCriar: [{ evaporadoraId: 'e2', condensadoraId: 'c2', nome: 'Split 9k', linha: true, faixa: FAIXAS_DA_LINHA[0], comprimentoMm: 6200, desnivelMm: 500, dreno: { destino: 'PONTO_NOVO_NA_FACHADA', comBomba: false, comprimentoMm: 4100 }, avisos: [] }],
  jaLigados: ['Split 18k'],
  semLugar: [],
  apagados: 0,
  motivo: null,
  resumo: ['Split 9k: linha 6,2 m (Ø 6/10 mm, máx. 15 m) · dreno 4,1 m por gravidade a um ponto novo na fachada'],
};
const conferencia = [
  { codigo: 'LINHA', item: 'Linha frigorígena entre cada evaporadora e sua condensadora', estado: 'FALTA' as const, obtido: 'sem linha: Split 9k', spaceIds: [] },
  { codigo: 'GAS', item: 'Carga adicional de gás além dos 5 m de pré-carga', estado: 'OK' as const, obtido: '148 g no total', spaceIds: [] },
];

describe('PainelLinhaFrigorigena', () => {
  it('tabela por sistema (linha, máximo, Ø, gás, curvas), resumo do plano, lançar e aceitar desligado com motivo', () => {
    const onLancar = vi.fn();
    const onSelecionar = vi.fn();
    render(<PainelLinhaFrigorigena plano={plano} linhas={linhas} conferencia={conferencia} hip={HIPOTESES_DA_LINHA_PADRAO} onHip={() => {}} sugeridos={{ trechos: [], terminais: [] }} onLancar={onLancar} onAceitar={() => {}} onSelecionar={onSelecionar} />);
    const tabela = screen.getByTestId('tabela-linhas');
    expect(tabela).toHaveTextContent('12,4 m');
    expect(tabela).toHaveTextContent('20 m');
    expect(tabela).toHaveTextContent('6 · 13 mm');
    expect(tabela).toHaveTextContent('148 g');
    expect(tabela).toHaveTextContent('3 (r ≥ 50 mm)');
    expect(tabela).toHaveTextContent('sem linha');
    expect(tabela).toHaveTextContent('pede 6/10 mm');
    fireEvent.click(within(tabela).getByRole('button', { name: 'Split 18k' }));
    expect(onSelecionar).toHaveBeenCalledWith(['e1', 'c1']);
    expect(screen.getByTestId('linha-resumo')).toHaveTextContent(/Lança 1 linha/);
    expect(screen.getByTestId('linha-resumo')).toHaveTextContent(/Já ligados.*Split 18k/);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar linha e dreno' }));
    expect(onLancar).toHaveBeenCalledTimes(1);
    const aceitar = screen.getByRole('button', { name: /^Aceitar/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
    expect(aceitar.title).toMatch(/não há linha, dreno ou peça/);
    expect(screen.getByTestId('linha-conferencia')).toHaveTextContent('sem linha: Split 9k');
  });

  it('hipóteses na faixa; com motivo o lançar fica desligado e o diz; aceitar passa trechos e peças', () => {
    const onHip = vi.fn();
    const onAceitar = vi.fn();
    render(<PainelLinhaFrigorigena plano={{ ...plano, comandos: [], aCriar: [], motivo: 'nenhuma evaporadora com condensadora ligada neste pavimento' }} linhas={[]} conferencia={[]} hip={HIPOTESES_DA_LINHA_PADRAO} onHip={onHip} sugeridos={{ trechos: ['t1', 't2'], terminais: ['p1'] }} onLancar={() => {}} onAceitar={onAceitar} />);
    const cota = screen.getByLabelText('Cota da linha (mm)') as HTMLInputElement;
    fireEvent.change(cota, { target: { value: '2300' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DA_LINHA_PADRAO, cotaDaLinhaMm: 2300 });
    fireEvent.change(cota, { target: { value: '99999' } });
    expect(onHip).toHaveBeenCalledTimes(1);
    const lancar = screen.getByRole('button', { name: 'Lançar linha e dreno' }) as HTMLButtonElement;
    expect(lancar.disabled).toBe(true);
    expect(lancar.title).toMatch(/nenhuma evaporadora com condensadora/);
    expect(screen.getByTestId('linha-motivo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar (3)' }));
    expect(onAceitar).toHaveBeenCalledWith({ trechos: ['t1', 't2'], terminais: ['p1'] });
  });
});
