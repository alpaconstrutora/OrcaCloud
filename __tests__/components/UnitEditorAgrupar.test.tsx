// @vitest-environment jsdom
/**
 * Seção Unidades (Torres e Unidades): "implemente filtro Grupo + classificacao + expandir / ocultar" (25/11/2026,
 * docs/planos/2026-11-25-unidades-agrupar.md). Abre por Pavimento, como sempre foi; o Agrupar troca o campo.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({ listUnits: vi.fn(), updateUnit: vi.fn(), updateTower: vi.fn() }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import UnitEditor from '../../components/empreendimento/UnitEditor';

const TORRE = { id: 't1', empreendimento_id: 'e1', name: 'Torre A', created_at: '', updated_at: '' };
const und = (id: string, floor: number, typology: string) =>
  ({ id, tower_id: 't1', name: id, floor, typology, sort_order: 0, status: 'DISPONIVEL', created_at: '', updated_at: '' });

const nomesNaTela = () =>
  screen.getAllByRole('row').map(r => within(r).queryAllByRole('cell')[1]?.textContent ?? '').filter(t => /^\d{3}$/.test(t));

describe('Torres e Unidades › Agrupar', () => {
  beforeEach(() => {
    localStorage.clear();
    svc.listUnits.mockReset();
    svc.listUnits.mockResolvedValue([und('101', 1, 'Tipo 1'), und('102', 1, 'Tipo 2'), und('201', 2, 'Tipo 1')]);
  });

  it('abre por Pavimento e recolhe/expande todos', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toEqual(['101', '102', '201']));
    expect(screen.getByRole('combobox', { name: 'Agrupar as unidades' })).toHaveValue('pavimento');
    await userEvent.click(screen.getByRole('button', { name: 'Recolher todos os grupos' }));
    expect(nomesNaTela()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Expandir todos os grupos' }));
    expect(nomesNaTela()).toEqual(['101', '102', '201']);
  });

  it('Decrescente inverte a ordem dos pavimentos', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordem dos grupos' }), 'desc');
    expect(nomesNaTela()).toEqual(['201', '101', '102']);
  });

  it('por Tipologia: grupos da tipologia, sem "Ordenar por número", e as setas dizem por que estão desligadas', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Agrupar as unidades' }), 'typology');
    expect(screen.getAllByTestId('nome-do-grupo').map(e => e.textContent)).toEqual(['Tipo 1', 'Tipo 2']);
    expect(nomesNaTela()).toEqual(['101', '201', '102']);
    expect(screen.queryByRole('button', { name: /Ordenar por número/ })).not.toBeInTheDocument();
    const subir = screen.getAllByRole('button', { name: 'Subir na ordem do pavimento' })[1];
    expect(subir).toBeDisabled();
    expect(subir.parentElement).toHaveAttribute('title', 'Agrupe por Pavimento para mudar a ordem');
  });

  it('sem agrupamento: lista corrida, sem cabeçalho de grupo, e o recolher todos desligado', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Agrupar as unidades' }), 'none');
    expect(screen.queryByTestId('nome-do-pavimento')).not.toBeInTheDocument();
    expect(nomesNaTela()).toEqual(['101', '102', '201']);
    expect(screen.getByRole('button', { name: 'Recolher todos os grupos' })).toBeDisabled();
  });

  it('todas as colunas no Agrupar (menos Unidade) e o botão de ajustar a largura (25/11/2026)', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    const opcoes = within(screen.getByRole('combobox', { name: 'Agrupar as unidades' })).getAllByRole('option').map(o => o.textContent);
    expect(opcoes).toEqual(['Agrupar', 'Pavimento', 'Tipo do pavimento', 'Elevação', 'Tipologia', 'Área privativa', 'Área comum',
      'Dormitórios', 'Banheiros', 'Suítes', 'Vagas', 'Posição', 'Vista', 'Orientação']);
    // jsdom não tem layout: o ajuste não mede nada e não pode quebrar (nem zerar as larguras).
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar largura das colunas ao conteúdo' }));
    expect(nomesNaTela()).toEqual(['101', '102', '201']);
    // Cada coluna de dado tem a sua <col> (o ajuste lê por elas) e o espaçador fica antes de Ações.
    const chaves = Array.from(document.querySelectorAll('colgroup col')).map(c => c.getAttribute('data-col-key'));
    expect(chaves.slice(-2)).toEqual([null, 'actions']);
    expect(chaves.filter(Boolean)).toHaveLength(15);
  });

  it('edição em lote tem todas as colunas editáveis, inclusive Vagas, e grava o que foi preenchido (27/11/2026)', async () => {
    svc.updateUnit.mockImplementation(async (id: string, p: Record<string, unknown>) => ({ id, ...p }));
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    const linha101 = screen.getAllByRole('row').find(r => within(r).queryAllByRole('cell')[1]?.textContent === '101')!;
    await userEvent.click(within(linha101).getByRole('checkbox'));
    for (const campo of ['Pavimento', 'Tipo do pavimento', 'Tipologia', 'Área privativa (m²)', 'Área comum (m²)', 'Dormitórios',
      'Banheiros', 'Suítes', 'Vagas', 'Posição', 'Vista', 'Orientação']) {
      expect(screen.getByLabelText(campo)).toBeInTheDocument();
    }
    await userEvent.type(screen.getByLabelText('Vagas'), '2');
    await userEvent.click(screen.getByRole('button', { name: /Aplicar/ }));
    await waitFor(() => expect(svc.updateUnit).toHaveBeenCalledWith('101', { parking_spaces: 2 }));
  });

  it('seletor de colunas: esconde a coluna e mantém o cabeçalho do grupo e o total alinhados (25/11/2026)', async () => {
    render(<UnitEditor tower={TORRE as never} />);
    await waitFor(() => expect(nomesNaTela()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Configurar colunas' }));
    const dialogo = within(await screen.findByRole('dialog'));
    // Unidade fica sempre: não é opção do seletor.
    expect(dialogo.queryByLabelText('Unidade')).not.toBeInTheDocument();
    await userEvent.click(dialogo.getByLabelText('Vagas'));
    await userEvent.click(dialogo.getByLabelText('Área privativa (m²)'));
    await userEvent.click(dialogo.getByRole('button', { name: /Fechar/ }));

    const cabecalhos = screen.getAllByRole('columnheader').map(th => th.textContent ?? '');
    expect(cabecalhos.some(t => t.startsWith('Vagas'))).toBe(false);
    expect(cabecalhos.some(t => t.startsWith('Priv.'))).toBe(false);
    expect(cabecalhos.some(t => t.startsWith('Comum'))).toBe(true);
    // Cada linha ocupa exatamente as colunas do cabeçalho (o colSpan do rótulo/resto se ajusta).
    const largura = (tr: Element) => Array.from(tr.children).reduce((s, td) => s + Number(td.getAttribute('colspan') ?? 1), 0);
    // Todos os <th>, inclusive o espaçador (aria-hidden, fora do papel columnheader).
    const total = document.querySelectorAll('thead th').length;
    const linhas = Array.from(document.querySelectorAll('tbody tr, tfoot tr'));
    expect(linhas.length).toBeGreaterThan(3);
    for (const tr of linhas) expect(largura(tr)).toBe(total);
    expect(document.querySelectorAll('colgroup col')).toHaveLength(total);
  });
});
