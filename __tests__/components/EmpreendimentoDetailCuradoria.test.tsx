// @vitest-environment jsdom
/**
 * CURADORIA DENTRO DA SINCRONIZAÇÃO (28/10/2026): *"avalie novamente a aba curadoria. me parece que não tem função ou
 * que pode ser absorvida por outra aba"* → decisão: absorver na Sincronização. A aba some do menu; o contador de
 * pendentes vai para "Sincronização"; o bloco Curadoria aparece no fim dela só quando o empreendimento já teve alguma
 * proposta (em produção, a tabela nunca teve uma).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contas = vi.hoisted(() => ({ pendentes: 0, total: 0 }));
vi.mock('../../services/empreendimentoProposalService', () => ({
  empreendimentoProposalService: {
    countPending: vi.fn(async () => contas.pendentes),
    countAll: vi.fn(async () => contas.total),
  },
}));
// As abas filhas são outras telas, com testes próprios: aqui só importa ONDE a Curadoria aparece.
vi.mock('../../components/empreendimento/SyncCenterTab', () => ({ SyncCenterTab: () => <div data-testid="sync-center" /> }));
vi.mock('../../components/empreendimento/CuradoriaTab', () => ({ default: () => <div data-testid="curadoria-lista" /> }));
vi.mock('../../components/empreendimento/TowerEditor', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/EspelhoVendasTab', () => ({ EspelhoVendasTab: () => null }));
vi.mock('../../components/empreendimento/EspelhoLocacoesTab', () => ({ EspelhoLocacoesTab: () => null }));
vi.mock('../../components/empreendimento/CaracteristicasAdicionaisTab', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/VinculacoesTab', () => ({ default: () => null }));
vi.mock('../../components/empreendimento/HistoricoTab', () => ({ default: () => null }));
vi.mock('../../components/MapaRegulatorioEditor', () => ({ default: () => null }));
vi.mock('../../services/empreendimentoTypeService', () => ({ empreendimentoTypeService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: vi.fn(async () => []) } }));
vi.mock('../../services/companyService', () => ({ companyService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/imovibService', () => ({ imovibService: new Proxy({}, { get: () => vi.fn(async () => null) }) }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: new Proxy({}, { get: () => vi.fn(async () => []) }) }));
vi.mock('../../services/empreendimentoUnitCharacteristicService', () => ({
  empreendimentoUnitCharacteristicService: new Proxy({}, { get: () => vi.fn(async () => []) }),
}));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { EmpreendimentoDetail } from '../../components/empreendimento/EmpreendimentoDetail';

const GARDEN = { id: 'e1', organization_id: 'o1', name: '011 - Garden Cambuhy', status: 'PLANEJAMENTO', tipo: 'VERTICAL' };
const montar = () => render(<EmpreendimentoDetail empreendimento={GARDEN as never} organizationId="o1" onBack={vi.fn()} onEdit={vi.fn()} />);
const abaSincronizacao = () => screen.getByRole('button', { name: /Sincronização/ });

describe('Empreendimento › Curadoria dentro da Sincronização', () => {
  beforeEach(() => {
    contas.pendentes = 0;
    contas.total = 0;
  });

  it('não há mais aba Curadoria no menu', async () => {
    montar();
    await waitFor(() => expect(abaSincronizacao()).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Curadoria/ })).not.toBeInTheDocument();
  });

  it('sem proposta nenhuma: a Sincronização não mostra o bloco Curadoria', async () => {
    montar();
    await userEvent.click(abaSincronizacao());
    expect(await screen.findByTestId('sync-center')).toBeInTheDocument();
    expect(screen.queryByTestId('secao-curadoria')).not.toBeInTheDocument();
  });

  it('com conflito pendente: o contador fica na aba Sincronização e o bloco Curadoria aparece no fim dela', async () => {
    contas.pendentes = 3;
    contas.total = 5;
    montar();
    await waitFor(() => expect(abaSincronizacao()).toHaveTextContent('3'));
    await userEvent.click(abaSincronizacao());
    const bloco = await screen.findByTestId('secao-curadoria');
    expect(bloco).toHaveTextContent('3 conflito(s) a decidir');
    expect(within(bloco).getByTestId('curadoria-lista')).toBeInTheDocument();
  });

  it('só decididas (nenhuma pendente): o bloco continua, para consultar o histórico', async () => {
    contas.total = 2;
    montar();
    await userEvent.click(abaSincronizacao());
    expect(await screen.findByTestId('secao-curadoria')).toHaveTextContent('nenhum conflito pendente');
  });
});
