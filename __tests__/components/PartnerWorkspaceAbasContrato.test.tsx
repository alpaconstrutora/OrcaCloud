// @vitest-environment jsdom
/**
 * Portal do Parceiro (visão do APP) — engrenagem PRÓPRIA das abas do detalhe do
 * contrato, além da configuração geral.
 * Pedido de 03/10/2026: "implementar a funcionalidade de configurar abas visíveis
 * (alem da geral existente), uam exclusiva para a aba Constratos".
 * Decisões do usuário: vale por parceiro (todos os contratos); botão na aba Contratos.
 *
 * Cobre:
 *  1. a engrenagem está na sub-aba Contratos e o modal lista as 7 sub-abas com o
 *     estado salvo;
 *  2. clicar grava `partnerContractTabs` sem tocar em `partnerPortalTabs` nem nas
 *     outras chaves de settings;
 *  3. com a aba Contratos oculta no portal, o modal avisa;
 *  4. a engrenagem geral continua gravando só a sua lista.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const updateWorkspaceSettings = vi.fn();
const listWorkspaces = vi.fn();
const navigateToFocus = vi.fn();

const WORKSPACE = {
    id: 'ws1', supplier_id: 'sup1', supplier_name: 'Construtora Alfa',
    organization_id: 'org1', is_active: true,
    settings: {
        outraChave: 'preservar',
        partnerPortalTabs: ['dashboard', 'contratos'],
        partnerContractTabs: ['overview', 'items'],
    },
};

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        listWorkspaces: (...a: unknown[]) => listWorkspaces(...a),
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

const subAba = (nome: RegExp) =>
    screen.getAllByRole('button', { name: nome }).find(b => b.className.includes('border-b-2'))!;

async function abrirConfigDoContrato(user: ReturnType<typeof userEvent.setup>) {
    render(<PartnerWorkspaceManager organizationId="org1" currentUserEmail="eu@construtora" />);
    await user.click(await screen.findByText('Construtora Alfa'));
    await screen.findByRole('button', { name: 'Configurar abas visíveis do parceiro' });
    await user.click(subAba(/^Contratos/));
    await user.click(await screen.findByRole('button', { name: 'Configurar abas do contrato visíveis ao parceiro' }));
    return screen.findByRole('dialog', { name: 'Detalhe do contrato' });
}

describe('PartnerWorkspaceManager — abas do detalhe do contrato', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        listWorkspaces.mockResolvedValue([WORKSPACE]);
        updateWorkspaceSettings.mockImplementation(async (id: string, settings: Record<string, unknown>) => ({ ...WORKSPACE, id, settings }));
    });

    // 8 desde 04/10/2026: + "Documentos" (versões emitidas na aba Emissão).
    it('1. engrenagem na sub-aba Contratos; o modal lista as 8 com o estado salvo', async () => {
        const user = userEvent.setup();
        const dialog = await abrirConfigDoContrato(user);

        const linha = (nome: RegExp) => within(dialog).getByRole('button', { name: nome });
        expect(within(dialog).getAllByRole('button', { pressed: true })).toHaveLength(2);
        expect(within(dialog).getAllByRole('button', { pressed: false })).toHaveLength(6);
        expect(linha(/^Documentos/)).toHaveAttribute('aria-pressed', 'false');
        expect(linha(/^Visão Geral/)).toHaveAttribute('aria-pressed', 'true');
        expect(linha(/^Itens/)).toHaveAttribute('aria-pressed', 'true');
        expect(linha(/^Medições/)).toHaveAttribute('aria-pressed', 'false');
        expect(linha(/^Penalidades/)).toHaveAttribute('aria-pressed', 'false');
        expect(within(dialog).queryByText(/aba Contratos está oculta/)).toBeNull();
    });

    it('2. ligar Medições grava só partnerContractTabs, em ordem canônica', async () => {
        const user = userEvent.setup();
        const dialog = await abrirConfigDoContrato(user);

        await user.click(within(dialog).getByRole('button', { name: /^Medições/ }));

        await waitFor(() => expect(updateWorkspaceSettings).toHaveBeenCalledWith('ws1', {
            outraChave: 'preservar',
            partnerPortalTabs: ['dashboard', 'contratos'],
            partnerContractTabs: ['overview', 'items', 'measurements'],
        }));
        await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Medições/ })).toHaveAttribute('aria-pressed', 'true'));
    });

    it('3. com a aba Contratos oculta no portal, o modal avisa', async () => {
        listWorkspaces.mockResolvedValue([{ ...WORKSPACE, settings: { ...WORKSPACE.settings, partnerPortalTabs: ['dashboard'] } }]);
        const user = userEvent.setup();
        const dialog = await abrirConfigDoContrato(user);

        expect(within(dialog).getByText(/aba Contratos está oculta no portal/)).toBeInTheDocument();
    });

    it('4. a engrenagem geral continua gravando só a sua lista', async () => {
        const user = userEvent.setup();
        render(<PartnerWorkspaceManager organizationId="org1" currentUserEmail="eu@construtora" />);
        await user.click(await screen.findByText('Construtora Alfa'));
        await user.click(await screen.findByRole('button', { name: 'Configurar abas visíveis do parceiro' }));
        const dialog = await screen.findByRole('dialog', { name: 'Portal do Parceiro' });

        await user.click(within(dialog).getByRole('button', { name: /^Financeiro/ }));

        await waitFor(() => expect(updateWorkspaceSettings).toHaveBeenCalledWith('ws1', {
            outraChave: 'preservar',
            partnerPortalTabs: ['dashboard', 'contratos', 'financeiro'],
            partnerContractTabs: ['overview', 'items'],
        }));
    });
});
