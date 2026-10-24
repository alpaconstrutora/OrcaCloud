// @vitest-environment jsdom
/**
 * O aviso âmbar "as escolhas mudaram desde o lançamento" (F1 do plano `2026-10-24-relancar-quando-escolha-muda.md`):
 * sem diferença não aparece; com diferença diz o que mudou e oferece relançar; desligado, DIZ por quê.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvisoDeEscolhasMudaram from '../../components/blueprint/AvisoDeEscolhasMudaram';
import type { DiferencaDeEscolha } from '../../utils/blueprintRegistroDeLancamento';

const CAIXAS: DiferencaDeEscolha = { item: 'caixasDePassagem', rotulo: 'Caixas de passagem', antes: 'com caixas de passagem', agora: 'sem caixas de passagem' };

describe('AvisoDeEscolhasMudaram', () => {
  it('sem diferença não renderiza nada', () => {
    const { container } = render(<AvisoDeEscolhasMudaram diferencas={[]} onRelancar={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('com diferença mostra o texto e o botão (rótulo padrão), e o clique relança', () => {
    const onRelancar = vi.fn();
    render(<AvisoDeEscolhasMudaram diferencas={[CAIXAS]} onRelancar={onRelancar} />);
    expect(screen.getByText('Lançado com: com caixas de passagem · agora: sem caixas de passagem')).toBeTruthy();
    const botao = screen.getByRole('button', { name: 'Relançar com as escolhas atuais' });
    expect((botao as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(botao);
    expect(onRelancar).toHaveBeenCalledTimes(1);
  });

  it('aceita outro rótulo no botão', () => {
    render(<AvisoDeEscolhasMudaram diferencas={[CAIXAS]} rotuloDoBotao="Refazer tudo" onRelancar={() => {}} />);
    expect(screen.getByRole('button', { name: 'Refazer tudo' })).toBeTruthy();
  });

  it('desabilitado: o botão desliga e o MOTIVO vai no title (no botão e no invólucro)', () => {
    const onRelancar = vi.fn();
    render(<AvisoDeEscolhasMudaram diferencas={[CAIXAS]} onRelancar={onRelancar} desabilitado="Planta somente leitura: peça a edição para relançar" />);
    const botao = screen.getByRole('button', { name: 'Relançar com as escolhas atuais' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe('Planta somente leitura: peça a edição para relançar');
    expect((botao.parentElement as HTMLElement).title).toBe('Planta somente leitura: peça a edição para relançar');
    fireEvent.click(botao);
    expect(onRelancar).not.toHaveBeenCalled();
  });
});
