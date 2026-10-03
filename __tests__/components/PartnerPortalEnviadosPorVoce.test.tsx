// @vitest-environment jsdom
/**
 * Portal do Parceiro › Documentos — "Enviados por você" em TABELA.
 * Pedido de 03/10/2026: "na aba documentos, os documentos enviados pela parceiro
 * esta em formato de card. Implementar o mesmo design (tabela) dos documentos do app".
 *
 * Trava:
 *  1. o que o parceiro enviou aparece numa tabela (não em cards), com as colunas
 *     que esse registro tem e o status em texto colorido (§8, sem pílula);
 *  2. a coluna Documento mostra o nome do ARQUIVO (sem o prefixo numérico do
 *     upload) e a extensão sai dele;
 *  3. baixar pela coluna Ações usa o mesmo caminho de antes (link assinado do token);
 *  4. sem nada enviado, a seção não aparece.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getRequests = vi.fn();
const getDocumentDownloadUrl = vi.fn();

const WORKSPACE = { id: 'ws1', supplier_id: 'sup1', supplier_name: 'Parceiro X', is_active: true };

const ENVIADO_PENDENTE = {
    id: 'r1', partner_workspace_id: 'ws1', title: 'Proposta.pdf', description: 'Revisão da proposta',
    type: 'DOCUMENTACAO', status: 'ABERTO', priority: 'MEDIA',
    attachment_paths: ['partner-uploads/ws1/1726000000000_Proposta_004.pdf'],
    created_at: '2026-07-22T15:00:00Z',
};
const ENVIADO_INCLUIDO = {
    ...ENVIADO_PENDENTE, id: 'r2', title: 'Planta.dwg', description: '', status: 'CONCLUIDO',
    attachment_paths: ['partner-uploads/ws1/1726000000001_Planta_baixa.dwg'],
    created_at: '2026-07-20T15:00:00Z',
};
// Solicitação que NÃO é envio de documento — não pode entrar na tabela.
const OUTRA_SOLICITACAO = { ...ENVIADO_PENDENTE, id: 'r3', type: 'DUVIDA', title: 'Dúvida', attachment_paths: [] };

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        getWorkspaceById: vi.fn(async () => WORKSPACE),
        listSharedDocumentTree: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        listRequests: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
    },
}));
vi.mock('../../services/partnerPortalTokenService', () => ({
    partnerPortalTokenService: {
        getPortalData: vi.fn(async () => ({ valid: true, workspace: WORKSPACE })),
        getSharedDocuments: vi.fn(async () => []),
        getSharedDocumentsBundle: vi.fn(async () => ({ documents: [], folders: [], disciplines: [], sharedFolderIds: [] })),
        getRequests: (...a: unknown[]) => getRequests(...a),
        getContracts: vi.fn(async () => []),
        getConversations: vi.fn(async () => []),
        getDocumentDownloadUrl: (...a: unknown[]) => getDocumentDownloadUrl(...a),
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
    return user;
}

/** A tabela de "Enviados por você" é a primeira do <main>. */
async function tabelaEnviados() {
    await screen.findByText(/Enviados por você/);
    return screen.getAllByRole('table')[0];
}

describe('PartnerPortal › Documentos — Enviados por você', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        getRequests.mockResolvedValue([ENVIADO_PENDENTE, ENVIADO_INCLUIDO, OUTRA_SOLICITACAO]);
        getDocumentDownloadUrl.mockResolvedValue('https://assinado/x');
        vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('1. tabela com as colunas do envio; só envios de documento; status em texto', async () => {
        await abrirDocumentos();
        const tabela = await tabelaEnviados();

        const cabecalho = within(tabela).getAllByRole('columnheader').map(th => th.textContent?.trim()).filter(Boolean);
        expect(cabecalho).toEqual(['Documento', 'Extensão', 'Observação', 'Enviado em', 'Status', 'Ações']);
        expect(screen.getByText('(2)')).toBeInTheDocument();

        const linhas = within(tabela).getAllByRole('row').slice(1);
        expect(linhas).toHaveLength(2);
        expect(within(tabela).queryByText('Dúvida')).toBeNull();

        const pendente = within(tabela).getByText('Aguardando revisão');
        expect(pendente.className).toContain('text-amber-600');
        expect(pendente.className).not.toMatch(/rounded|uppercase|bg-/);
        expect(within(tabela).getByText('Incluído no GED').className).toContain('text-green-600');
    });

    it('2. nome do arquivo sem o prefixo do upload, e a extensão vem dele', async () => {
        await abrirDocumentos();
        const tabela = await tabelaEnviados();

        expect(within(tabela).getByText('Proposta_004.pdf')).toBeInTheDocument();
        expect(within(tabela).getByText('Planta_baixa.dwg')).toBeInTheDocument();
        expect(within(tabela).getByText('PDF')).toBeInTheDocument();
        expect(within(tabela).getByText('DWG')).toBeInTheDocument();
        expect(within(tabela).getByText('Revisão da proposta')).toBeInTheDocument();
    });

    it('3. baixar pela coluna Ações pede o link assinado do token', async () => {
        const user = await abrirDocumentos();
        const tabela = await tabelaEnviados();

        const linha = within(tabela).getByText('Proposta_004.pdf').closest('tr')!;
        await user.click(within(linha).getByRole('button'));

        await waitFor(() => expect(getDocumentDownloadUrl).toHaveBeenCalledWith('tok123', 'partner-uploads/ws1/1726000000000_Proposta_004.pdf'));
        expect(window.open).toHaveBeenCalledWith('https://assinado/x', '_blank', 'noreferrer');
    });

    it('4. sem envio de documento, a seção não aparece', async () => {
        getRequests.mockResolvedValue([OUTRA_SOLICITACAO]);
        await abrirDocumentos();
        await waitFor(() => expect(getRequests).toHaveBeenCalled());

        expect(screen.queryByText(/Enviados por você/)).toBeNull();
    });
});
