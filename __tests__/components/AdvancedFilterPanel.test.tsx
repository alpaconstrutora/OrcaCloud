// @vitest-environment jsdom
/**
 * Filtro avançado: o valor se ESCOLHE quando o app conhece as opções (10/10/2026).
 * Pedido: docs/planos/2026-10-10-filtro-avancado-valores-em-lista.md
 *
 * Em Minhas Tarefas o usuário filtrou "Status Não é concluído" digitando, e nada
 * mudou. Estes casos travam, pela tela:
 *   1. campo `select` lista as opções e escolher filtra de verdade;
 *   2. campo `text` + `options` abre a lista com busca (portal em document.body),
 *      digitar recorta, escolher grava — e escolher NÃO fecha o painel (o clique
 *      no portal não é "clique fora");
 *   3. Esc na lista fecha só a lista, não o painel;
 *   4. regra salva antes ("concluído", digitada) aparece marcada na opção certa.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdvancedFilterPanel, useAdvancedFilters, applyFilterRules, distinctOptions,
  type FilterFieldConfig,
} from '../../components/ui/FilterUtils';

type Linha = { titulo: string; status: string; obra: string };
const LINHAS: Linha[] = [
  { titulo: 'Reboco parede', status: 'Concluído', obra: 'Residencial Ipê' },
  { titulo: 'Pintura', status: 'Em Andamento', obra: 'Edifício São João' },
  { titulo: 'Construção almoxarifado', status: 'Pendente', obra: 'Residencial Ipê' },
];
const CAMPOS: FilterFieldConfig[] = [
  { key: 'titulo', label: 'Nome', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['Pendente', 'Em Andamento', 'Concluído'].map(v => ({ value: v, label: v })) },
  { key: 'obra', label: 'Obra', type: 'text', options: distinctOptions(LINHAS, l => l.obra) },
];
const CHAVE = 'teste:filtroAvancado';

function Tela() {
  const state = useAdvancedFilters(CAMPOS, CHAVE);
  const visiveis = applyFilterRules(LINHAS, state.rules, CAMPOS, (l, k) => l[k as keyof Linha]);
  return (
    <div>
      <AdvancedFilterPanel fields={CAMPOS} state={state} />
      <ul aria-label="linhas">{visiveis.map(l => <li key={l.titulo}>{l.titulo}</li>)}</ul>
    </div>
  );
}

const linhas = () => within(screen.getByRole('list', { name: 'linhas' })).queryAllByRole('listitem').map(li => li.textContent);

async function abrirComUmaRegra(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Filtro avançado/ }));
  await user.click(screen.getByRole('button', { name: /Adicionar filtro/ }));
  // a regra tem 2 selects fixos: campo e operador (o 3º, quando existe, é o valor)
  return () => screen.getAllByRole('combobox');
}

beforeEach(() => localStorage.clear());

describe('AdvancedFilterPanel — valor escolhido da lista', () => {
  it('Status: lista as opções e "Não é Concluído" esconde as concluídas', async () => {
    const user = userEvent.setup();
    render(<Tela />);
    const combos = await abrirComUmaRegra(user);
    await user.selectOptions(combos()[0], 'status');
    await user.selectOptions(combos()[1], 'is_not');
    const valor = combos()[2] as HTMLSelectElement;
    expect([...valor.options].map(o => o.textContent)).toEqual(['Selecione uma opção', 'Pendente', 'Em Andamento', 'Concluído']);
    await user.selectOptions(valor, 'Concluído');
    expect(linhas()).toEqual(['Pintura', 'Construção almoxarifado']);
  });

  it('Obra: clicar abre a lista inteira, digitar recorta, escolher grava sem fechar o painel', async () => {
    const user = userEvent.setup();
    render(<Tela />);
    const combos = await abrirComUmaRegra(user);
    await user.selectOptions(combos()[0], 'obra');
    await user.selectOptions(combos()[1], 'is');
    const input = screen.getByPlaceholderText('Escolha ou digite...');
    await user.click(input);
    const lista = screen.getByRole('listbox');
    expect(lista.parentElement).toBe(document.body); // portal: imune ao overflow-hidden da toolbar
    expect(within(lista).getAllByRole('option').map(o => o.textContent)).toEqual(['Edifício São João', 'Residencial Ipê']);

    await user.type(input, 'sao');           // sem acento e em minúscula
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)).toEqual(['Edifício São João']);

    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Edifício São João' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveValue('Edifício São João');
    expect(screen.getByText('Filtros')).toBeInTheDocument(); // o painel continua aberto
    expect(linhas()).toEqual(['Pintura']);
  });

  it('Obra: "Contém" com texto digitado continua valendo', async () => {
    const user = userEvent.setup();
    render(<Tela />);
    const combos = await abrirComUmaRegra(user);
    await user.selectOptions(combos()[0], 'obra');   // operador padrão de texto = Contém
    await user.type(screen.getByPlaceholderText('Escolha ou digite...'), 'residencial');
    expect(linhas()).toEqual(['Reboco parede', 'Construção almoxarifado']);
  });

  it('Esc fecha só a lista; o painel continua aberto', async () => {
    const user = userEvent.setup();
    render(<Tela />);
    const combos = await abrirComUmaRegra(user);
    await user.selectOptions(combos()[0], 'obra');
    await user.click(screen.getByPlaceholderText('Escolha ou digite...'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Filtros')).toBeInTheDocument();
  });

  it('regra salva antes, digitada "concluído", aparece marcada em Concluído e filtra', async () => {
    localStorage.setItem(`${CHAVE}:rules`, JSON.stringify([{ id: 'r1', fieldKey: 'status', operator: 'is_not', value: 'concluído' }]));
    const user = userEvent.setup();
    render(<Tela />);
    expect(linhas()).toEqual(['Pintura', 'Construção almoxarifado']);
    await user.click(screen.getByRole('button', { name: /Filtro avançado/ }));
    expect((screen.getAllByRole('combobox')[2] as HTMLSelectElement).value).toBe('Concluído');
  });
});
