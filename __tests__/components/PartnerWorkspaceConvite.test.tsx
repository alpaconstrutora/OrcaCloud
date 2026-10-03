// @vitest-environment jsdom
/**
 * Portal do Parceiro (visão do APP) — "Convidar Integrante" manda o convite por e-mail.
 * Pedido de 03/10/2026: "portal do parceiro : alem do acesso via token implementar
 * acesso via e-mail". Plano: docs/planos/2026-10-03-portal-parceiro-acesso-por-email.md
 *
 * Trava:
 *  1. convidar grava o integrante e EM SEGUIDA pede o envio do convite para ele;
 *  2. falha no envio não desfaz o cadastro e diz o motivo;
 *  3. a coluna "Convite" mostra "Não enviado" / "Enviado em dd/mm/aaaa";
 *  4. "Reenviar convite" na linha chama o envio; integrante inativo não envia e o
 *     motivo aparece no título.
 *  5. (03/10/2026, "o usuário não tem botão editar") Editar abre o mesmo painel
 *     com os dados; o e-mail (login) não muda; salvar grava nome, telefone e
 *     perfil — e NÃO manda convite.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const savePartnerUser = vi.fn();
const invitePartnerUser = vi.fn();
const listPartnerUsers = vi.fn();
const navigateToFocus = vi.fn();

const WORKSPACE = {
    id: 'ws1', supplier_id: 'sup1', supplier_name: 'Construtora Alfa',
    organization_id: 'org1', is_active: true, settings: {},
};
const ATIVO_CONVIDADO = {
    id: 'u1', partner_workspace_id: 'ws1', email: 'ana@parceiro.com', name: 'Ana', role: 'GESTOR',
    is_active: true, invited_at: '2026-10-01T15:00:00Z', created_at: '', updated_at: '',
};
const ATIVO_SEM_CONVITE = { ...ATIVO_CONVIDADO, id: 'u2', email: 'bia@parceiro.com', name: 'Bia', invited_at: null };
const INATIVO = { ...ATIVO_CONVIDADO, id: 'u3', email: 'caio@parceiro.com', name: 'Caio', is_active: false, invited_at: null };

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        listWorkspaces: vi.fn(async () => [WORKSPACE]),
        listPartnerUsers: (...a: unknown[]) => listPartnerUsers(...a),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listSharedDocuments: vi.fn(async () => []),
        listSharedFolders: vi.fn(async () => []),
        listRequests: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        savePartnerUser: (...a: unknown[]) => savePartnerUser(...a),
        invitePartnerUser: (...a: unknown[]) => invitePartnerUser(...a),
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

vi.mock('../../components/documents/DocumentsTable', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../components/documents/DocumentsTable')>()),
    DocumentsTable: () => null,
}));
vi.mock('../../components/ContractRetentionReleaseModal', () => ({ default: () => null }));
vi.mock('../../components/ContasPagarParcelas', () => ({
    default: () => null,
    origemLabel: (s: string) => (s === 'CONTRACT_PARCELADO' ? 'Contrato' : s),
    STATUS_PT: { PREVISTO: 'Previsto', PAGO: 'Pago' },
}));

import { PartnerWorkspaceManager } from '../../components/partner/PartnerWorkspaceManager';
import { ToastProvider } from '../../components/ui/toast';

async function abrirUsuarios() {
    const user = userEvent.setup();
    render(<ToastProvider><PartnerWorkspaceManager organizationId="org1" currentUserEmail="eu@construtora" /></ToastProvider>);
    await user.click(await screen.findByText('Construtora Alfa'));
    await screen.findByText('Equipe Externa do Parceiro');
    await screen.findByText('ana@parceiro.com');
    return user;
}

const linhaDe = (email: string) => screen.getByText(email).closest('tr')!;

async function convidar(user: ReturnType<typeof userEvent.setup>, nome: string, email: string) {
    // O painel fechado continua no DOM (fora da tela): o primeiro botão é o da barra.
    await user.click(screen.getAllByRole('button', { name: /Convidar Integrante/ })[0]);
    await user.type(screen.getByPlaceholderText('Nome do integrante...'), nome);
    await user.type(screen.getByPlaceholderText('email@parceiro.com'), email);
    const form = screen.getByPlaceholderText('email@parceiro.com').closest('form')!;
    await user.click(within(form).getByRole('button', { name: 'Convidar Integrante' }));
}

describe('PartnerWorkspaceManager — convite por e-mail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        listPartnerUsers.mockResolvedValue([ATIVO_CONVIDADO, ATIVO_SEM_CONVITE, INATIVO]);
        savePartnerUser.mockImplementation(async (u: Record<string, unknown>) => ({
            ...u, id: 'novo', invited_at: null, created_at: '', updated_at: '',
        }));
        invitePartnerUser.mockResolvedValue({ kind: 'invite' });
    });

    it('1. convidar grava o integrante e em seguida envia o convite para ele', async () => {
        const user = await abrirUsuarios();
        await convidar(user, 'Davi', 'davi@parceiro.com');

        await waitFor(() => expect(savePartnerUser).toHaveBeenCalledWith(expect.objectContaining({
            partner_workspace_id: 'ws1', email: 'davi@parceiro.com', name: 'Davi', is_active: true,
        })));
        await waitFor(() => expect(invitePartnerUser).toHaveBeenCalledWith('novo'));
        expect(savePartnerUser.mock.invocationCallOrder[0]).toBeLessThan(invitePartnerUser.mock.invocationCallOrder[0]);
        expect(await screen.findByText('Convite enviado para davi@parceiro.com.')).toBeInTheDocument();
        await waitFor(() => expect(within(linhaDe('davi@parceiro.com')).getByText(/^Enviado em/)).toBeInTheDocument());
    });

    it('2. falha no envio mantém o integrante e diz o motivo', async () => {
        invitePartnerUser.mockRejectedValueOnce(new Error('O provedor de e-mail recusou o envio.'));
        const user = await abrirUsuarios();
        await convidar(user, 'Davi', 'davi@parceiro.com');

        expect(await screen.findByText(/Integrante salvo, mas o convite não foi enviado: O provedor de e-mail recusou o envio\./)).toBeInTheDocument();
        expect(within(linhaDe('davi@parceiro.com')).getByText('Não enviado')).toBeInTheDocument();
    });

    it('3. coluna Convite: data do último envio ou "Não enviado"', async () => {
        await abrirUsuarios();
        expect(within(linhaDe('ana@parceiro.com')).getByText(/^Enviado em \d{2}\/10\/2026$/)).toBeInTheDocument();
        expect(within(linhaDe('bia@parceiro.com')).getByText('Não enviado')).toBeInTheDocument();
    });

    it('4. reenviar pela linha; inativo não envia e diz por quê', async () => {
        const user = await abrirUsuarios();

        await user.click(within(linhaDe('ana@parceiro.com')).getByRole('button', { name: 'Reenviar convite por e-mail' }));
        await waitFor(() => expect(invitePartnerUser).toHaveBeenCalledWith('u1'));

        const botaoInativo = within(linhaDe('caio@parceiro.com')).getByRole('button', { name: 'Enviar convite por e-mail' });
        expect(botaoInativo).toBeDisabled();
        expect(botaoInativo.closest('span')).toHaveAttribute('title', 'Integrante inativo — ative para enviar o convite');
    });

    it('5. editar: painel com os dados, e-mail travado, grava nome/telefone/perfil sem reenviar convite', async () => {
        savePartnerUser.mockImplementation(async (u: Record<string, unknown>) => ({ ...ATIVO_CONVIDADO, ...u }));
        const user = await abrirUsuarios();

        await user.click(within(linhaDe('ana@parceiro.com')).getByRole('button', { name: 'Editar integrante' }));

        const nome = screen.getByPlaceholderText('Nome do integrante...') as HTMLInputElement;
        const email = screen.getByPlaceholderText('email@parceiro.com') as HTMLInputElement;
        expect(nome.value).toBe('Ana');
        expect(email.value).toBe('ana@parceiro.com');
        expect(email).toBeDisabled();

        await user.clear(nome);
        await user.type(nome, 'Ana Souza');
        await user.selectOptions(screen.getByDisplayValue('Gestor (Visualização)'), 'FINANCEIRO');
        const form = email.closest('form')!;
        await user.click(within(form).getByRole('button', { name: 'Salvar' }));

        await waitFor(() => expect(savePartnerUser).toHaveBeenCalledWith({
            id: 'u1', name: 'Ana Souza', phone: '', role: 'FINANCEIRO',
        }));
        expect(invitePartnerUser).not.toHaveBeenCalled();
        expect(await screen.findByText('Integrante atualizado.')).toBeInTheDocument();
        await waitFor(() => expect(within(linhaDe('ana@parceiro.com')).getByText('FINANCEIRO')).toBeInTheDocument());
        expect(within(linhaDe('ana@parceiro.com')).getByText('Ana Souza')).toBeInTheDocument();
    });
});
