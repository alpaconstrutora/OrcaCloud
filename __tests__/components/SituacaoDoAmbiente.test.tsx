// @vitest-environment jsdom
/**
 * As linhas de disciplina do cartão do ambiente (14/10/2026) — plano
 * `docs/planos/2026-10-14-ambiente-uso-disciplinas.md`, F1.2.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SituacaoDoAmbiente } from '../../components/blueprint/SituacaoDoAmbiente';

describe('SituacaoDoAmbiente', () => {
  it('uma linha por disciplina, com o estado; o clique abre a disciplina', async () => {
    const onAbrir = vi.fn();
    render(
      <SituacaoDoAmbiente
        nomeDoAmbiente="Banho"
        situacoes={[
          { disciplina: 'ELETRICA', estado: 'ok', texto: 'tomadas ✓ (1/1) · iluminação ✓' },
          { disciplina: 'HIDRAULICA', estado: 'falta', texto: 'kit banheiro: 0 de 8 pontos · faltam 8' },
          { disciplina: 'CLIMATIZACAO', estado: 'neutro', texto: 'Banheiro · não climatizado' },
        ]}
        onAbrir={onAbrir}
      />,
    );
    expect(screen.getByRole('list', { name: 'Disciplinas de Banho' })).toBeInTheDocument();
    const hidro = screen.getByRole('button', { name: /^Hidráulica de Banho: kit banheiro: 0 de 8 pontos/ });
    expect(hidro).toHaveAttribute('data-estado', 'falta');
    expect(screen.getByTestId('situacao-eletrica')).toHaveAttribute('data-estado', 'ok');
    expect(screen.getByTestId('situacao-climatizacao')).toHaveTextContent('Banheiro · não climatizado');
    await userEvent.setup().click(hidro);
    expect(onAbrir).toHaveBeenCalledWith('HIDRAULICA');
  });
});
