// @vitest-environment jsdom
/**
 * O menu de Componentes em TRÊS colunas (10/09/2026).
 *
 * *"o popover componentes ficou enorme"* — com a taxonomia elétrica o catálogo
 * passou de 20 para 33 itens em 12 grupos, e numa coluna só de 288 px o menu
 * chegava a ~1.000 px de altura.
 *
 * ⚠️ O risco de uma distribuição por regra de título é um grupo cair em coluna
 * NENHUMA — ele sumiria do menu sem erro. Por isso o caso que importa é o que
 * confere que TODO grupo aparece, e aparece uma vez só.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import MenuComponentes, { ORDEM_DOS_GRUPOS } from '../../components/blueprint/MenuComponentes';

async function abrir() {
  const user = userEvent.setup();
  render(
    <MenuComponentes
      tool="selecionar"
      tipoAbertura="door"
      tipoEstrutural="PILAR"
      onEscolher={() => {}}
    />,
  );
  await user.click(screen.getByRole('button', { name: /componentes/i }));
  return screen.getByRole('menu');
}

describe('MenuComponentes · colunas', () => {
  it('⚠️ TODO grupo do catálogo aparece, uma vez só', async () => {
    const menu = await abrir();
    expect(ORDEM_DOS_GRUPOS.length).toBeGreaterThanOrEqual(10);
    for (const titulo of ORDEM_DOS_GRUPOS) {
      const ocorrencias = Array.from(menu.querySelectorAll('span')).filter(
        (el) => el.textContent === titulo,
      );
      expect(ocorrencias, `grupo "${titulo}"`).toHaveLength(1);
    }
  });

  it('a elétrica fica junta, numa coluna própria', async () => {
    const menu = await abrir();
    const colunas = Array.from(menu.children);
    expect(colunas).toHaveLength(3);
    const eletrica = colunas[2].textContent ?? '';
    expect(eletrica).toContain('Elétrica — iluminação');
    expect(eletrica).toContain('Elétrica — tomadas');
    expect(eletrica).toContain('Elétrica — especiais e dados');
    // E NADA de arquitetura vazou para lá.
    expect(eletrica).not.toContain('Alvenaria');
  });

  it('nenhuma coluna fica vazia — coluna vazia é largura jogada fora', async () => {
    const menu = await abrir();
    for (const [i, coluna] of Array.from(menu.children).entries()) {
      expect(coluna.querySelectorAll('button').length, `coluna ${i + 1}`).toBeGreaterThan(0);
    }
  });
});
