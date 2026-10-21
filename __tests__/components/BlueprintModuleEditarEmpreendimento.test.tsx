// @vitest-environment jsdom
/**
 * Planta Inteligente › lista (21/10/2026, plano 2026-10-21-planta-lista-editar-e-empreendimento.md):
 * o lápis deixou de abrir o editor e passou a abrir o drawer de nome + empreendimento; a tabela
 * ganhou a coluna Empreendimento (`empreendimentos.blueprint_study_id`).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  renameStudy: vi.fn(async (id: string, nome: string) => ({
    id,
    organization_id: 'org-1',
    name: nome.trim(),
    status: 'RASCUNHO',
    updated_at: '2026-10-21T00:00:00Z',
  })),
  vincularEmpreendimento: vi.fn(async () => undefined),
}));

vi.mock('../../services/blueprintService', () => ({
  listStudies: vi.fn(async () => [
    { id: 's1', organization_id: 'org-1', name: 'Planta Torre A', status: 'RASCUNHO', updated_at: '2026-10-01T00:00:00Z' },
    { id: 's2', organization_id: 'org-1', name: 'Planta Torre B', status: 'RASCUNHO', updated_at: '2026-10-02T00:00:00Z' },
  ]),
  listBranches: vi.fn(async (studyId: string) => [{ id: `br_${studyId}`, study_id: studyId, principal: true }]),
  ramoPrincipal: vi.fn((ramos: { id: string }[]) => ramos[0] ?? null),
  createStudy: vi.fn(),
  duplicateStudy: vi.fn(),
  archiveStudy: vi.fn(),
  renameStudy: svc.renameStudy,
  vincularEmpreendimento: svc.vincularEmpreendimento,
}));
vi.mock('../../services/empreendimentoService', () => ({
  empreendimentoService: {
    list: vi.fn(async () => [
      { id: 'e1', name: 'Residencial Aurora', organization_id: 'org-1', blueprint_study_id: 's1' },
      { id: 'e2', name: 'Garden Cambuhy', organization_id: 'org-1', blueprint_study_id: null },
      { id: 'e3', name: 'Outra Org Empreend', organization_id: 'org-2', blueprint_study_id: null },
    ]),
  },
}));
vi.mock('../../services/regulatoryMapService', () => ({ regulatoryMapService: { list: vi.fn(async () => []), getById: vi.fn(), remove: vi.fn() } }));
vi.mock('../../components/blueprint/BlueprintEditor', () => ({
  default: ({ study }: { study: { name: string } }) => <div data-testid="editor-aberto">{study.name}</div>,
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import BlueprintModule from '../../components/blueprint/BlueprintModule';
import { useStore } from '../../store/useStore';

const linhaDe = async (nome: string) => (await screen.findByText(nome)).closest('tr') as HTMLElement;

describe('Planta Inteligente — lista: Editar em drawer e coluna Empreendimento', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ viewFocus: null });
    window.location.hash = '#/blueprint';
    svc.renameStudy.mockClear();
    svc.vincularEmpreendimento.mockClear();
  });

  it('a coluna Empreendimento mostra o empreendimento que aponta para a planta, e "—" sem vínculo', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    expect(await within(await linhaDe('Planta Torre A')).findByText('Residencial Aurora')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Empreendimento/ })).toBeTruthy();
    expect(within(await linhaDe('Planta Torre B')).getByText('—')).toBeTruthy();
  });

  it('o lápis abre o drawer — não entra na planta; "Abrir" continua entrando', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    const linha = await linhaDe('Planta Torre B');
    fireEvent.click(within(linha).getByTitle('Editar nome e empreendimento'));
    expect(await screen.findByText('Editar planta')).toBeTruthy();
    expect(screen.queryByTestId('editor-aberto')).toBeNull();
    expect((screen.getByLabelText('Nome da planta') as HTMLInputElement).value).toBe('Planta Torre B');

    // Só a org da planta; o já ligado a outra planta aparece desligado e diz a qual.
    const select = screen.getByLabelText('Empreendimento') as HTMLSelectElement;
    const opcoes = Array.from(select.options).map((o) => ({ texto: o.textContent, desligada: o.disabled }));
    expect(opcoes).toEqual([
      { texto: '— Sem vínculo —', desligada: false },
      { texto: 'Garden Cambuhy', desligada: false },
      { texto: 'Residencial Aurora — vinculado a «Planta Torre A»', desligada: true },
    ]);

    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(within(await linhaDe('Planta Torre A')).getByText('Abrir'));
    expect((await screen.findByTestId('editor-aberto')).textContent).toBe('Planta Torre A');
  });

  it('Salvar desligado diz por quê enquanto nada mudou', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    fireEvent.click(within(await linhaDe('Planta Torre B')).getByTitle('Editar nome e empreendimento'));
    const salvar = (await screen.findByText('Salvar')).closest('button') as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    expect(salvar.title).toBe('Nada foi alterado.');
  });

  it('salvar grava nome + vínculo e a linha mostra os dois, sem recarregar a lista', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    fireEvent.click(within(await linhaDe('Planta Torre B')).getByTitle('Editar nome e empreendimento'));
    await screen.findByText('Editar planta');
    fireEvent.change(screen.getByLabelText('Nome da planta'), { target: { value: 'Garden — Torre B' } });
    fireEvent.change(screen.getByLabelText('Empreendimento'), { target: { value: 'e2' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(screen.queryByText('Editar planta')).toBeNull());
    expect(svc.renameStudy).toHaveBeenCalledWith('s2', 'Garden — Torre B');
    expect(svc.vincularEmpreendimento).toHaveBeenCalledWith('s2', 'e2');
    const linha = await linhaDe('Garden — Torre B');
    expect(within(linha).getByText('Garden Cambuhy')).toBeTruthy();
  });

  it('desvincular deixa a célula com "—"', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    const linhaA = await linhaDe('Planta Torre A');
    await within(linhaA).findByText('Residencial Aurora');
    fireEvent.click(within(linhaA).getByTitle('Editar nome e empreendimento'));
    await screen.findByText('Editar planta');
    fireEvent.change(screen.getByLabelText('Empreendimento'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(screen.queryByText('Editar planta')).toBeNull());
    expect(svc.renameStudy).not.toHaveBeenCalled();
    expect(svc.vincularEmpreendimento).toHaveBeenCalledWith('s1', null);
    expect(within(await linhaDe('Planta Torre A')).getByText('—')).toBeTruthy();
  });
});
