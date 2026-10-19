// @vitest-environment jsdom
/**
 * FilterPopover com `multiple` (guia §5.4: "múltipla escolha… estender o
 * componente (prop `multiple`), não montar outro popover").
 * Plano: docs/planos/2026-10-19-opura-market-media-por-tipo.md, item 3.
 *
 * Trava, pela tela:
 *   1. marcar/desmarcar alterna sem fechar o painel, na ordem das opções;
 *   2. o último marcado não desmarca e diz por quê no `title`;
 *   3. gatilho mostra o resumo e fica neutro com tudo marcado;
 *   4. "Restaurar padrão" volta ao padrão e fica travado quando já está nele;
 *   5. a escolha única continua fechando ao escolher.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { FilterPopover } from '../../components/ui/FilterPopover';

type Tipo = 'Apartamento' | 'Casa' | 'Terreno';
const OPCOES = [
  { value: 'Apartamento' as Tipo, label: 'Apartamento' },
  { value: 'Casa' as Tipo, label: 'Casa' },
  { value: 'Terreno' as Tipo, label: 'Terreno' },
];

function Multiplo({ inicial, padrao }: { inicial: Tipo[]; padrao?: Tipo[] }) {
  const [valor, setValor] = React.useState<Tipo[]>(inicial);
  return (
    <>
      <FilterPopover<Tipo>
        multiple
        label="Tipos"
        options={OPCOES}
        value={valor}
        onChange={setValor}
        resumo={(v) => (v.length === OPCOES.length ? 'Todos' : v.join(', '))}
        padrao={padrao}
      />
      <output data-testid="valor">{valor.join('|')}</output>
    </>
  );
}

const gatilho = () => screen.getByRole('button', { name: /Tipos/ });
const item = (nome: string) => screen.getByRole('menuitemcheckbox', { name: nome });

describe('FilterPopover — múltipla escolha', () => {
  it('alterna sem fechar e mantém a ordem das opções', async () => {
    const u = userEvent.setup();
    render(<Multiplo inicial={['Casa']} />);
    await u.click(gatilho());
    await u.click(item('Terreno'));
    await u.click(item('Apartamento'));
    expect(screen.getByTestId('valor').textContent).toBe('Apartamento|Casa|Terreno');
    expect(screen.getByRole('menu')).toBeTruthy();
    await u.click(item('Casa'));
    expect(screen.getByTestId('valor').textContent).toBe('Apartamento|Terreno');
    expect(item('Casa').getAttribute('aria-checked')).toBe('false');
  });

  it('o último marcado não desmarca e diz por quê', async () => {
    const u = userEvent.setup();
    render(<Multiplo inicial={['Casa']} />);
    await u.click(gatilho());
    const ultimo = item('Casa');
    expect(ultimo.getAttribute('aria-disabled')).toBe('true');
    expect(ultimo.getAttribute('title')).toMatch(/Pelo menos uma opção/);
    await u.click(ultimo);
    expect(screen.getByTestId('valor').textContent).toBe('Casa');
  });

  it('gatilho mostra o resumo; com tudo marcado fica neutro', async () => {
    const u = userEvent.setup();
    render(<Multiplo inicial={['Apartamento', 'Casa']} />);
    expect(gatilho().textContent).toContain('Apartamento, Casa');
    expect(gatilho().className).toContain('bg-blue-50');
    await u.click(gatilho());
    await u.click(item('Terreno'));
    await u.keyboard('{Escape}');
    expect(gatilho().textContent).not.toContain('Todos');
    expect(gatilho().className).not.toContain('bg-blue-50');
  });

  it('restaurar padrão volta ao padrão e fica travado quando já está nele', async () => {
    const u = userEvent.setup();
    render(<Multiplo inicial={['Terreno']} padrao={['Casa', 'Apartamento']} />);
    await u.click(gatilho());
    await u.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(screen.getByTestId('valor').textContent).toBe('Apartamento|Casa');
    const restaurar = screen.getByRole('button', { name: 'Restaurar padrão' });
    expect(restaurar.getAttribute('aria-disabled')).toBe('true');
    expect(restaurar.getAttribute('title')).toBe('A seleção já é a padrão.');
  });
});

describe('FilterPopover — escolha única continua igual', () => {
  it('escolher fecha o painel', async () => {
    const u = userEvent.setup();
    function Unico() {
      const [v, setV] = React.useState<'' | 'A'>('');
      return <FilterPopover<'' | 'A'> label="Status" options={[{ value: '', label: 'Todos' }, { value: 'A', label: 'Aberto' }]} value={v} onChange={setV} />;
    }
    render(<Unico />);
    await u.click(screen.getByRole('button', { name: /Status/ }));
    await u.click(screen.getByRole('menuitemradio', { name: 'Aberto' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: /Status/ }).textContent).toContain('Aberto');
  });
});
