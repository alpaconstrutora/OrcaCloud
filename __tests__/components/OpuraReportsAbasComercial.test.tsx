// @vitest-environment jsdom
/**
 * ÒPURA · Relatórios — abas Vendas de Ativos / Locações / Gestão de Locações /
 * Contratos de Serviço / Plano de Contas (2026-09-13). A aba pede o pivot com a
 * dimensão certa e o clique na linha abre o extrato com o filtro certo.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock é içado: os mocks vivem em vi.hoisted para existirem antes da fábrica.
const { pivot, entries, showToast } = vi.hoisted(() => ({
    pivot: vi.fn(async (_org: string | null, dim: string) => dim === 'locacoes_locatario'
        ? [{ dimension_key: 'cli1', dimension_label: 'Defensoria Pública', qtd: 202, credit_realizado: 179370, debit_realizado: 0, credit_previsto: 0, debit_previsto: 0, net_realizado: 179370, vencido: 0 }]
        : [{ dimension_key: 'c1', dimension_label: 'CTL-010-0002 · Sala - 201', qtd: 202, credit_realizado: 179370, debit_realizado: 0, credit_previsto: 0, debit_previsto: 0, net_realizado: 179370, vencido: 0 }]),
    entries: vi.fn(async () => []),
    showToast: vi.fn(),
}));
vi.mock('../../services/opuraAnalyticsService', async () => {
    const real = await vi.importActual<typeof import('../../services/opuraAnalyticsService')>('../../services/opuraAnalyticsService');
    return { ...real, opuraAnalyticsService: { ...real.opuraAnalyticsService, pivot, entries, compare: vi.fn(async () => []) } };
});
vi.mock('../../services/costCenterService', () => ({ costCenterService: { list: vi.fn(async () => []) } }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ localToast: null, showToast }) }));

import OpuraReports from '../../components/OpuraReports';
import { ConfirmProvider } from '../../components/ui/confirm';

async function abrir(aba: string) {
    render(<ConfirmProvider><OpuraReports organizationId="org1" /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole('tab', { name: aba }));
    await waitFor(() => expect(pivot).toHaveBeenLastCalledWith('org1', expect.any(String), expect.anything()));
}

describe('ÒPURA · Relatórios › abas novas', () => {
    beforeEach(() => { localStorage.clear(); pivot.mockClear(); entries.mockClear(); });

    it.each([
        ['Vendas de Ativos', 'venda_ativos'],
        ['Locações', 'locacoes'],
        ['Gestão de Locações', 'locacoes_locatario'],
        ['Contratos de Serviço', 'contratos_servico'],
        ['Plano de Contas', 'plano_de_contas'],
    ])('aba "%s" pede o pivot na dimensão %s', async (aba, dim) => {
        await abrir(aba);
        expect(pivot.mock.calls.at(-1)?.[1]).toBe(dim);
    });

    it('Locações: clicar na linha abre o extrato filtrado pelo contrato', async () => {
        await abrir('Locações');
        fireEvent.click(await screen.findByText('CTL-010-0002 · Sala - 201'));
        await waitFor(() => expect(entries).toHaveBeenCalled());
        expect(entries.mock.calls[0][1]).toMatchObject({ contractId: 'c1' });
    });

    it('Gestão de Locações: clicar na linha filtra por locatário + domínio LOCACAO', async () => {
        await abrir('Gestão de Locações');
        fireEvent.click(await screen.findByText('Defensoria Pública'));
        await waitFor(() => expect(entries).toHaveBeenCalled());
        expect(entries.mock.calls[0][1]).toMatchObject({ contractClientId: 'cli1', contractDomain: 'LOCACAO' });
    });
});
