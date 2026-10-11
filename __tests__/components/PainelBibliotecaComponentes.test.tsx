// @vitest-environment jsdom
/**
 * F9 — o painel da BIBLIOTECA: a busca filtra a grade, o clique arma a ferramenta e o
 * arraste leva o tipo no formato próprio (o canvas só aceita esse).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelBibliotecaComponentes from '../../components/blueprint/PainelBibliotecaComponentes';
import { MIME_DO_COMPONENTE } from '../../utils/blueprintBiblioteca';

describe('PainelBibliotecaComponentes', () => {
  it('a busca filtra a grade e diz quando não acha nada', async () => {
    const user = userEvent.setup();
    render(<PainelBibliotecaComponentes ativo={null} onEscolher={vi.fn()} />);
    await user.type(screen.getByLabelText('Buscar na biblioteca de componentes'), 'sofa');
    expect(screen.getAllByRole('button', { name: /centímetros/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Sofá,/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar na biblioteca de componentes'));
    await user.type(screen.getByLabelText('Buscar na biblioteca de componentes'), 'xyz');
    expect(screen.getByText('Nada com "xyz".')).toBeInTheDocument();
  });

  it('clicar arma a ferramenta com o tipo; o tipo armado aparece marcado', async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    render(<PainelBibliotecaComponentes ativo="CAMA_CASAL" onEscolher={onEscolher} />);
    await user.click(screen.getByRole('button', { name: /^Geladeira,/ }));
    expect(onEscolher).toHaveBeenCalledWith('GELADEIRA');
    expect(screen.getByRole('button', { name: /^Cama de casal,/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('arrastar leva o tipo no formato da biblioteca', () => {
    render(<PainelBibliotecaComponentes ativo={null} onEscolher={vi.fn()} />);
    const dados: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => (dados[k] = v), effectAllowed: '' };
    fireEvent.dragStart(screen.getByRole('button', { name: /^Sofá,/ }), { dataTransfer });
    expect(dados[MIME_DO_COMPONENTE]).toBe('SOFA');
  });

  it('sem pavimento, as miniaturas ficam desligadas e o painel diz por quê', () => {
    render(<PainelBibliotecaComponentes ativo={null} onEscolher={vi.fn()} semPavimento />);
    expect(screen.getByText('Crie um pavimento para pôr peças na planta.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sofá,/ })).toBeDisabled();
  });
});
