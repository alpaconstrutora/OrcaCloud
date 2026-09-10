// @vitest-environment jsdom
/**
 * Portal do Parceiro › "Meus dados". Pedido de 09/09/2026,
 * docs/planos/2026-09-09-portal-parceiro-meus-dados.md
 *
 * O que estes casos travam é justamente o que costuma divergir depois: que os
 * DOIS modos do portal (link público e app) abrem o MESMO painel com o MESMO
 * conteúdo, cada um pela sua casca. Um painel por modo seria a gêmea que os
 * consertos de hoje passaram o dia desfazendo.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getSupplierProfileToken = vi.fn();
const getSupplierProfileApp = vi.fn();

const WORKSPACE = { id: 'ws1', supplier_id: 'sup1', supplier_name: 'AFONSO H VILELA ENGENHARIA LTDA', is_active: true };

const PERFIL = {
    supplier: {
        id: 'sup1', name: 'AFONSO H VILELA ENGENHARIA LTDA', nickname: 'Afonso Vilela',
        type: 'PJ', document: '12345678000199', code: '007', category: 'Engenharia',
        email: 'contato@afonso.com.br', phone: '(35) 99999-0000', contact_name: 'Afonso Vilela',
        street: 'Rua das Acácias', number: '250', neighborhood: 'Centro',
        city: 'Muzambinho', state: 'MG', zip_code: '37890000',
        cnpj_status: 'ATIVA', cnpj_legal_nature: 'Sociedade Empresária Limitada',
        created_at: '2026-01-10T12:00:00Z',
    },
    bankAccounts: [
        {
            id: 'b1', supplier_id: 'sup1', bank_name: 'Banco do Brasil', bank_code: '001',
            agency: '1234', account: '56789', account_digit: '0', account_type: 'corrente',
            beneficiary_name: 'AFONSO H VILELA ENGENHARIA LTDA', pix_key: 'contato@afonso.com.br',
            pix_key_type: 'email', is_primary: true, status: 'ativo',
        },
    ],
};

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        getPartnerUserByEmail: vi.fn(async () => ({
            id: 'pu1', partner_workspace_id: 'ws1', email: 'eu@parceiro.com',
            name: 'Afonso', role: 'ADMINISTRADOR', is_active: true,
        })),
        getWorkspaceById: vi.fn(async () => WORKSPACE),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listRequests: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
        listMessages: vi.fn(async () => []),
        listFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: (...a: unknown[]) => getSupplierProfileApp(...a),
    },
}));

vi.mock('../../services/partnerPortalTokenService', () => ({
    partnerPortalTokenService: {
        getPortalData: vi.fn(async () => ({ valid: true, workspace: WORKSPACE })),
        getSharedDocuments: vi.fn(async () => []),
        getSharedDocumentsBundle: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        getRequests: vi.fn(async () => []),
        getContracts: vi.fn(async () => []),
        getConversations: vi.fn(async () => []),
        getFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: (...a: unknown[]) => getSupplierProfileToken(...a),
    },
}));

vi.mock('../../services/contractService', () => ({ contractService: {} }));
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        removeChannel: () => undefined,
    },
}));
vi.mock('../../components/documents/DocumentsTable', () => ({ DocumentsTable: () => null }));
vi.mock('../../components/documents/DocumentQrLabelModal', () => ({ DocumentQrLabelModal: () => null }));

import { PartnerPortal } from '../../components/partner/PartnerPortal';
import { ConfirmProvider } from '../../components/ui/confirm';

/**
 * `ConfirmProvider` vem do root do app (`index.tsx`), ACIMA do `App` — então o
 * portal por token, que o `App` devolve cedo, está dentro dele em produção.
 * Aqui ele tem de ser montado à mão: o `Sheet` usa `useConfirm` para a guarda
 * de saída e explode sem o provider.
 */
const renderPortal = (props: React.ComponentProps<typeof PartnerPortal>) =>
    render(<ConfirmProvider><PartnerPortal {...props} /></ConfirmProvider>);

async function abrirMeusDados(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /afonso/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Meus dados' }));
}

describe('PartnerPortal › Meus dados', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSupplierProfileToken.mockResolvedValue(PERFIL);
        getSupplierProfileApp.mockResolvedValue(PERFIL);
        window.localStorage.clear();
    });

    it('1. o item existe no menu de conta e abre o painel', async () => {
        const user = userEvent.setup();
        renderPortal({ userEmail: "", portalToken: "tok123" });
        await abrirMeusDados(user);

        expect(await screen.findByText('Identificação')).toBeInTheDocument();
        expect(screen.getByText('Endereço e contato')).toBeInTheDocument();
    });

    it('2. pelo LINK lê a casca do token, não a do app', async () => {
        const user = userEvent.setup();
        renderPortal({ userEmail: "", portalToken: "tok123" });
        await abrirMeusDados(user);

        await waitFor(() => expect(getSupplierProfileToken).toHaveBeenCalledWith('tok123'));
        expect(getSupplierProfileApp).not.toHaveBeenCalled();
    });

    it('3. no APP lê a casca do app, pelo id do workspace', async () => {
        const user = userEvent.setup();
        renderPortal({ userEmail: "eu@parceiro.com" });
        await abrirMeusDados(user);

        await waitFor(() => expect(getSupplierProfileApp).toHaveBeenCalledWith('ws1'));
        expect(getSupplierProfileToken).not.toHaveBeenCalled();
    });

    it('4. traz o cadastro inteiro, com CNPJ formatado e endereço', async () => {
        const user = userEvent.setup();
        renderPortal({ userEmail: "", portalToken: "tok123" });
        await abrirMeusDados(user);

        expect(await screen.findByText('12.345.678/0001-99')).toBeInTheDocument();
        // aparece como Nome fantasia e como Pessoa de contato
        expect(screen.getAllByText('Afonso Vilela').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('Muzambinho / MG')).toBeInTheDocument();
        expect(screen.getByText('37890-000')).toBeInTheDocument();
    });

    it('5. mostra os dados bancários — decisão do usuário, vale nos dois modos', async () => {
        const user = userEvent.setup();
        renderPortal({ userEmail: "", portalToken: "tok123" });
        await abrirMeusDados(user);

        expect(await screen.findByText(/Banco do Brasil/)).toBeInTheDocument();
        // o e-mail aparece duas vezes: contato e chave PIX
        expect(screen.getAllByText('contato@afonso.com.br').length).toBeGreaterThanOrEqual(2);
    });

    it('6. cadastro indisponível não derruba a tela', async () => {
        getSupplierProfileToken.mockResolvedValue({ supplier: null, bankAccounts: [] });
        const user = userEvent.setup();
        renderPortal({ userEmail: "", portalToken: "tok123" });
        await abrirMeusDados(user);

        expect(await screen.findByText('Cadastro indisponível')).toBeInTheDocument();
    });
});
