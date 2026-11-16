// @vitest-environment jsdom
/**
 * StandardTable (15/11/2026, crítica das Áreas NBR 12721): cabeçalho em dois níveis
 * (`gruposDeColunas`), 1ª coluna fixa (`colunaFixa`, §6.13.1), nome acessível nas caixas
 * de seleção e Shift+clique para marcar um intervalo (§10.1).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StandardTable, type StandardTableColumn } from '../../components/ui/StandardTable';

interface Linha {
  id: string;
  nome: string;
  a: number;
  b: number;
  c: number;
}
const LINHAS: Linha[] = ['Alfa', 'Beta', 'Gama', 'Delta', 'Épsilon'].map((nome, i) => ({ id: `l${i}`, nome, a: i, b: i * 2, c: i * 3 }));
const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Nome', width: 160 },
  { key: 'a', label: 'A (1)', width: 100, align: 'right' },
  { key: 'b', label: 'B (2)', width: 100, align: 'right' },
  { key: 'c', label: 'C (3)', width: 100, align: 'right' },
];

function Tabela(props: { comSelecao?: boolean; fixa?: boolean; grupos?: boolean }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  return (
    <>
      <StandardTable<Linha>
        columns={COLUNAS}
        storageKey="teste:niveis"
        rows={LINHAS}
        rowKey={(l) => l.id}
        renderCell={(key, l) => <span>{String(l[key as keyof Linha])}</span>}
        colunaFixa={props.fixa}
        gruposDeColunas={props.grupos ? [{ rotulo: 'Grupo AB', colunas: ['a', 'b'] }] : undefined}
        selection={props.comSelecao ? { selected: sel, onChange: setSel, label: (l) => `Selecionar ${l.nome}` } : undefined}
      />
      <output data-testid="sel">{[...sel].sort().join(',')}</output>
    </>
  );
}

beforeEach(() => localStorage.clear());

describe('StandardTable — dois níveis, coluna fixa, seleção', () => {
  it('gruposDeColunas: uma linha de grupo sobre as colunas do grupo, com colSpan', () => {
    render(<Tabela grupos />);
    const grupo = screen.getByRole('columnheader', { name: 'Grupo AB' });
    expect(grupo.getAttribute('colspan')).toBe('2');
    expect(grupo.getAttribute('scope')).toBe('colgroup');
    expect(document.querySelectorAll('thead tr')).toHaveLength(2);
  });

  it('colunaFixa: a 1ª coluna de dado e a caixa ficam sticky (left 40 e 0) e a tabela usa border-separate', () => {
    render(<Tabela fixa comSelecao />);
    const th = screen.getByRole('columnheader', { name: /Nome/ });
    expect(th.style.position).toBe('sticky');
    expect(th.style.left).toBe('40px');
    const primeiraCelula = screen.getByText('Alfa').closest('td')!;
    expect(primeiraCelula.style.position).toBe('sticky');
    expect(screen.getByRole('checkbox', { name: 'Selecionar Alfa' }).closest('td')!.style.left).toBe('0px');
    expect(document.querySelector('table')!.className).toContain('border-separate');
  });

  it('caixas com nome acessível; Shift+clique marca o intervalo desde a última caixa clicada', async () => {
    const user = userEvent.setup();
    render(<Tabela comSelecao />);
    expect(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas visíveis' })).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Beta' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Delta' }));
    await user.keyboard('{/Shift}');
    expect(screen.getByTestId('sel').textContent).toBe('l1,l2,l3');
    // Sem Shift, volta a ser uma caixa só.
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Alfa' }));
    expect(screen.getByTestId('sel').textContent).toBe('l0,l1,l2,l3');
  });
});
