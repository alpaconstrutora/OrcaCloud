// @vitest-environment jsdom
/**
 * A tabela de pressões da gaveta de água (28/09/2026, E1.3): estado por ponto,
 * seleção do ponto e as hipóteses editáveis (o simulador).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelPressoesDaAgua from '../../components/blueprint/PainelPressoesDaAgua';
import { HIPOTESES_PRESSAO_PADRAO, type PressoesDaRede } from '../../utils/blueprintPressaoDaRede';

const rede: PressoesDaRede = {
  origemId: 'cx', disciplina: 'AGUA_FRIA', trechos: [], criticoId: 'ch', motivo: null, caminhos: {}, avisos: [], trechosDoAnel: [],
  pontos: [
    { terminalId: 'lv', levelId: 'l', at: { x: 0, y: 0 }, nome: 'Lavatório', disponivelKpa: 18.2, minimaKpa: 10, estaticaKpa: 21.6, estado: 'OK' },
    { terminalId: 'ch', levelId: 'l', at: { x: 0, y: 0 }, nome: 'Chuveiro', disponivelKpa: 5.1, minimaKpa: 10, estaticaKpa: 6.9, estado: 'INSUFICIENTE' },
    { terminalId: 'tq', levelId: 'l', at: { x: 0, y: 0 }, nome: 'Tanque', disponivelKpa: 380, minimaKpa: 10, estaticaKpa: 420, estado: 'EXCESSIVA' },
  ],
};

const abrirHipoteses = () => fireEvent.click(screen.getByRole('button', { name: /hipóteses da pressão/i }));

describe('PainelPressoesDaAgua', () => {
  beforeEach(() => localStorage.clear());

  it('mostra disponível em kPa e mca, o crítico e o estado; clicar no ponto seleciona', async () => {
    const onSelecionar = vi.fn();
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => "Caixa d'água"} hip={HIPOTESES_PRESSAO_PADRAO} onHip={() => {}} onSelecionar={onSelecionar} />);
    const painel = screen.getByTestId('pressoes-da-agua');
    expect(painel).toHaveTextContent("Água fria — Caixa d'água");
    const linhaDoChuveiro = screen.getAllByRole('row').find((r) => /Chuveiro/.test(r.textContent ?? ''))!;
    expect(linhaDoChuveiro).toHaveTextContent('Chuveiro · crítico');
    expect(linhaDoChuveiro).toHaveTextContent('5,1 kPa (0,52 mca)');
    expect(linhaDoChuveiro).toHaveTextContent('insuficiente');
    await userEvent.setup().click(screen.getByRole('button', { name: /Chuveiro/ }));
    expect(onSelecionar).toHaveBeenCalledWith(['ch']);
  });

  it('cabeçalho em sentence case (padrão de tabela em drawer, 14/10/2026)', () => {
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => 'Caixa'} hip={HIPOTESES_PRESSAO_PADRAO} onHip={() => {}} onSelecionar={() => {}} />);
    const cabecalho = screen.getAllByRole('columnheader')[0].closest('tr')!;
    expect(cabecalho.className).not.toMatch(/uppercase/);
    expect(cabecalho.className).toMatch(/bg-white/);
  });

  it('mudar a lâmina d’água chama onHip com o valor novo ao sair do campo (o simulador)', () => {
    const onHip = vi.fn();
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => 'Caixa'} hip={HIPOTESES_PRESSAO_PADRAO} onHip={onHip} onSelecionar={() => {}} />);
    abrirHipoteses();
    const lamina = screen.getByLabelText('Lâmina d’água acima do fundo da caixa, em mm');
    fireEvent.change(lamina, { target: { value: '300' } });
    fireEvent.blur(lamina);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_PRESSAO_PADRAO, laminaDaguaMm: 300 });
  });

  it('apagar a perda do aquecedor NÃO grava 0; o Qmáx do hidrômetro não desce de 0,5 (0 daria perda infinita)', () => {
    const onHip = vi.fn();
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => 'Caixa'} hip={HIPOTESES_PRESSAO_PADRAO} onHip={onHip} onSelecionar={() => {}} />);
    abrirHipoteses();
    const perda = screen.getByLabelText('Perda de carga no aquecedor, em kPa');
    fireEvent.change(perda, { target: { value: '' } });
    fireEvent.blur(perda);
    expect(onHip).not.toHaveBeenCalled();
    const qmax = screen.getByLabelText('Vazão máxima do hidrômetro, em m³/h');
    fireEvent.change(qmax, { target: { value: '0' } });
    fireEvent.blur(qmax);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_PRESSAO_PADRAO, qMaxDoHidrometroM3h: 0.5 });
  });

  it('os limites da NBR viraram campos, e o estado "estática acima de N" lê a premissa', () => {
    const onHip = vi.fn();
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => 'Caixa'} hip={{ ...HIPOTESES_PRESSAO_PADRAO, estaticaMaximaKpa: 350 }} onHip={onHip} onSelecionar={() => {}} />);
    const linhaDoTanque = screen.getAllByRole('row').find((r) => /Tanque/.test(r.textContent ?? ''))!;
    expect(linhaDoTanque).toHaveTextContent('estática acima de 350');
    abrirHipoteses();
    const minima = screen.getByLabelText('Pressão mínima nos pontos, em kPa');
    fireEvent.change(minima, { target: { value: '15' } });
    fireEvent.blur(minima);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_PRESSAO_PADRAO, estaticaMaximaKpa: 350, pressaoMinimaKpa: 15 });
  });

  it('sem rede, o painel não aparece (a gaveta já diz que falta a caixa d’água)', () => {
    const { container } = render(<PainelPressoesDaAgua pressoes={[]} nomeDaOrigem={() => ''} hip={HIPOTESES_PRESSAO_PADRAO} onHip={() => {}} onSelecionar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
