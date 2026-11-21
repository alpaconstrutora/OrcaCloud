// @vitest-environment jsdom
/**
 * Pedido de 21/11/2026 (docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md):
 *  - 3.1 "Mover aba sincronização para logo após a aba vinculações";
 *  - 8   o Objetivo decide os espelhos: Vendas esconde Locações, Locação esconde Vendas, Misto mostra os dois;
 *  - 1   a Visão Geral é a ficha editável — o botão "Editar" do topo saiu.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/empreendimentoProposalService', () => ({
  empreendimentoProposalService: { countPending: vi.fn(async () => 0), countAll: vi.fn(async () => 0) },
}));
vi.mock('../../components/empreendimento/SyncCenterTab', () => ({ SyncCenterTab: () => null }));
vi.mock('../../components/empreendimento/CuradoriaTab', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/TowerEditor', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/EspelhoVendasTab', () => ({ EspelhoVendasTab: () => null }));
vi.mock('../../components/empreendimento/EspelhoLocacoesTab', () => ({ EspelhoLocacoesTab: () => null }));
vi.mock('../../components/empreendimento/CaracteristicasAdicionaisTab', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/VinculacoesTab', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/HistoricoTab', () => ({ default: () => null }));
vi.mock('../../components/MapaRegulatorioEditor', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/EmpreendimentoForm', () => ({ default: () => <div data-testid="ficha-editavel" /> }));
vi.mock('../../components/empreendimento/TerrenoSecao', () => ({ default: () => null }));
vi.mock('../../services/empreendimentoTypeService', () => ({ empreendimentoTypeService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/empreendimentoUnitCharacteristicService', () => ({
  empreendimentoUnitCharacteristicService: new Proxy({}, { get: () => vi.fn(async () => []) }),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { EmpreendimentoDetail } from '../../components/empreendimento/EmpreendimentoDetail';

const montar = (objetivo?: string | null) => render(
  <EmpreendimentoDetail
    empreendimento={{ id: 'e1', organization_id: 'o1', name: 'Garden', status: 'PLANEJAMENTO', tipo: 'VERTICAL', objetivo } as never}
    organizationId="o1"
    onBack={vi.fn()}
    onSaved={vi.fn()}
  />,
);
const nomesDasAbas = () => screen.getAllByRole('tab').map(t => t.textContent?.replace(/\d+$/, '').trim());

describe('Empreendimento › abas', () => {
  it('Sincronização vem logo depois de Vinculações, antes de Histórico', async () => {
    montar('MISTO');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Sincronização/ })).toBeInTheDocument());
    const abas = nomesDasAbas();
    expect(abas.slice(-3)).toEqual(['Vinculações', 'Sincronização', 'Histórico']);
    expect(abas).toContain('Mapa Regulatório');
  });

  it('Misto (ou sem objetivo) mostra os dois espelhos', () => {
    montar(null);
    expect(screen.getByRole('tab', { name: /Espelho de Vendas/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Espelho de Locações/ })).toBeInTheDocument();
  });

  it('Vendas esconde o Espelho de Locações', () => {
    montar('VENDAS');
    expect(screen.getByRole('tab', { name: /Espelho de Vendas/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Espelho de Locações/ })).not.toBeInTheDocument();
  });

  it('Locação esconde o Espelho de Vendas', () => {
    montar('LOCACAO');
    expect(screen.queryByRole('tab', { name: /Espelho de Vendas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Espelho de Locações/ })).toBeInTheDocument();
  });

  it('Serviço não mostra nenhum espelho (docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md)', () => {
    montar('SERVICO');
    expect(screen.queryByRole('tab', { name: /Espelho de Vendas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Espelho de Locações/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Documentos/ })).toBeInTheDocument();
  });

  it('a Visão Geral é a ficha editável e o topo não tem mais o botão Editar', () => {
    montar('MISTO');
    expect(screen.getByTestId('ficha-editavel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar$/ })).not.toBeInTheDocument();
  });
});
