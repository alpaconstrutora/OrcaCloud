// @vitest-environment jsdom
/**
 * Portal do Parceiro › detalhe do contrato — as abas que faltavam.
 * Pedido de 10/09/2026, docs/planos/2026-09-10-portal-parceiro-abas-do-contrato.md
 *
 * O que estes casos travam:
 *   1. as três abas novas existem (Execução & Entrega, Retenção de Garantia,
 *      Penalidades) — e Riscos & Conformidade NÃO (decisão do usuário);
 *   2. os DOIS modos leem o MESMO núcleo, cada um pela sua casca — o modo app
 *      deixou de ler contractService tabela a tabela (fim das gêmeas);
 *   3. cada aba mostra o que o núcleo mandou, com o vocabulário compartilhado
 *      de lib/contractLabels (a mesma palavra que a tela interna usa).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getDetailToken = vi.fn();
const getDetailApp = vi.fn();
const listContractItems = vi.fn();

const WORKSPACE = { id: 'ws1', supplier_id: 'sup1', supplier_name: 'AFONSO H VILELA ENGENHARIA LTDA', is_active: true };
const CONTRATO = {
    id: 'ct1', number: '010', title: 'Assistencia Administrativa', status: 'Assinado',
    original_value: 48000, current_value: 48000, retention_rate: 5,
    start_date: '2026-01-01', end_date: '2026-12-31',
    description: 'Apoio administrativo na obra.', start_order_issued_at: '2026-02-10',
};

const DETALHE = {
    items: [{ id: 'i1', contract_id: 'ct1', description: 'Apoio mensal', quantity: 12, unit: 'mês', unit_price: 4000, total_price: 48000 }],
    addendums: [],
    measurements: [],
    precedentConditions: [
        { id: 'pc1', contract_id: 'ct1', item: 'Entregar ART', responsible: 'Contratada', required: true, satisfied: true, sort_order: 1 },
        { id: 'pc2', contract_id: 'ct1', item: 'Apresentar seguro', responsible: 'Contratada', required: true, satisfied: false, sort_order: 2 },
    ],
    documentRequirements: [
        { id: 'd1', contract_id: 'ct1', document: 'Certidão FGTS', phase: 'MENSAL', applicable: true, last_valid_until: '2020-01-01', blocks_payment: true, is_sst_critical: false },
        { id: 'd2', contract_id: 'ct1', document: 'PCMSO', phase: 'ANTES_INICIO', applicable: true, document_url: 'https://x/pcmso.pdf', blocks_payment: false, is_sst_critical: true },
        { id: 'd3', contract_id: 'ct1', document: 'Termo de encerramento', phase: 'ENCERRAMENTO', applicable: true, blocks_payment: false, is_sst_critical: false },
    ],
    acceptances: [{ id: 'a1', contract_id: 'ct1', kind: 'PROVISORIO', issued_at: '2026-08-01', pending_items: ['pintura'] }],
    retention: {
        totalRetained: 2400, totalReleased: 1000, balance: 1400,
        releases: [{ id: 'r1', contract_id: 'ct1', kind: 'PROVISORIO', amount: 1000, released_at: '2026-08-15', notes: 'metade' }],
    },
    penalties: [
        { id: 'p1', contract_id: 'ct1', kind: 'MORATORIA', reason: 'Atraso na entrega', amount: 350, status: 'NOTIFICADA' },
        { id: 'p2', contract_id: 'ct1', kind: 'SST', reason: 'EPI', amount: 120, status: 'CANCELADA' },
    ],
};

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        getPartnerUserByEmail: vi.fn(async () => ({ id: 'pu1', partner_workspace_id: 'ws1', email: 'eu@parceiro.com', name: 'Afonso', role: 'ADMINISTRADOR', is_active: true })),
        getWorkspaceById: vi.fn(async () => WORKSPACE),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listRequests: vi.fn(async () => []),
        listContracts: vi.fn(async () => [CONTRATO]),
        listConversations: vi.fn(async () => []),
        listMessages: vi.fn(async () => []),
        listFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: vi.fn(async () => ({ supplier: null, bankAccounts: [] })),
        getContractDetail: (...a: unknown[]) => getDetailApp(...a),
    },
}));
vi.mock('../../services/partnerPortalTokenService', () => ({
    partnerPortalTokenService: {
        getPortalData: vi.fn(async () => ({ valid: true, workspace: WORKSPACE })),
        getSharedDocuments: vi.fn(async () => []),
        getSharedDocumentsBundle: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        getRequests: vi.fn(async () => []),
        getContracts: vi.fn(async () => [CONTRATO]),
        getConversations: vi.fn(async () => []),
        getFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: vi.fn(async () => ({ supplier: null, bankAccounts: [] })),
        getContractDetail: (...a: unknown[]) => getDetailToken(...a),
    },
}));
// Se o portal voltar a ler contractService direto, este mock acusa.
vi.mock('../../services/contractService', () => ({
    contractService: { listContractItems: (...a: unknown[]) => listContractItems(...a) },
}));
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

async function abrirContrato(props: React.ComponentProps<typeof PartnerPortal>) {
    const user = userEvent.setup();
    render(<ConfirmProvider><PartnerPortal {...props} /></ConfirmProvider>);
    await user.click(await screen.findByRole('button', { name: /^Contratos$/ }));
    await user.click(await screen.findByRole('button', { name: 'Ver Detalhes' }));
    await screen.findByText('Visão Geral');
    return user;
}

const abas = () => screen.getAllByRole('button').map(b => b.textContent?.trim() ?? '');

describe('PartnerPortal › detalhe do contrato — abas novas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDetailToken.mockResolvedValue(DETALHE);
        getDetailApp.mockResolvedValue(DETALHE);
        window.localStorage.clear();
    });

    it('1. tem as três abas novas e NÃO tem Riscos & Conformidade', async () => {
        await abrirContrato({ userEmail: '', portalToken: 'tok123' });
        const nomes = abas();
        expect(nomes).toContain('Execução & Entrega');
        expect(nomes).toContain('Retenção de Garantia');
        expect(nomes.some(n => n.startsWith('Penalidades'))).toBe(true);
        expect(nomes.some(n => /Riscos/.test(n))).toBe(false);
    });

    it('2. pelo LINK lê a casca do token; no APP lê a casca do app — nunca contractService', async () => {
        await abrirContrato({ userEmail: '', portalToken: 'tok123' });
        await waitFor(() => expect(getDetailToken).toHaveBeenCalledWith('tok123', 'ct1'));
        expect(getDetailApp).not.toHaveBeenCalled();
        expect(listContractItems).not.toHaveBeenCalled();
    });

    it('3. no modo app, a casca do app pelo id do workspace', async () => {
        await abrirContrato({ userEmail: 'eu@parceiro.com' });
        await waitFor(() => expect(getDetailApp).toHaveBeenCalledWith('ws1', 'ct1'));
        expect(getDetailToken).not.toHaveBeenCalled();
        expect(listContractItems).not.toHaveBeenCalled();
    });

    it('4. Execução & Entrega: pré-mobilização, matriz documental e recebimento', async () => {
        const user = await abrirContrato({ userEmail: '', portalToken: 'tok123' });
        await user.click(screen.getByRole('button', { name: 'Execução & Entrega' }));

        expect(await screen.findByText(/Ordem de Início emitida em/)).toBeInTheDocument();
        expect(screen.getByText('Entregar ART')).toBeInTheDocument();
        expect(screen.getByText('Apresentar seguro')).toBeInTheDocument();

        // Matriz: mensal vencida, antes-do-início com arquivo, encerramento sem nada
        expect(screen.getByText('Vencido')).toBeInTheDocument();
        expect(screen.getByText('Entregue')).toBeInTheDocument();
        expect(screen.getByText('Pendente')).toBeInTheDocument();
        expect(screen.getByText('Mensal')).toBeInTheDocument();
        expect(screen.getByText('bloqueia pagamento')).toBeInTheDocument();
        expect(screen.getByText('SST')).toBeInTheDocument();

        expect(screen.getByText('Recebimento Provisório')).toBeInTheDocument();
        expect(screen.getByText('1 pendência(s)')).toBeInTheDocument();
    });

    it('5. Retenção de Garantia: ledger deste contrato + liberações, sem botão de liberar', async () => {
        const user = await abrirContrato({ userEmail: '', portalToken: 'tok123' });
        await user.click(screen.getByRole('button', { name: 'Retenção de Garantia' }));

        expect(await screen.findByText('R$ 1.400,00')).toBeInTheDocument();   // saldo
        expect(screen.getByText('R$ 2.400,00')).toBeInTheDocument();          // retido
        expect(screen.getByText('Liberação Provisório')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Liberar/ })).toBeNull();
    });

    it('6. Penalidades: rótulos de lib/contractLabels, inclusive a cancelada', async () => {
        const user = await abrirContrato({ userEmail: '', portalToken: 'tok123' });
        await user.click(screen.getByRole('button', { name: /^Penalidades/ }));

        expect(await screen.findByText('Moratória')).toBeInTheDocument();
        expect(screen.getByText('Notificada')).toBeInTheDocument();
        expect(screen.getByText('SST/Compliance')).toBeInTheDocument();
        expect(screen.getByText('Cancelada')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Aplicar|Aceitar Cura|Notificar/ })).toBeNull();
    });
});
