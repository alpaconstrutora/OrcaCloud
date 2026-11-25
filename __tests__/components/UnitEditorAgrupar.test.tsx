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
});
