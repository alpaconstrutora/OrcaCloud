// @vitest-environment jsdom
/**
 * Menu de Encaixe — o ímã do grupo Modos.
 *
 * Usuário, 14/10/2026: *"ao clicar no botão nao abriu o menu com checkboxes"*.
 * O ímã do grupo Modos era um liga/desliga com o MESMO ícone do menu; agora ele
 * é o menu, com o liga/desliga geral como primeiro item. Estes casos prendem
 * as três coisas que o relato cobrou: o botão abre a lista, o item mestre liga
 * e desliga tudo, e a etiqueta conta só encaixes (o mestre não é um).
 */
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuEncaixe from '../../components/blueprint/MenuEncaixe';
import { TIPOS_DE_ENCAIXE } from '../../utils/blueprintEncaixe';

function Montado({ inicial }: { inicial: string[] }) {
  const [ligados, setLigados] = useState<string[]>(inicial);
  return (
    <MenuEncaixe
      compacto
      ativos={new Set(ligados)}
      onAlternar={(k) => setLigados((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))}
      onDefinirTodos={(ligar) => setLigados(ligar ? [...TIPOS_DE_ENCAIXE] : [])}
    />
  );
}

const botao = () => screen.getByRole('button', { name: /^encaixe/i });
const mestre = () => screen.getByRole('menuitemcheckbox', { name: /ímã/i });

describe('MenuEncaixe compacto (grupo Modos)', () => {
  it('o clique no ímã ABRE a lista — o mestre e os oito encaixes', async () => {
    render(<Montado inicial={[...TIPOS_DE_ENCAIXE]} />);
    await userEvent.click(botao());
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(TIPOS_DE_ENCAIXE.length + 1);
  });

  it('o item mestre desliga TODOS e, de novo, liga todos', async () => {
    render(<Montado inicial={['EXTREMIDADE']} />);
    await userEvent.click(botao());

    expect(mestre()).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(mestre());
    expect(mestre()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemcheckbox', { name: /extremidade/i })).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(mestre());
    for (const item of screen.getAllByRole('menuitemcheckbox')) {
      expect(item).toHaveAttribute('aria-checked', 'true');
    }
  });

  it('a etiqueta conta ENCAIXES ligados, não o item mestre', () => {
    render(<Montado inicial={['EXTREMIDADE', 'CANTO']} />);
    expect(botao()).toHaveTextContent('2');
  });

  it('com tudo desligado, a etiqueta some', () => {
    render(<Montado inicial={[]} />);
    expect(botao()).not.toHaveTextContent(/\d/);
  });
});
