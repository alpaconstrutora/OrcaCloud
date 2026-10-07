// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E7 (05/10/2026): o painel de dutos e ventilação — a rede com a
 * perda crítica × disponível e o balanceamento por terminal, a ventilação por
 * ambiente, "Ajustar seções", Lançar/Aceitar com motivo e a conferência.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PainelRedeDeAr from '../../components/blueprint/PainelRedeDeAr';
import { HIPOTESES_DO_AR_PADRAO } from '../../utils/blueprintClimatizacao';
import type { PlanoDaRedeDeAr, RedeDeAr, VentilacaoDoAmbiente } from '../../utils/blueprintRedeDeAr';
import type { Terminal } from '../../utils/blueprintKernel';

const raiz = { id: 'r1', uid: 'ur1', levelId: 'l1', disciplina: 'MECANICA', tipo: 'Dutada', tipoHidraulico: 'EVAPORADORA_DUTADA', at: { x: 0, y: 0 }, cotaMm: 2600 } as Terminal;
const rede: RedeDeAr = {
  raiz,
  terminais: [
    { terminalId: 'd1', nome: 'Difusor A', vazao: { vazaoM3h: 300, origem: 'DECLARADA', memoria: 'declarada na peça' }, perdaPa: 41.2, excessoPa: 0 },
    { terminalId: 'd2', nome: 'Difusor B', vazao: { vazaoM3h: 300, origem: 'DERIVADA', memoria: 'Sala: ...' }, perdaPa: 35.0, excessoPa: 6.2 },
  ],
  trechos: [],
  vazaoTotalM3h: 600,
  perdaCriticaPa: 41.2,
  pressaoDisponivelPa: 150,
  atende: true,
  semVazao: [],
};
const ventilacao: VentilacaoDoAmbiente[] = [
  { spaceId: 's1', nome: 'Banheiro', uso: 'BANHEIRO', temJanela: false, exaustores: 0, tomadasDeAr: 0, exaustaoM3h: 90, renovacaoM3h: 0, climatizado: false, falta: 'Banheiro sem janela: exige exaustão mecânica (90 m³/h)', aviso: null },
];
const plano: PlanoDaRedeDeAr = { comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }], aCriar: [{ raizId: 'r1', nome: 'Dutada', terminais: 2, vazaoM3h: 600, cotaMm: 2575, avisos: [] }], jaLigados: [], semLugar: [], apagados: 0, motivo: null, resumo: ['Dutada: 2 terminal(is), 600 m³/h, duto no forro a 2,58 m'] };
const conferencia = [{ codigo: 'EXAUSTAO', item: 'Exaustão mecânica', estado: 'FALTA' as const, obtido: 'Banheiro sem janela: exige exaustão mecânica (90 m³/h)', spaceIds: ['s1'] }];

describe('PainelRedeDeAr', () => {
  it('a rede com perda crítica × disponível e o damper de cada terminal; a ventilação acusa o banheiro; lançar e ajustar; aceitar desligado com motivo', () => {
    const onLancar = vi.fn();
    const onAjustar = vi.fn();
    const onSelecionar = vi.fn();
    render(<PainelRedeDeAr redes={[rede]} ventilacao={ventilacao} plano={plano} conferencia={conferencia} hip={HIPOTESES_DO_AR_PADRAO} onHip={() => {}} ajustes={2} onAjustar={onAjustar} sugeridos={[]} onLancar={onLancar} onAceitar={() => {}} onSelecionar={onSelecionar} />);
    const bloco = screen.getByLabelText('Rede de Dutada');
    expect(bloco).toHaveTextContent('600 m³/h');
    expect(bloco).toHaveTextContent('perda crítica 41,2 Pa / disponível 150 Pa');
    expect(bloco).toHaveTextContent('6,2 Pa');
    expect(within(bloco).getByText('derivada')).toBeInTheDocument();
    expect(screen.getByTestId('ventilacao')).toHaveTextContent('Banheiro sem janela: exige exaustão mecânica (90 m³/h)');
    fireEvent.click(screen.getByRole('button', { name: 'Lançar os dutos' }));
    expect(onLancar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar seções (2)' }));
    expect(onAjustar).toHaveBeenCalledTimes(1);
    const aceitar = screen.getByRole('button', { name: /^Aceitar/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
    expect(aceitar.title).toMatch(/não há duto sugerido/);
    fireEvent.click(within(screen.getByTestId('rede-de-ar-conferencia')).getByRole('button', { name: /Banheiro sem janela/ }));
    expect(onSelecionar).toHaveBeenCalledWith(['s1']);
  });

  it('hipóteses: método e seção por seleção, números na faixa; sem ajuste o botão diz por quê; com motivo o lançar desliga', () => {
    const onHip = vi.fn();
    render(<PainelRedeDeAr redes={[]} ventilacao={[]} plano={{ ...plano, aCriar: [], comandos: [], motivo: 'nenhuma evaporadora dutada nem caixa de distribuição de ar neste pavimento' }} conferencia={[]} hip={HIPOTESES_DO_AR_PADRAO} onHip={onHip} ajustes={0} onAjustar={() => {}} sugeridos={['t1']} onLancar={() => {}} onAceitar={() => {}} />);
    fireEvent.change(screen.getByLabelText('Método de dimensionamento'), { target: { value: 'IGUAL_ATRITO' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DO_AR_PADRAO, metodo: 'IGUAL_ATRITO' });
    fireEvent.change(screen.getByLabelText('Velocidade no tronco (m/s)'), { target: { value: '7' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DO_AR_PADRAO, velocidadeTroncoMs: 7 });
    fireEvent.change(screen.getByLabelText('Velocidade no tronco (m/s)'), { target: { value: '99' } });
    expect(onHip).toHaveBeenCalledTimes(2);
    const ajustar = screen.getByRole('button', { name: 'Ajustar seções' }) as HTMLButtonElement;
    expect(ajustar.disabled).toBe(true);
    expect(ajustar.title).toMatch(/já têm a seção proposta/);
    const lancar = screen.getByRole('button', { name: 'Lançar os dutos' }) as HTMLButtonElement;
    expect(lancar.disabled).toBe(true);
    expect(lancar.title).toMatch(/nenhuma evaporadora dutada/);
    expect(screen.getByRole('button', { name: 'Aceitar (1)' })).toBeInTheDocument();
  });
});
