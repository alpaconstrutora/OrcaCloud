// @vitest-environment jsdom
/**
 * O RIBBON em si (13/09/2026) — o componente, fora do editor.
 *
 * O contrato pequeno que o editor confia: abas com `role="tab"`, a ativa
 * marcada, o painel com `role="toolbar"` envolvendo as duas linhas, grupos com
 * rótulo, aba contextual destacada, e `abaEfetiva` caindo na primeira quando a
 * salva não existe mais.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ribbon, { BarraDeOpcoes, GrupoDoRibbon, abaEfetiva } from '../../components/blueprint/Ribbon';

const ABAS = [
  { id: 'a', rotulo: 'Arquitetura' },
  { id: 'b', rotulo: 'Terreno' },
  { id: 'm', rotulo: 'Modificar', contextual: true },
] as const;

describe('Ribbon', () => {
  it('abas com a ativa marcada; o clique avisa; o seletor da esquerda e o acesso rápido ficam DENTRO da toolbar', async () => {
    const onEscolher = vi.fn();
    render(
      <Ribbon
        abas={ABAS}
        ativa="a"
        onEscolher={onEscolher}
        ariaLabel="Ferramentas"
        esquerda={<button type="button">Planta</button>}
        direita={<button type="button">Desfazer</button>}
      >
        <GrupoDoRibbon rotulo="Construir">
          <button type="button">Selecionar</button>
        </GrupoDoRibbon>
      </Ribbon>,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Ferramentas' });
    expect(within(toolbar).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Arquitetura',
      'Terreno',
      'Modificar',
    ]);
    expect(screen.getByRole('tab', { name: 'Arquitetura' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Terreno' })).toHaveAttribute('aria-selected', 'false');
    expect(within(toolbar).getByRole('button', { name: 'Planta' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    // O grupo é nomeado pelo rótulo — é o que o leitor de tela anuncia.
    expect(within(screen.getByRole('group', { name: 'Construir' })).getByRole('button', { name: 'Selecionar' })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Terreno' }));
    expect(onEscolher).toHaveBeenCalledWith('b');
  });

  it('a aba contextual se destaca do resto (verde, não azul)', () => {
    render(
      <Ribbon abas={ABAS} ativa="m" onEscolher={() => {}} ariaLabel="Ferramentas">
        <span />
      </Ribbon>,
    );
    expect(screen.getByRole('tab', { name: 'Modificar' }).className).toMatch(/emerald/);
    expect(screen.getByRole('tab', { name: 'Arquitetura' }).className).not.toMatch(/emerald/);
  });

  it('abaEfetiva: a salva quando existe; senão a preferida; senão a primeira', () => {
    expect(abaEfetiva(ABAS, 'b')).toBe('b');
    expect(abaEfetiva(ABAS.slice(0, 1), 'b')).toBe('a');
    expect(abaEfetiva(ABAS.slice(1), 'a', 'm')).toBe('m');
    expect(abaEfetiva(ABAS.slice(0, 1), 'b', 'm')).toBe('a');
  });

  it('a barra de opções é uma região nomeada que começa pelo nome da ferramenta', () => {
    render(
      <BarraDeOpcoes rotulo="Parede em polígono">
        <label>
          Lados <select />
        </label>
      </BarraDeOpcoes>,
    );
    const regiao = screen.getByRole('region', { name: /opções da ferramenta/i });
    expect(regiao).toHaveTextContent(/^Parede em polígono/);
    expect(within(regiao).getByLabelText(/lados/i)).toBeInTheDocument();
  });
});
