// @vitest-environment jsdom
/**
 * O painel "Conferência NBR 5410" (fatia 3, 10/09/2026).
 *
 * ⚠️ O contrato com quem lê: cada regra mostra falta / aviso / atende; o que
 * ficou fora da avaliação é DITO ao lado do atende; "ver" leva ao desenho;
 * e a ação de converter em ligação direta chama com os ids do achado.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelConferenciaNbr from '../../components/blueprint/PainelConferenciaNbr';
import type { ConferenciaNbr5410 } from '../../utils/blueprintNbr5410';

const conferencia: ConferenciaNbr5410 = {
  faltas: 2,
  avisos: 1,
  regras: [
    {
      codigo: '9.5.2.2.1',
      titulo: 'Número mínimo de pontos de tomada por ambiente',
      achados: [{ nivel: 'FALTA', mensagem: 'Sala: mín. 4 (1 a cada 5 m de 15,4 m), há 1 · faltam 3', ids: [] }],
      naoAvaliado: ['1 ambiente sem tipo: Ambiente 2'],
      avaliados: 1,
    },
    {
      codigo: '9.5.2.3',
      titulo: 'Aquecedor elétrico de água: conexão direta, sem tomada',
      achados: [
        {
          nivel: 'FALTA',
          mensagem: '1 aquecedor de água ligado por tomada: Chuveiro — a conexão deve ser direta',
          ids: ['t-chuveiro'],
          acao: { tipo: 'CONVERTER_LIGACAO_DIRETA', terminalIds: ['t-chuveiro'] },
        },
      ],
      naoAvaliado: ['reconhecido pelo nome do ponto'],
      avaliados: 1,
    },
    {
      codigo: '9.5.3.3',
      titulo: 'Circuito comum (iluminação + tomadas): 16 A e repartição',
      achados: [],
      naoAvaliado: ['circuito C1: sem tensão, corrente não calculável'],
      avaliados: 1,
    },
    {
      codigo: 'SUGERIDAS',
      titulo: 'Tomadas sugeridas pelo sistema, ainda sem posição confirmada',
      achados: [{ nivel: 'AVISO', mensagem: '2 tomadas sugeridas aguardam posição — mover confirma', ids: ['s1', 's2'] }],
      naoAvaliado: [],
      avaliados: 2,
    },
  ],
};

describe('PainelConferenciaNbr', () => {
  it('resume faltas e avisos, e nomeia o estado de cada regra', () => {
    render(<PainelConferenciaNbr conferencia={conferencia} />);
    expect(screen.getByText('2 faltas')).toBeTruthy();
    expect(screen.getByText('1 aviso')).toBeTruthy();
    expect(screen.getByRole('button', { name: /9\.5\.2\.2\.1 .*: falta/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /9\.5\.3\.3 .*: atende/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sugeridas .*: aviso/ })).toBeTruthy();
  });

  it('⚠️ o "atende" com dados faltando é marcado como PARCIAL e diz o que ficou fora', async () => {
    render(<PainelConferenciaNbr conferencia={conferencia} />);
    const regra = screen.getByRole('button', { name: /9\.5\.3\.3 .*: atende/ });
    expect(regra.textContent).toMatch(/parcial/);
    await userEvent.click(regra);
    expect(screen.getByText(/circuito C1: sem tensão/)).toBeTruthy();
  });

  it('"ver" seleciona os ids do achado', async () => {
    const onSelecionar = vi.fn();
    render(<PainelConferenciaNbr conferencia={conferencia} onSelecionar={onSelecionar} />);
    const botoes = screen.getAllByRole('button', { name: 'ver' });
    await userEvent.click(botoes[botoes.length - 1]); // o das sugeridas
    expect(onSelecionar).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('a ação de converter chama com os ids do achado', async () => {
    const onConverter = vi.fn();
    render(<PainelConferenciaNbr conferencia={conferencia} onConverterLigacaoDireta={onConverter} />);
    await userEvent.click(screen.getByRole('button', { name: 'Converter em ligação direta' }));
    expect(onConverter).toHaveBeenCalledWith(['t-chuveiro']);
  });

  it('sem nenhum achado: "nenhuma falta"', () => {
    render(
      <PainelConferenciaNbr
        conferencia={{ faltas: 0, avisos: 0, regras: conferencia.regras.map((r) => ({ ...r, achados: [] })) }}
      />,
    );
    expect(screen.getByText('nenhuma falta')).toBeTruthy();
  });
});
