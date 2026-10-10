// @vitest-environment jsdom
/**
 * Planta Inteligente › o LINK DIRETO `#/blueprint?studyId=…` (pendência D4,
 * 10/10/2026). No passeio de 05/10 o link não abriu o estudo: o módulo só lia o
 * parâmetro ao MONTAR, e com a lista de plantas já na tela a vista continua
 * "blueprint" — o roteador não remonta nada, e o pedido ficava sem efeito.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/blueprintService', () => ({
  listStudies: vi.fn(async () => [
    { id: 's1', name: 'Planta Torre A', status: 'RASCUNHO', updated_at: '2026-10-01T00:00:00Z' },
    { id: 's2', name: 'Planta Torre B', status: 'RASCUNHO', updated_at: '2026-10-02T00:00:00Z' },
  ]),
  listBranches: vi.fn(async (studyId: string) => [{ id: `br_${studyId}`, study_id: studyId, is_main: true }]),
  ramoPrincipal: vi.fn((ramos: { id: string }[]) => ramos[0] ?? null),
  createStudy: vi.fn(),
  duplicateStudy: vi.fn(),
  archiveStudy: vi.fn(),
}));
vi.mock('../../services/regulatoryMapService', () => ({ regulatoryMapService: { list: vi.fn(async () => []), getById: vi.fn(), remove: vi.fn() } }));
// O editor é pesado: no lugar dele, uma marca que diz QUAL estudo abriu.
vi.mock('../../components/blueprint/BlueprintEditor', () => ({
  default: ({ study }: { study: { name: string } }) => <div data-testid="editor-aberto">{study.name}</div>,
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import BlueprintModule from '../../components/blueprint/BlueprintModule';
import { useStore } from '../../store/useStore';

const irPara = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('Planta Inteligente — link direto para o estudo', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ viewFocus: null });
    window.location.hash = '#/blueprint';
  });

  it('o link que chega na abertura do módulo abre o estudo e sai do endereço', async () => {
    window.location.hash = '#/blueprint?studyId=s2';
    render(<BlueprintModule podeVerMapaRegulatorio />);
    expect((await screen.findByTestId('editor-aberto')).textContent).toBe('Planta Torre B');
    expect(window.location.hash).toBe('#/blueprint');
  });

  it('⚠️ com a LISTA já na tela, o link abre o estudo (antes era ignorado: o módulo não remontava)', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    expect(await screen.findByText('Planta Torre A')).toBeTruthy();
    expect(screen.queryByTestId('editor-aberto')).toBeNull();
    await irPara('#/blueprint?studyId=s1');
    expect((await screen.findByTestId('editor-aberto')).textContent).toBe('Planta Torre A');
    expect(window.location.hash).toBe('#/blueprint');
  });

  it('estudo que não está na lista desta organização: diz o que fazer, não abre nada', async () => {
    render(<BlueprintModule podeVerMapaRegulatorio />);
    expect(await screen.findByText('Planta Torre A')).toBeTruthy();
    await irPara('#/blueprint?studyId=nao-existe');
    expect(await screen.findByText(/não está na lista desta organização/)).toBeTruthy();
    expect(screen.queryByTestId('editor-aberto')).toBeNull();
  });
});
