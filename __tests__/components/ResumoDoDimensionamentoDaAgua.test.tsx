// @vitest-environment jsdom
/** A situação do dimensionamento na gaveta de água (14/10/2026): uma linha por assunto e o caminho para a tela. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ResumoDoDimensionamentoDaAgua, { linhasDoDimensionamento } from '../../components/blueprint/ResumoDoDimensionamentoDaAgua';
import type { DimensionamentoDaReservacao } from '../../utils/blueprintReservacao';
import type { PlanoDoAlimentador } from '../../utils/blueprintAlimentador';
import type { PressoesDaRede } from '../../utils/blueprintPressaoDaRede';

const reservacao = { situacao: 'INSUFICIENTE' } as DimensionamentoDaReservacao;
const alimentador = { motivo: null, atende: true, pressaoNaBoiaKpa: 44.5 } as PlanoDoAlimentador;
const ponto = (estado: string) => ({ terminalId: estado, levelId: 'l', at: { x: 0, y: 0 }, nome: estado, disponivelKpa: 1, minimaKpa: 10, estaticaKpa: 1, estado });
const pressoes = [{ origemId: 'cx', pontos: [ponto('OK'), ponto('INSUFICIENTE')] }] as unknown as PressoesDaRede[];

describe('ResumoDoDimensionamentoDaAgua', () => {
  it('uma linha por assunto, com o tom da situação', () => {
    const linhas = linhasDoDimensionamento({ reservacao, alimentador, recalque: null, aquecedores: [], pressoes });
    expect(linhas).toEqual([
      { assunto: 'Reservação', texto: 'volume insuficiente', tom: 'erro' },
      { assunto: 'Alimentador', texto: 'chega à boia com 44,5 kPa', tom: 'ok' },
      { assunto: 'Pressões', texto: '1 ponto(s) com pressão insuficiente', tom: 'erro' },
    ]);
  });

  it('recalque só entra com reservatório inferior', () => {
    const recalque = { inferiorId: null, motivo: null, motorCv: 0.5 } as never;
    expect(linhasDoDimensionamento({ reservacao: null, alimentador: null, recalque, aquecedores: [], pressoes: [] })).toEqual([]);
  });

  it('o link abre a tela; sem nada a dizer, o cartão não aparece', () => {
    const onAbrir = vi.fn();
    const { rerender, container } = render(<ResumoDoDimensionamentoDaAgua reservacao={reservacao} alimentador={null} recalque={null} aquecedores={[]} pressoes={[]} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByRole('button', { name: /abrir dimensionamento/i }));
    expect(onAbrir).toHaveBeenCalled();
    rerender(<ResumoDoDimensionamentoDaAgua reservacao={null} alimentador={null} recalque={null} aquecedores={[]} pressoes={[]} onAbrir={onAbrir} />);
    expect(container).toBeEmptyDOMElement();
  });
});
