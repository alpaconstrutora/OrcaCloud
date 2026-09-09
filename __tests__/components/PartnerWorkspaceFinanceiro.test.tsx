// @vitest-environment jsdom
/**
 * Portal do Parceiro (visão do APP) — aba Financeiro na visão do credor.
 * Pedido de 09/09/2026, docs/planos/2026-09-09-portal-parceiro-financeiro-visao-credor.md
 *
 * Cobre o que typecheck e `check-ui-standard.sh` não veem:
 *
 *  1. a sexta sub-aba EXISTE e renderiza (era o defeito relatado: o parceiro via
 *     Financeiro pelo link e pelo portal, o interno não tinha a aba);
 *  2. o KPI de saldo retido vem do LEDGER por contrato, NÃO do `retention`
 *     agregado do payload do parceiro — os dois divergem quando há medição
 *     Cancelada, e é o ledger que o `releaseRetention` valida;
 *  3. aprovar medição chama `approveMeasurement` e RECARREGA o financeiro
 *     (a aprovação cria uma parcela no servidor que o cliente não constrói);
 *  4. "Ver em Contas a Pagar" leva o id de `internal_transactions` no deep-link.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const listFinancials = vi.fn();
const getRetentionLedger = vi.fn();
const approveMeasurement = vi.fn();
const navigateToFocus = vi.fn();

const CONTRATO = {
    id: 'ct1',
    organization_id: 'org1',
    number: 'CT-001',
    title: 'Fundações',
    current_value: 500000,
    retention_rate: 5,
    status: 'Assinado',
};

const PAYLOAD_FINANCEIRO = {
    contracts: [{ id: 'ct1', number: 'CT-001', title: 'Fundações', current_value: 500000, retention_rate: 5, status: 'Assinado' }],
    installments: [
        {
            id: 'tx-pendente', transaction_date: '2026-10-10', amount: 20000, direction: 'DEBIT',
            description: 'Parcela 1/2', status: 'PENDING', business_status: 'PREVISTO',
            installment_type: null, source_system: 'CONTRACT_PARCELADO',
        },
        {
            id: 'tx-pago', transaction_date: '2026-08-10', amount: 30000, direction: 'DEBIT',
            description: 'Parcela paga', status: 'COMPLETED', business_status: 'PAGO',
            installment_type: null, source_system: 'CONTRACT_PARCELADO',
        },
    ],
    measurements: [
        {
            id: 'med-analise', contract_id: 'ct1', number: 7, period_start: '2026-08-01', period_end: '2026-08-31',
            status: 'Em Análise', total_value: 10000, retention_value: 500, net_value: 9500, invoice_url: null,
        },
        {
            id: 'med-cancelada', contract_id: 'ct1', number: 6, period_start: '2026-07-01', period_end: '2026-07-31',
            status: 'Cancelada', total_value: 4000, retention_value: 200, net_value: 3800, invoice_url: null,
        },
    ],
    // O agregado do payload NÃO exclui a medição Cancelada: 500 + 200 = 700.
    retention: { retained: 700, released: 0, balance: 700 },
};

// O ledger exclui Cancelada: só os 500 da medição viva.
const LEDGER = { total_retained: 500, total_released: 0, balance: 500, retention_cap: undefined };

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        listWorkspaces: vi.fn(async () => [{
            id: 'ws1', supplier_id: 'sup1', supplier_name: 'Construtora Alfa',
            organization_id: 'org1', is_active: true,
        }]),
        listPartnerUsers: vi.fn(async () => []),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listSharedDocuments: vi.fn(async () => []),
        listSharedFolders: vi.fn(async () => []),
        listRequests: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
        listContracts: vi.fn(async () => [CONTRATO]),
        listFinancials: (...args: unknown[]) => listFinancials(...args),
    },
}));

vi.mock('../../services/contractService', () => ({
    contractService: {
        getRetentionLedger: (...args: unknown[]) => getRetentionLedger(...args),
        approveMeasurement: (...args: unknown[]) => approveMeasurement(...args),
        rejectMeasurement: vi.fn(async () => ({ id: 'med-analise', status: 'Pendente' })),
    },
}));

vi.mock('../../services/partnerPortalTokenService', () => ({
    partnerPortalTokenService: {
        getTokenForWorkspace: vi.fn(async () => null),
        generateToken: vi.fn(),
        revokeToken: vi.fn(),
        buildPortalUrl: vi.fn(() => ''),
    },
}));

vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => []) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));

vi.mock('../../services/organizationService', () => ({
    organizationService: { listOrganizations: vi.fn(async () => [{ id: 'org1', name: 'Alpa' }]) },
}));

vi.mock('../../services/appSettingsService', () => ({
    appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }) },
}));

// Cadeia mínima do PostgREST: qualquer `.select().eq().in()` resolve vazio.
vi.mock('../../lib/supabase', () => {
    const chain: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'order', 'limit'].forEach(m => { chain[m] = () => chain; });
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return {
        supabase: {
            from: () => chain,
            channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
            removeChannel: () => undefined,
        },
    };
});

vi.mock('../../store/useStore', () => ({
    useStore: (selector: (s: unknown) => unknown) => selector({ navigateToFocus }),
}));

vi.mock('../ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

vi.mock('../../components/documents/DocumentsTable', () => ({ DocumentsTable: () => null }));
vi.mock('../../components/ContractRetentionReleaseModal', () => ({ default: () => null }));
vi.mock('../../components/ContasPagarParcelas', () => ({
    default: () => null,
    origemLabel: (s: string) => (s === 'CONTRACT_PARCELADO' ? 'Contrato' : s),
    STATUS_PT: { PREVISTO: 'Previsto', PAGO: 'Pago' },
}));

import { PartnerWorkspaceManager } from '../../components/partner/PartnerWorkspaceManager';

async function abrirAbaFinanceiro(user: ReturnType<typeof userEvent.setup>) {
    render(<PartnerWorkspaceManager organizationId="org1" currentUserEmail="eu@construtora" />);
    await user.click(await screen.findByText('Construtora Alfa'));
    const aba = await screen.findByRole('button', { name: /Financeiro/ });
    await user.click(aba);
    return aba;
}

describe('PartnerWorkspaceManager — aba Financeiro (visão do credor)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listFinancials.mockResolvedValue(PAYLOAD_FINANCEIRO);
        getRetentionLedger.mockResolvedValue(LEDGER);
        approveMeasurement.mockResolvedValue({ id: 'med-analise', status: 'Processada' });
        window.localStorage.clear();
    });

    it('1. a sub-aba existe, carrega pela casca do app e lista as medições', async () => {
        const user = userEvent.setup();
        await abrirAbaFinanceiro(user);

        await waitFor(() => expect(listFinancials).toHaveBeenCalledWith('ws1'));
        expect(await screen.findByText('Medições do Fornecedor')).toBeInTheDocument();
        expect(screen.getByText('Títulos a Pagar deste Fornecedor')).toBeInTheDocument();
        expect(screen.getByText('Em Análise')).toBeInTheDocument();
        expect(screen.getByText('Cancelada')).toBeInTheDocument();
    });

    it('2. o saldo retido vem do LEDGER (500), não do agregado do payload (700)', async () => {
        const user = userEvent.setup();
        await abrirAbaFinanceiro(user);

        await waitFor(() => expect(getRetentionLedger).toHaveBeenCalledWith('ct1'));
        // O `uppercase` do KpiCard é CSS — no DOM o texto é sentence case.
        const card = (await screen.findByText('Saldo retido')).closest('div')!;
        expect(within(card).getByText(/500,00/)).toBeInTheDocument();
        expect(screen.queryByText(/700,00/)).not.toBeInTheDocument();
    });

    it('3. aprovar medição chama o service e recarrega o financeiro', async () => {
        const user = userEvent.setup();
        await abrirAbaFinanceiro(user);
        await screen.findByText('Medições do Fornecedor');

        expect(listFinancials).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: 'Aprovar' }));

        await waitFor(() => expect(approveMeasurement).toHaveBeenCalledWith('med-analise', 'eu@construtora'));
        // Recarga, não patch local: a aprovação cria uma parcela no servidor.
        await waitFor(() => expect(listFinancials).toHaveBeenCalledTimes(2));
    });

    it('4. "Ver em Contas a Pagar" faz deep-link com o id de internal_transactions', async () => {
        const user = userEvent.setup();
        await abrirAbaFinanceiro(user);
        await screen.findByText('Títulos a Pagar deste Fornecedor');

        const linha = screen.getByText('Parcela 1/2').closest('tr')!;
        await user.click(within(linha).getByRole('button', { name: 'Ver em Contas a Pagar' }));

        expect(navigateToFocus).toHaveBeenCalledWith('contas-a-pagar', 'tx-pendente', 'CONTA_PAGAR');
    });

    it('5. medição fora de "Em Análise" não oferece Aprovar/Devolver', async () => {
        const user = userEvent.setup();
        await abrirAbaFinanceiro(user);
        await screen.findByText('Medições do Fornecedor');

        const cancelada = screen.getByText('Cancelada').closest('tr')!;
        expect(within(cancelada).queryByRole('button', { name: 'Aprovar' })).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Aprovar' })).toHaveLength(1);
    });
});
