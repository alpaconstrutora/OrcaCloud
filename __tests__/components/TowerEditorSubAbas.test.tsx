// @vitest-environment jsdom
/**
 * Torres & Unidades em SUB-ABAS (25/11/2026): "tem varias sessoes deixando a tela longa com tabela em cima de tabela.
 * Se o torre tiver 200 unidades cada imagine o tamanho da tela" — docs/planos/2026-11-25-torres-unidades-sub-abas.md.
 * Terreno · Torres · Unidades (uma torre por vez) · Vista da janela · Tipologias (Plantas + Decorado).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listTowers: vi.fn(),
  listFloorsDasTorres: vi.fn(),
  listUnits: vi.fn(),
  updateUnit: vi.fn(),
  updateTower: vi.fn(),
  update: vi.fn(),
}));
const confirmar = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../services/blueprintTerrenoDaPlanta', () => ({ terrenoDaPlantaVinculada: vi.fn(async () => null) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));
// As seções que não são o assunto aqui viram marcadores (cada uma tem o seu teste).
vi.mock('../../components/empreendimento/FloorEditor', async orig => ({
  ...(await orig<object>()),
  default: ({ tower }: { tower: { name: string } }) => <div data-testid="floor-editor">Pavimentos de {tower.name}</div>,
}));
vi.mock('../../components/empreendimento/VistasDaTorreSecao', () => ({
  default: ({ towerName }: { towerName: string }) => <div data-testid="vistas">Vistas de {towerName}</div>,
}));
vi.mock('../../components/empreendimento/PlantasPorTipologiaSecao', () => ({ default: () => <div data-testid="plantas" /> }));
vi.mock('../../components/empreendimento/DecoradoPorTipologiaSecao', () => ({ default: () => <div data-testid="decorado" /> }));

import { TowerEditor } from '../../components/empreendimento/TowerEditor';
import { registrarPendencia } from '../../lib/guardaDeSaida';

const EMP = { id: 'emp-1', organization_id: 'org-1', name: '011 - Garden Cambuhy', commercial_building_id: null };
const torre = (id: string, name: string) => ({ id, empreendimento_id: 'emp-1', name, sort_order: 0, created_at: '', updated_at: '' });
const und = (id: string, tower_id: string, floor: number) => ({ id, tower_id, name: id, floor, sort_order: 0, status: 'DISPONIVEL', created_at: '', updated_at: '' });
const pav = (id: string, tower_id: string, n: number) => ({ id, tower_id, name: `Pavimento ${n}`, floor_number: n, repeat_count: 1, units_per_floor: 4, tipo: 'TIPO', sort_order: n });

const UNIDADES: Record<string, unknown[]> = {
  tA: [und('101', 'tA', 1), und('102', 'tA', 1), und('201', 'tA', 2)],
  tB: [und('B01', 'tB', 1)],
};

const montar = (empreendimento: unknown = EMP) =>
  render(<TowerEditor empreendimentoId="emp-1" organizationId="org-1" empreendimento={empreendimento as never} />);
/** Como os estudos montam: sem o empreendimento. */
const montarSemEmpreendimento = () => render(<TowerEditor empreendimentoId="emp-1" organizationId="org-1" />);
const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome });

describe('Torres & Unidades › sub-abas', () => {
  beforeEach(() => {
    localStorage.clear();
    confirmar.mockClear();
    svc.listTowers.mockResolvedValue([torre('tA', 'Torre A'), torre('tB', 'Torre B')]);
    svc.listFloorsDasTorres.mockResolvedValue([pav('p1', 'tA', 1), pav('p2', 'tA', 2)]);
    svc.listUnits.mockImplementation(async (id: string) => UNIDADES[id] ?? []);
  });
  afterEach(() => registrarPendencia('teste', false));

  it('card da torre sem "Nº de pavimentos": conta o cadastro de pavimentos, ou os andares das unidades', async () => {
    montar();
    await waitFor(() => expect(aba(/Unidades/)).toHaveTextContent('4'));
    fireEvent.click(aba(/Torres/));
    await screen.findByTestId('secao-torres');
    const [a, b] = screen.getAllByTestId('pavimentos-da-torre');
    expect(a).toHaveTextContent('2 pav.');
    expect(a).toHaveAttribute('title', expect.stringMatching(/cadastro de pavimentos/));
    expect(b).toHaveTextContent('1 pav.');
    expect(b).toHaveAttribute('title', expect.stringMatching(/andares das unidades/));
    expect(screen.queryByText(/sem pavimentos/)).not.toBeInTheDocument();
  });

  it('abre em Terreno; cada aba mostra só a sua seção', async () => {
    montar();
    expect(await screen.findByTestId('secao-terreno')).toBeInTheDocument();
    await waitFor(() => expect(aba(/Unidades/)).toBeInTheDocument());
    expect(screen.queryByTestId('secao-torres')).not.toBeInTheDocument();

    fireEvent.click(aba(/Torres/));
    expect(await screen.findByTestId('secao-torres')).toBeInTheDocument();
    expect(screen.queryByTestId('secao-terreno')).not.toBeInTheDocument();
    expect(screen.queryByTestId('secao-unidades')).not.toBeInTheDocument();

    fireEvent.click(aba(/Tipologias/));
    expect(await screen.findByTestId('plantas')).toBeInTheDocument();
    expect(screen.getByTestId('decorado')).toBeInTheDocument();
    expect(screen.queryByTestId('secao-torres')).not.toBeInTheDocument();
  });

  it('Unidades: uma torre por vez, com o seletor; os pavimentos já vieram sem abrir a aba Torres', async () => {
    montar();
    await waitFor(() => expect(aba(/Unidades/)).toHaveTextContent('4'));
    fireEvent.click(aba(/Unidades/));
    const secao = await screen.findByTestId('secao-unidades');
    // Os 2 pavimentos da Torre A (4 un. cada) — antes só existiam depois de abrir o card da torre.
    expect(await within(secao).findByRole('button', { name: /Gerar a partir dos pavimentos \(8\)/ })).not.toBeDisabled();
    expect(await within(secao).findByText('201')).toBeInTheDocument();
    const seletor = within(screen.getByTestId('seletor-de-torre'));
    expect(seletor.getByRole('button', { name: 'Torre A · 3' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(seletor.getByRole('button', { name: 'Torre B · 1' }));
    expect(await within(secao).findByText('B01')).toBeInTheDocument();
    expect(within(secao).queryByText('201')).not.toBeInTheDocument();
  });

  it('Total geral (todas as torres) mora na aba Unidades, acima da tabela — não em Torres (27/11/2026)', async () => {
    montar();
    await waitFor(() => expect(aba(/Unidades/)).toHaveTextContent('4'));
    fireEvent.click(aba(/Torres/));
    await screen.findByTestId('secao-torres');
    expect(screen.queryByTestId('total-geral')).not.toBeInTheDocument();
    fireEvent.click(aba(/Unidades/));
    const total = await screen.findByTestId('total-geral');
    expect(total).toHaveTextContent('Total geral (2 torres)');
    expect(total).toHaveTextContent('Unidades4');
    // Acima da tabela de unidades (guia §6.14): vem antes no documento.
    const tabela = screen.getByTestId('secao-unidades').querySelector('table')!;
    expect(total.compareDocumentPosition(tabela) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Vista da janela segue a torre escolhida', async () => {
    montar();
    await waitFor(() => expect(aba(/Vista da janela/)).toBeInTheDocument());
    fireEvent.click(aba(/Vista da janela/));
    expect(await screen.findByTestId('vistas')).toHaveTextContent('Vistas de Torre A');
    fireEvent.click(within(screen.getByTestId('seletor-de-torre')).getByRole('button', { name: /Torre B/ }));
    await waitFor(() => expect(screen.getByTestId('vistas')).toHaveTextContent('Vistas de Torre B'));
  });

  it('a aba escolhida fica guardada: remontar volta nela', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(aba(/Unidades/)).toBeInTheDocument());
    fireEvent.click(aba(/Torres/));
    await screen.findByTestId('secao-torres');
    unmount();
    montar();
    expect(await screen.findByTestId('secao-torres')).toBeInTheDocument();
  });

  it('sem o empreendimento (estudos): só Torres e Unidades', async () => {
    montarSemEmpreendimento();
    await waitFor(() => expect(aba(/Unidades/)).toBeInTheDocument());
    expect(screen.getAllByRole('tab').map(t => t.textContent?.replace(/\d+$/, ''))).toEqual(['Torres', 'Unidades']);
    expect(await screen.findByTestId('secao-torres')).toBeInTheDocument();
  });

  it('com edição pendente, trocar de aba pergunta antes — e fica onde está se não confirmar', async () => {
    montar();
    await screen.findByTestId('secao-terreno');
    registrarPendencia('teste', true);
    fireEvent.click(aba(/Torres/));
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('secao-terreno')).toBeInTheDocument();
    expect(screen.queryByTestId('secao-torres')).not.toBeInTheDocument();
  });
});
