// @vitest-environment jsdom
/**
 * ÒPURA · Relatórios — clicar numa linha abre o extrato como TELA in-flow
 * (troca o conteúdo, seta voltar), não mais como drawer. Pedido de 04/10/2026.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const entry = (i: number, over: Record<string, unknown> = {}) => ({
    id: `e${i}`, transaction_date: '2026-03-05', due_date: '2026-03-10', payment_date: null,
    direction: 'DEBIT', status: 'CONCILIATED', amount: 100,
    category_name: 'Material', dre_group: null, supplier_name: 'Fornecedor X', client_name: null,
    project_name: 'Obra Y', account_name: 'Itaú', description: `Lançamento ${i}`, total_count: 3,
    ...over,
});

const entries = vi.fn(async (_org: string | null, _f: unknown, _limit: number, offset: number) =>
    offset === 0 ? [entry(1), entry(2, { direction: 'CREDIT', amount: 50, status: 'PENDING' })] : [entry(3)]);

vi.mock('../../services/opuraAnalyticsService', async () => {
    const real = await vi.importActual<typeof import('../../services/opuraAnalyticsService')>('../../services/opuraAnalyticsService');
    return {
        ...real,
        opuraAnalyticsService: {
            ...real.opuraAnalyticsService,
            pivot: vi.fn(async () => [
                { dimension_key: 'adm', dimension_label: 'Administrativo', qtd: 3, credit_realizado: 0, debit_realizado: 200, credit_previsto: 50, debit_previsto: 0, net_realizado: -200, vencido: 0 },
            ]),
            entries: (...a: Parameters<typeof entries>) => entries(...a),
            compare: vi.fn(async () => []),
        },
    };
});
vi.mock('../../services/costCenterService', () => ({
    costCenterService: {
        list: vi.fn(async () => [
            { id: 'adm', organization_id: 'org1', parent_id: null, code: '002', name: 'Administrativo' },
        ]),
    },
}));
const showToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ localToast: null, showToast }),
}));

import OpuraReports from '../../components/OpuraReports';
import { ConfirmProvider } from '../../components/ui/confirm';

async function abrirExtrato() {
    render(<ConfirmProvider><OpuraReports organizationId="org1" /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole('tab', { name: 'Centro de Custo' }));
    await waitFor(() => expect(screen.getByText('Administrativo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Administrativo').closest('tr') as HTMLTableRowElement);
    await waitFor(() => expect(screen.getByText('Lançamento 1')).toBeInTheDocument());
}

describe('ÒPURA · Relatórios › extrato da linha em tela', () => {
    beforeEach(() => { localStorage.clear(); entries.mockClear(); });

    it('troca a lista pela tela do extrato — sem dialog, sem abas do relatório', async () => {
        await abrirExtrato();
        const h1 = screen.getByRole('heading', { level: 1, name: 'Administrativo' });
        expect(h1.closest('[role="dialog"]')).toBeNull();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // a lista do relatório saiu da tela
        expect(screen.queryByRole('tab', { name: 'Centro de Custo' })).not.toBeInTheDocument();
        expect(screen.getByText(/Centro de Custo · Lançamento de 01\/01\/\d{4} a 31\/12\/\d{4} · 3 lançamentos/)).toBeInTheDocument();
        // colunas que no drawer não cabiam
        for (const col of ['Vencimento', 'Categoria', 'Contraparte', 'Obra', 'Status', 'Valor']) {
            expect(screen.getByRole('columnheader', { name: new RegExp(col) })).toBeInTheDocument();
        }
        const linha2 = within(screen.getByText('Lançamento 2').closest('tr') as HTMLTableRowElement);
        expect(linha2.getByText('Previsto')).toBeInTheDocument();
        expect(linha2.getByText('+R$ 50,00')).toBeInTheDocument();
    });

    it('"Carregar mais" pede a próxima página do mesmo recorte', async () => {
        await abrirExtrato();
        expect(screen.getByText('Exibindo 2 de 3')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Carregar mais 1/ }));
        await waitFor(() => expect(screen.getByText('Lançamento 3')).toBeInTheDocument());
        expect(entries).toHaveBeenLastCalledWith('org1', expect.objectContaining({ costCenterId: 'adm' }), 200, 2);
        expect(screen.queryByRole('button', { name: /Carregar mais/ })).not.toBeInTheDocument();
    });

    it('a seta voltar devolve o relatório', async () => {
        await abrirExtrato();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar ao relatório' }));
        expect(await screen.findByRole('tab', { name: 'Centro de Custo' })).toBeInTheDocument();
        expect(screen.queryByText('Lançamento 1')).not.toBeInTheDocument();
    });
});
