// @vitest-environment jsdom
/**
 * A tabela de pressões da gaveta de água (28/09/2026, E1.3): estado por ponto,
 * seleção do ponto e as hipóteses editáveis (o simulador).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelPressoesDaAgua from '../../components/blueprint/PainelPressoesDaAgua';
import { HIPOTESES_PRESSAO_PADRAO, type PressoesDaRede } from '../../utils/blueprintPressaoDaRede';

const rede: PressoesDaRede = {
  origemId: 'cx', disciplina: 'AGUA_FRIA', trechos: [], criticoId: 'ch', motivo: null, caminhos: {}, avisos: [],
  pontos: [
    { terminalId: 'lv', levelId: 'l', at: { x: 0, y: 0 }, nome: 'Lavatório', disponivelKpa: 18.2, minimaKpa: 10, estaticaKpa: 21.6, estado: 'OK' },
    { terminalId: 'ch', levelId: 'l', at: { x: 0, y: 0 }, nome: 'Chuveiro', disponivelKpa: 5.1, minimaKpa: 10, estaticaKpa: 6.9, estado: 'INSUFICIENTE' },
  ],
};

describe('PainelPressoesDaAgua', () => {
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

  it('mudar a lâmina d’água chama onHip com o valor novo (o simulador)', () => {
    const onHip = vi.fn();
    render(<PainelPressoesDaAgua pressoes={[rede]} nomeDaOrigem={() => 'Caixa'} hip={HIPOTESES_PRESSAO_PADRAO} onHip={onHip} onSelecionar={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lâmina d’água acima do fundo da caixa, em mm'), { target: { value: '300' } });
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_PRESSAO_PADRAO, laminaDaguaMm: 300 });
  });
});
