// @vitest-environment jsdom
/**
 * Portal do Parceiro › Documentos — "Enviados por você" em TABELA.
 * Pedido de 03/10/2026: "na aba documentos, os documentos enviados pela parceiro
 * esta em formato de card. Implementar o mesmo design (tabela) dos documentos do app".
 *
 * 2º pedido, mesmo dia: "a tabela de documentos enviados pela parceiro deve ter as
 * mesmas colunas da tabela de documentos do app" — virou a própria DocumentsTable.
 *
 * Trava:
 *  1. o que o parceiro enviou aparece numa tabela (não em cards), com AS MESMAS
 *     colunas da tabela de documentos, e o status em texto colorido (§8, sem pílula);
 *  2. a coluna Documento mostra o nome do ARQUIVO (sem o prefixo numérico do
 *     upload) e a extensão sai dele;
 *  3. baixar pela coluna Ações usa o mesmo caminho de antes (link assinado do token);
 *  4. sem nada enviado, a aba Enviados mostra o estado vazio.
 *
 * Pedido de 17/10/2026 (UX): recebidos e enviados empilhados — a lista de enviados
 * crescia e empurrava a de recebidos para baixo, sem divisão óbvia. Viraram ABAS:
 *  5. a tela abre em Recebidos; a aba muda título e tabela, com contador;
 *  6. envio que a construtora revisou desde a última visita à aba Enviados
 *     aparece como "1 atualizado" no rótulo — e some depois de aberta a aba.
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

const aba = (nome: RegExp) => screen.findByRole('tab', { name: nome });

/** Abre a aba Enviados; só a tabela da aba ativa existe no DOM. */
async function abrirEnviados() {
    const user = await abrirDocumentos();
    await user.click(await aba(/^Enviados/));
    await screen.findByText('Documentos Enviados');
    return { user, tabela: screen.getAllByRole('table')[0] };
}

const cabecalhoDe = (tabela: HTMLElement) =>
    within(tabela).getAllByRole('columnheader').map(th => th.textContent?.trim()).filter(Boolean);

describe('PartnerPortal › Documentos — Enviados por você', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        getRequests.mockResolvedValue([ENVIADO_PENDENTE, ENVIADO_INCLUIDO, OUTRA_SOLICITACAO]);
        getDocumentDownloadUrl.mockResolvedValue('https://assinado/x');
        vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('1. tabela com as colunas do envio; só envios de documento; status em texto', async () => {
        const { user, tabela } = await abrirEnviados();

        const cabecalho = cabecalhoDe(tabela);
        expect(cabecalho).toEqual([
            'Documento', 'Extensão', 'Autor', 'Nº Doc. Fornecedor', 'Tipo / Categoria', 'Revisão',
            'Obra Vinculada', 'Emissão', 'Validade', 'Status', 'Ações',
        ]);

        const linhas = within(tabela).getAllByRole('row').slice(1);
        expect(linhas).toHaveLength(2);
        expect(within(tabela).queryByText('Dúvida')).toBeNull();

        const pendente = within(tabela).getByText('Aguardando revisão');
        expect(pendente.className).toContain('text-amber-600');
        expect(pendente.className).not.toMatch(/rounded|uppercase|bg-/);
        expect(within(tabela).getByText('Incluído no GED').className).toContain('text-green-600');

        // ...e são exatamente as da tabela de documentos compartilhados (aba Recebidos)
        await user.click(await aba(/^Recebidos/));
        await screen.findByText('Documentos Compartilhados');
        expect(cabecalhoDe(screen.getAllByRole('table')[0])).toEqual(cabecalho);
    });

    it('2. nome do arquivo sem o prefixo do upload, extensão dele, autor = parceiro, observação sob o nome', async () => {
        const { tabela } = await abrirEnviados();

        expect(within(tabela).getByText('Proposta_004.pdf')).toBeInTheDocument();
        expect(within(tabela).getByText('Planta_baixa.dwg')).toBeInTheDocument();
        expect(within(tabela).getByText('PDF')).toBeInTheDocument();
        expect(within(tabela).getByText('DWG')).toBeInTheDocument();
        expect(within(tabela).getByText('Revisão da proposta')).toBeInTheDocument();
        expect(within(tabela).getAllByText('Parceiro X')).toHaveLength(2);
    });

    it('3. baixar pela coluna Ações pede o link assinado do token', async () => {
        const { user, tabela } = await abrirEnviados();

        const linha = within(tabela).getByText('Proposta_004.pdf').closest('tr')!;
        await user.click(within(linha).getByRole('button'));

        await waitFor(() => expect(getDocumentDownloadUrl).toHaveBeenCalledWith('tok123', 'partner-uploads/ws1/1726000000000_Proposta_004.pdf'));
        expect(window.open).toHaveBeenCalledWith('https://assinado/x', '_blank', 'noreferrer');
    });

    it('4. sem envio de documento, a aba Enviados mostra o estado vazio', async () => {
        getRequests.mockResolvedValue([OUTRA_SOLICITACAO]);
        await abrirEnviados();

        expect(screen.getByText(/Você ainda não enviou documentos/)).toBeInTheDocument();
    });

    it('5. abre em Recebidos; a aba troca título e conteúdo; Enviados mostra o contador', async () => {
        const user = await abrirDocumentos();

        const recebidos = await aba(/^Recebidos/);
        expect(recebidos).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Documentos Compartilhados')).toBeInTheDocument();
        expect(screen.queryByText('Proposta_004.pdf')).toBeNull();

        const enviados = await aba(/^Enviados/);
        await waitFor(() => expect(within(enviados).getByText('2')).toBeInTheDocument());

        await user.click(enviados);
        expect(enviados).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Documentos Enviados')).toBeInTheDocument();
        expect(screen.getByText('Proposta_004.pdf')).toBeInTheDocument();
    });

    it('6. envio revisado desde a última visita aparece como "1 atualizado" até a aba ser aberta', async () => {
        // Da última vez, os dois envios estavam aguardando; agora r2 foi incluído no GED.
        window.localStorage.setItem('partnerPortal:sentDocsStatusVisto', JSON.stringify({ r1: 'ABERTO', r2: 'ABERTO' }));
        const user = await abrirDocumentos();

        const enviados = await aba(/^Enviados/);
        await waitFor(() => expect(within(enviados).getByText('1 atualizado')).toBeInTheDocument());

        await user.click(enviados);
        await user.click(await aba(/^Recebidos/));

        await waitFor(() => expect(within(enviados).queryByText('1 atualizado')).toBeNull());
        expect(within(enviados).getByText('2')).toBeInTheDocument();
    });

    it('7. envio que o navegador nunca viu não conta como atualizado (primeiro acesso)', async () => {
        await abrirDocumentos();
        const enviados = await aba(/^Enviados/);
        await waitFor(() => expect(within(enviados).getByText('2')).toBeInTheDocument());
        expect(within(enviados).queryByText(/atualizado/)).toBeNull();
    });
});
