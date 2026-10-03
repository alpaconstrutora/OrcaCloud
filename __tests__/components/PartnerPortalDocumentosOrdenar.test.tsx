// @vitest-environment jsdom
/**
 * Portal do Parceiro › Documentos — clicar no cabeçalho ORDENA a tabela de
 * documentos compartilhados. Até 03/10/2026 a seta mudava e as linhas ficavam
 * no lugar: a DocumentsTable deixa a ordem com quem chama e o portal não ordenava.
 * Aqui a DocumentsTable é a REAL (o teste da toolbar usa um stub que só conta linhas).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const WORKSPACE = { id: 'ws1', supplier_id: 'sup1', supplier_name: 'Parceiro X', is_active: true };

const doc = (id: string, nome: string, data_emissao?: string) => ({
    id, document_id: id, shared_at: '2026-09-01T00:00:00Z',
    document: { id, nome, data_emissao, status: 'ativo', categoria: 'engenharia', tipo_documento: 'Projeto', folder_id: 'f1' },
});
// Chegam fora de ordem, de propósito.
const DOCS = [
    doc('d1', '032-FUN-002-R00', '2025-09-07T12:00:00'),
    doc('d2', '032-ARQ-001-R00'),
    doc('d3', '032-EST-001-R00', '2026-01-15T12:00:00'),
    doc('d4', '032-ARQ-002-R00', '2025-03-01T12:00:00'),
];
const BUNDLE = { documents: DOCS, folders: [{ id: 'f1', name: 'Projetos', parent_id: null, naming_mask: null }], disciplines: [], sharedFolderIds: ['f1'] };

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        getWorkspaceById: vi.fn(async () => WORKSPACE),
        listSharedDocumentTree: vi.fn(async () => BUNDLE),
        listRequests: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
    },
}));
vi.mock('../../services/partnerPortalTokenService', () => ({
    partnerPortalTokenService: {
        getPortalData: vi.fn(async () => ({ valid: true, workspace: WORKSPACE })),
        getSharedDocuments: vi.fn(async () => DOCS),
        getSharedDocumentsBundle: vi.fn(async () => BUNDLE),
        getRequests: vi.fn(async () => []),
        getContracts: vi.fn(async () => []),
        getConversations: vi.fn(async () => []),
    },
}));
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
        channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        removeChannel: () => undefined,
    },
}));
vi.mock('../../components/documents/DocumentQrLabelModal', () => ({ DocumentQrLabelModal: () => null }));

import { PartnerPortal } from '../../components/partner/PartnerPortal';
import { ConfirmProvider } from '../../components/ui/confirm';

async function abrirDocumentos() {
    const user = userEvent.setup();
    render(<ConfirmProvider><PartnerPortal userEmail="" portalToken="tok123" /></ConfirmProvider>);
    await user.click(await screen.findByRole('button', { name: /^Documentos$/ }));
    await screen.findByText('032-FUN-002-R00');
    return user;
}

const tabela = () => screen.getByRole('table');
/** Nomes na ordem em que aparecem nas linhas. */
const nomes = () => within(tabela()).getAllByText(/^032-/).map(el => el.textContent);
const cabecalho = (rotulo: string) =>
    within(tabela()).getAllByRole('columnheader').find(th => th.textContent?.trim() === rotulo)!;

describe('PartnerPortal › Documentos — ordenar pelo cabeçalho', () => {
    beforeEach(() => { window.localStorage.clear(); });

    it('sem clicar, a ordem é a de chegada', async () => {
        await abrirDocumentos();
        expect(nomes()).toEqual(['032-FUN-002-R00', '032-ARQ-001-R00', '032-EST-001-R00', '032-ARQ-002-R00']);
    });

    it('Documento: 1º clique crescente, 2º decrescente', async () => {
        const user = await abrirDocumentos();

        await user.click(cabecalho('Documento'));
        await waitFor(() => expect(nomes()).toEqual(['032-ARQ-001-R00', '032-ARQ-002-R00', '032-EST-001-R00', '032-FUN-002-R00']));

        await user.click(cabecalho('Documento'));
        await waitFor(() => expect(nomes()).toEqual(['032-FUN-002-R00', '032-EST-001-R00', '032-ARQ-002-R00', '032-ARQ-001-R00']));
    });

    it('Emissão: por data, e o documento sem data fica no fim', async () => {
        const user = await abrirDocumentos();

        await user.click(cabecalho('Emissão'));
        await waitFor(() => expect(nomes()).toEqual(['032-ARQ-002-R00', '032-FUN-002-R00', '032-EST-001-R00', '032-ARQ-001-R00']));

        await user.click(cabecalho('Emissão'));
        await waitFor(() => expect(nomes()).toEqual(['032-EST-001-R00', '032-FUN-002-R00', '032-ARQ-002-R00', '032-ARQ-001-R00']));
    });
});
