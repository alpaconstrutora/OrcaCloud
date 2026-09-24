// @vitest-environment jsdom
/**
 * O RIBBON em si (13/09/2026) — o componente, fora do editor.
 *
 * O contrato pequeno que o editor confia: abas com `role="tab"`, a ativa
 * marcada, o painel com `role="toolbar"` envolvendo as duas linhas, grupos com
 * rótulo, aba contextual destacada, e `abaEfetiva` caindo na primeira quando a
 * salva não existe mais.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ribbon, { BarraDeOpcoes, GrupoDoRibbon, MenuDoRibbon, abaEfetiva } from '../../components/blueprint/Ribbon';

/** Ícone qualquer — o `MenuDoRibbon` só precisa de um componente. */
function Icone({ className }: { className?: string }) {
  return <svg className={className} />;
}

/** O ribbon com o recolher LIGADO no estado, como o editor o usa. */
function RibbonControlado({ comecaRecolhido = false }: { comecaRecolhido?: boolean }) {
  const [recolhido, setRecolhido] = useState(comecaRecolhido);
  return (
    <Ribbon
      abas={ABAS}
      ativa="a"
      onEscolher={() => {}}
      ariaLabel="Ferramentas"
      recolhido={recolhido}
      onRecolher={setRecolhido}
      acessoRapido={<button type="button">Desfazer</button>}
    >
      <GrupoDoRibbon rotulo="Construir">
        <button type="button">Selecionar</button>
      </GrupoDoRibbon>
    </Ribbon>
  );
}

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

  /**
   * RECOLHER (24/09/2026, P2.60) — *"o menubar está com 4 linhas. Ocupando muito
   * da tela"*. Medido na janela do print (1660×780): sobravam 243 px de 780 para
   * o desenho.
   */
  describe('recolher', () => {
    it('recolhido, o painel e o acesso rápido somem e as abas ficam; o botão devolve tudo', async () => {
      const user = userEvent.setup();
      render(<RibbonControlado />);
      expect(screen.getByRole('button', { name: 'Selecionar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /recolher a faixa/i }));
      expect(screen.queryByRole('button', { name: 'Selecionar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument();
      // As abas continuam: recolhido não é escondido — é a faixa fina do Revit.
      expect(screen.getAllByRole('tab')).toHaveLength(3);

      await user.click(screen.getByRole('button', { name: /mostrar a faixa/i }));
      expect(screen.getByRole('button', { name: 'Selecionar' })).toBeInTheDocument();
    });

    it('duplo clique na aba recolhe; recolhido, o clique na aba TRAZ o painel de volta', async () => {
      const user = userEvent.setup();
      render(<RibbonControlado />);
      await user.dblClick(screen.getByRole('tab', { name: 'Arquitetura' }));
      expect(screen.queryByRole('button', { name: 'Selecionar' })).not.toBeInTheDocument();
      // ⚠️ Sem isto o clique na aba não faz nada visível e o usuário acha que travou.
      await user.click(screen.getByRole('tab', { name: 'Terreno' }));
      expect(screen.getByRole('button', { name: 'Selecionar' })).toBeInTheDocument();
    });

    it('sem `onRecolher` não há botão de recolher — quem não guarda o estado não oferece o gesto', () => {
      render(
        <Ribbon abas={ABAS} ativa="a" onEscolher={() => {}} ariaLabel="Ferramentas">
          <span />
        </Ribbon>,
      );
      expect(screen.queryByRole('button', { name: /faixa de comandos/i })).not.toBeInTheDocument();
    });
  });

  /** MENUS ▾ (24/09/2026, P2.60): quatro grupos de comandos numa fileira só. */
  describe('MenuDoRibbon', () => {
    function montarMenu(onClick = () => {}, contagem?: number) {
      return render(
        <MenuDoRibbon rotulo="Acabamentos" icone={Icone} contagem={contagem} ajuda="Piso, forro e rodapé">
          <button type="button" onClick={onClick}>
            Piso e forro
          </button>
        </MenuDoRibbon>,
      );
    }

    it('fechado, o comando não está no DOM; o clique abre, executa e fecha', async () => {
      const user = userEvent.setup();
      const escolher = vi.fn();
      montarMenu(escolher);
      const menu = screen.getByRole('button', { name: /^Acabamentos/ });
      expect(menu).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: 'Piso e forro' })).not.toBeInTheDocument();

      await user.click(menu);
      expect(menu).toHaveAttribute('aria-expanded', 'true');
      await user.click(screen.getByRole('button', { name: 'Piso e forro' }));
      expect(escolher).toHaveBeenCalledTimes(1);
      // Fecha ao escolher: quem escolheu já terminou aqui.
      expect(screen.queryByRole('button', { name: 'Piso e forro' })).not.toBeInTheDocument();
    });

    it('Esc e o clique fora fecham', async () => {
      const user = userEvent.setup();
      montarMenu();
      await user.click(screen.getByRole('button', { name: /^Acabamentos/ }));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('button', { name: 'Piso e forro' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^Acabamentos/ }));
      await user.click(document.body);
      expect(screen.queryByRole('button', { name: 'Piso e forro' })).not.toBeInTheDocument();
    });

    it('a contagem é a PENDÊNCIA: aparece quando há, some quando é zero', () => {
      const { unmount } = montarMenu(() => {}, 12);
      expect(screen.getByRole('button', { name: /^Acabamentos/ })).toHaveTextContent('12');
      unmount();
      montarMenu(() => {}, 0);
      expect(screen.getByRole('button', { name: /^Acabamentos/ })).not.toHaveTextContent(/\d/);
    });
  });
});
