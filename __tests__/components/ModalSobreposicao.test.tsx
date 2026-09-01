// @vitest-environment jsdom
/**
 * O aviso de sobreposição — as quatro saídas.
 *
 * Pedido do usuário (01/09/2026): *"Ao criar um componente e que sobrepoe um
 * outro, emitir um aviso ao usuário se ele quer desfazer ou se ele quer subtrair
 * o volume de um componente ou do outro componente"*.
 *
 * O que este arquivo mede é o que o editor OFERECE — a mesma classe de defeito
 * que `BlueprintEditor.test.tsx` existe para pegar: opção que some, botão que
 * não chama o que promete. O efeito de cada escolha no número é assunto do
 * teste puro (`__tests__/blueprintSobreposicao.test.ts`).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModalSobreposicao from '../../components/blueprint/ModalSobreposicao';

function montar(over: Partial<React.ComponentProps<typeof ModalSobreposicao>> = {}) {
  const props = {
    aberto: true,
    nomeDaPeca: 'Pilar',
    quantos: 1,
    volumeM3: 0.084,
    temParede: true,
    onEscolher: vi.fn(),
    ...over,
  };
  render(<ModalSobreposicao {...props} />);
  return props;
}

describe('ModalSobreposicao', () => {
  it('mostra o volume disputado e diz que ele seria contado duas vezes', () => {
    montar();
    // O número é o que sustenta a decisão (UI_PATTERNS §6.2). Sem ele,
    // "descontar de qual?" é pergunta sem dado.
    expect(screen.getByText(/0,084 m³/)).toBeTruthy();
    expect(screen.getByText(/duas vezes/)).toBeTruthy();
  });

  it('oferece as QUATRO saídas do pedido', () => {
    montar();
    expect(screen.getByRole('button', { name: /Desfazer pilar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cortar a parede' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descontar do concreto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manter os dois' })).toBeTruthy();
  });

  it('cada botão devolve a escolha correspondente', async () => {
    const usuario = userEvent.setup();
    const props = montar();

    await usuario.click(screen.getByRole('button', { name: 'Cortar a parede' }));
    expect(props.onEscolher).toHaveBeenCalledWith('CORTAR_PAREDE');

    await usuario.click(screen.getByRole('button', { name: 'Descontar do concreto' }));
    expect(props.onEscolher).toHaveBeenCalledWith('PECA_CEDE');

    await usuario.click(screen.getByRole('button', { name: 'Manter os dois' }));
    expect(props.onEscolher).toHaveBeenCalledWith('MANTER');

    await usuario.click(screen.getByRole('button', { name: /Desfazer pilar/ }));
    expect(props.onEscolher).toHaveBeenCalledWith('DESFAZER');
  });

  it('SEM parede envolvida, a opção de cortar não aparece', () => {
    // Peça sobre peça (viga em pilar): oferecer "cortar a parede" seria oferecer
    // um botão que não tem em que agir.
    montar({ temParede: false });
    expect(screen.queryByRole('button', { name: 'Cortar a parede' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Descontar do concreto' })).toBeTruthy();
  });

  it('Esc NÃO fecha — a decisão é obrigatória', async () => {
    const usuario = userEvent.setup();
    const props = montar();
    await usuario.keyboard('{Escape}');
    // Fechar por Esc equivaleria a "manter os dois" sem dizer isso, e manter é
    // justamente a saída que deixa o volume contado em dobro.
    expect(props.onEscolher).not.toHaveBeenCalled();
  });

  it('concorda o plural com quantos componentes foram atravessados', () => {
    montar({ quantos: 2 });
    expect(screen.getByText(/atravessa 2 componentes já desenhados/)).toBeTruthy();
  });
});
