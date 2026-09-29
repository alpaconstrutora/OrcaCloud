// @vitest-environment jsdom
/**
 * Portal do Parceiro (visão do APP) — engrenagem de abas visíveis.
 * Pedido de 29/09/2026: "implementar botao de configuracão de abas visíveis da
 * mesma forma que foi implementado em Portais < portal do fornecedor (visão do app)".
 *
 * Cobre o que typecheck não vê:
 *  1. sub-abas ocultas para o parceiro ficam marcadas (título + ícone), as
 *     liberadas não;
 *  2. o modal mostra o estado de cada uma das seis abas do portal;
 *  3. clicar grava SÓ settings, com a lista na ordem canônica e o resto de
 *     settings preservado, e a marcação da sub-aba acompanha na hora.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateWorkspaceSettings = vi.fn();
const navigateToFocus = vi.fn();

const WORKSPACE = {
    id: 'ws1', supplier_id: 'sup1', supplier_name: 'Construtora Alfa',
    organization_id: 'org1', is_active: true,
    settings: { outraChave: 'preservar', partnerPortalTabs: ['dashboard', 'contratos'] },
};

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        listWorkspaces: vi.fn(async () => [WORKSPACE]),
        listPartnerUsers: vi.fn(async () => []),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listSharedDocuments: vi.fn(async () => []),
        listSharedFolders: vi.fn(async () => []),
        listRequests: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        updateWorkspaceSettings: (...args: unknown[]) => updateWorkspaceSettings(...args),
    },
}));

vi.mock('../../services/contractService', () => ({
    contractService: {
        getRetentionLedger: vi.fn(async () => ({ total_retained: 0, total_released: 0, balance: 0 })),
        approveMeasurement: vi.fn(),
        rejectMeasurement: vi.fn(),
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

async function abrirWorkspace(user: ReturnType<typeof userEvent.setup>) {
    render(<PartnerWorkspaceManager organizationId="org1" currentUserEmail="eu@construtora" />);
    await user.click(await screen.findByText('Construtora Alfa'));
    return screen.findByRole('button', { name: 'Configurar abas visíveis do parceiro' });
}

const subAba = (nome: RegExp) =>
    screen.getAllByRole('button', { name: nome }).find(b => b.className.includes('border-b-2'))!;

describe('PartnerWorkspaceManager — abas visíveis do portal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        updateWorkspaceSettings.mockImplementation(async (id: string, settings: Record<string, unknown>) => ({ ...WORKSPACE, id, settings }));
    });

    it('1. marca as sub-abas ocultas para o parceiro e deixa as liberadas limpas', async () => {
        const user = userEvent.setup();
        await abrirWorkspace(user);

        expect(subAba(/^Contratos/)).not.toHaveAttribute('title');
        for (const nome of [/^Conversas/, /^Documentos GED/, /^Financeiro/, /^Solicitações/]) {
            expect(subAba(nome)).toHaveAttribute('title', 'Oculta para o parceiro');
        }
    });

    it('2. o modal lista as seis abas com o estado salvo', async () => {
        const user = userEvent.setup();
        await user.click(await abrirWorkspace(user));

        const dialog = await screen.findByRole('dialog', { name: 'Portal do Parceiro' });
        const linha = (nome: string) => within(dialog).getByRole('button', { name: new RegExp(`^${nome}`) });
        expect(within(dialog).getAllByRole('button', { pressed: true }).length + within(dialog).getAllByRole('button', { pressed: false }).length).toBe(6);
        expect(linha('Dashboard')).toHaveAttribute('aria-pressed', 'true');
        expect(linha('Contratos')).toHaveAttribute('aria-pressed', 'true');
        expect(linha('Financeiro')).toHaveAttribute('aria-pressed', 'false');
        expect(linha('Solicitações')).toHaveAttribute('aria-pressed', 'false');
    });

    it('3. liga uma aba: grava só settings, em ordem canônica, sem perder outras chaves', async () => {
        const user = userEvent.setup();
        await user.click(await abrirWorkspace(user));
        const dialog = await screen.findByRole('dialog', { name: 'Portal do Parceiro' });

        await user.click(within(dialog).getByRole('button', { name: /^Financeiro/ }));

        await waitFor(() => expect(updateWorkspaceSettings).toHaveBeenCalledWith('ws1', {
            outraChave: 'preservar',
            partnerPortalTabs: ['dashboard', 'contratos', 'financeiro'],
        }));
        await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Financeiro/ })).toHaveAttribute('aria-pressed', 'true'));
        expect(subAba(/^Financeiro/)).not.toHaveAttribute('title');
    });

    it('4. desligar a última aba grava lista vazia (nenhuma aba), não "todas"', async () => {
        const user = userEvent.setup();
        await user.click(await abrirWorkspace(user));
        const dialog = await screen.findByRole('dialog', { name: 'Portal do Parceiro' });

        await user.click(within(dialog).getByRole('button', { name: /^Dashboard/ }));
        await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Dashboard/ })).toHaveAttribute('aria-pressed', 'false'));
        await user.click(within(dialog).getByRole('button', { name: /^Contratos/ }));

        await waitFor(() => expect(updateWorkspaceSettings).toHaveBeenLastCalledWith('ws1', {
            outraChave: 'preservar',
            partnerPortalTabs: [],
        }));
    });
});
