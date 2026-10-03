// @vitest-environment jsdom
/**
 * GED (OpuraDocsModule) — clicar no cabeçalho ORDENA a tabela de documentos, e o
 * Shift+clique de seleção recorta o intervalo da lista que está NA TELA.
 *
 * Por quê:
 *  - Até 03/10/2026 a seta do cabeçalho mudava e as linhas ficavam no lugar: a
 *    DocumentsTable deixa a ordem com quem chama e o GED não ordenava (mesmo
 *    defeito do Portal do Parceiro, ver PartnerPortalDocumentosOrdenar.test.tsx).
 *  - Ao passar a ordenar, o Shift+clique (handleToggleDocRow) corre um risco
 *    próprio: ele recorta o intervalo POR POSIÇÃO. Se recortar da lista filtrada
 *    (ordem do serviço) em vez da ordenada (ordem exibida), marca documentos que
 *    não estão entre as linhas que o usuário escolheu — e a edição em lote age
 *    sobre eles.
 *
 * A DocumentsTable aqui é a REAL; só serviços e componentes pesados fora do
 * caminho são mockados.
 */
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const doc = (id: string, nome: string) => ({
    id,
    organization_id: 'org1',
    nome,
    categoria: 'engenharia',
    tipo_documento: 'Projeto',
    status: 'ativo',
    alerta_dias_antecedencia: 30,
    tags: [],
    criado_por: 'eu@x.com',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
});
// Chegam do serviço fora de ordem, de propósito: as posições 1–3 da lista recebida
// (DELTA, BRAVO, ALFA) e as linhas 1–3 ordenadas por nome (ALFA, BRAVO, CHARLIE)
// são conjuntos DIFERENTES.
const DOCS = [
    doc('d4', 'DOC-DELTA'),
    doc('d2', 'DOC-BRAVO'),
    doc('d1', 'DOC-ALFA'),
    doc('d5', 'DOC-ECHO'),
    doc('d3', 'DOC-CHARLIE'),
];

vi.mock('../../services/documentService', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../services/documentService')>();
    return {
        ...original,
        documentService: {
            listMemberships: vi.fn(async () => [{ organization_id: 'org1', role: 'admin', permissions: {} }]),
            listDocuments: vi.fn(async () => DOCS),
            listFolders: vi.fn(async () => []),
            listPendingApprovals: vi.fn(async () => []),
            listOrganizationMembers: vi.fn(async () => []),
            listDisciplines: vi.fn(async () => []),
            listNamingPatterns: vi.fn(async () => []),
            listDocumentTypes: vi.fn(async () => []),
            listFileExtensions: vi.fn(async () => []),
            listAuditLogsForDocument: vi.fn(async () => []),
            listApprovalsForDocument: vi.fn(async () => []),
            getDocumentById: vi.fn(async () => null),
            logDocumentAction: vi.fn(async () => undefined),
        },
    };
});
vi.mock('../../services/partnerService', () => ({
    partnerService: {
        listWorkspaces: vi.fn(async () => []),
        listSharingsForDocuments: vi.fn(async () => []),
        listSharingsForFolder: vi.fn(async () => []),
    },
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: vi.fn(async () => []) } }));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: vi.fn(async () => []) } }));
vi.mock('../../services/supplierService', () => ({ supplierService: { listSuppliers: vi.fn(async () => []) } }));
vi.mock('../../services/creditRoomService', () => ({ creditRoomService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/tableColumnPreferencesService', () => ({
    tableColumnPreferencesService: { get: vi.fn(async () => null), save: vi.fn(async () => undefined) },
}));
vi.mock('../../lib/supabase', () => {
    const chain: any = new Proxy(() => chain, {
        get: (_t, prop) => (prop === 'then' ? (res: any) => res({ data: [], error: null }) : chain),
        apply: () => chain,
    });
    return {
        supabase: {
            from: () => chain,
            rpc: async () => ({ data: null, error: null }),
            auth: {
                getUser: async () => ({ data: { user: null }, error: null }),
                getSession: async () => ({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
            },
            channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
            removeChannel: () => undefined,
            storage: { from: () => chain },
        },
    };
});
vi.mock('../../components/ui/confirm', () => ({
    useConfirm: () => vi.fn(async () => true),
    ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/ui/DocumentMarkupViewer', () => ({ DocumentMarkupViewer: () => null }));
vi.mock('../../components/documents/DocumentQrLabelModal', () => ({ DocumentQrLabelModal: () => null }));
vi.mock('../../components/documents/BatchUploadSheet', () => ({ BatchUploadSheet: () => null }));
vi.mock('../../components/documents/DocumentBatchEditModal', () => ({ DocumentBatchEditModal: () => null }));
vi.mock('../../components/ClientSelect', () => ({ default: () => null }));

import { OpuraDocsModule } from '../../components/OpuraDocsModule';

// Objeto estável: `currentProfile` está nas dependências do efeito que carrega a lista.
const PERFIL = { group: 'ADMIN', role: 'admin', email: 'eu@x.com' };

async function abrirGed() {
    const user = userEvent.setup();
    render(
        <OpuraDocsModule
            activeOrganizationId="org1"
            projects={[]}
            currentProfile={PERFIL}
            onChangeView={() => {}}
        />,
    );
    await screen.findByText('DOC-DELTA');
    return user;
}

const tabela = () => screen.getAllByRole('table').find(t => within(t).queryByText('DOC-DELTA'))!;
const linhas = () => within(tabela()).getAllByRole('row').filter(tr => /DOC-/.test(tr.textContent ?? ''));
/** Nomes na ordem em que aparecem nas linhas. */
const nomes = () => within(tabela()).getAllByText(/^DOC-/).map(el => el.textContent);
const cabecalho = (rotulo: string) =>
    within(tabela()).getAllByRole('columnheader').find(th => th.textContent?.trim() === rotulo)!;
const checkboxDaLinha = (i: number) => within(linhas()[i]).getByRole('checkbox') as HTMLInputElement;
/** Nomes das linhas cujo checkbox está marcado, na ordem da tela. */
const nomesMarcados = () =>
    linhas()
        .filter(tr => (within(tr).getByRole('checkbox') as HTMLInputElement).checked)
        .map(tr => within(tr).getByText(/^DOC-/).textContent);

describe('GED › tabela de documentos — ordenar pelo cabeçalho', () => {
    beforeEach(() => { window.localStorage.clear(); });

    it('sem clicar, as linhas aparecem na ordem recebida do serviço', async () => {
        await abrirGed();
        expect(nomes()).toEqual(['DOC-DELTA', 'DOC-BRAVO', 'DOC-ALFA', 'DOC-ECHO', 'DOC-CHARLIE']);
    });

    it('Documento: 1º clique crescente, 2º decrescente', async () => {
        const user = await abrirGed();

        await user.click(cabecalho('Documento'));
        await waitFor(() => expect(nomes()).toEqual(['DOC-ALFA', 'DOC-BRAVO', 'DOC-CHARLIE', 'DOC-DELTA', 'DOC-ECHO']));

        await user.click(cabecalho('Documento'));
        await waitFor(() => expect(nomes()).toEqual(['DOC-ECHO', 'DOC-DELTA', 'DOC-CHARLIE', 'DOC-BRAVO', 'DOC-ALFA']));
    });

    it('Shift+clique com a tabela ordenada seleciona as linhas VISÍVEIS do intervalo', async () => {
        const user = await abrirGed();

        await user.click(cabecalho('Documento'));
        await waitFor(() => expect(nomes()).toEqual(['DOC-ALFA', 'DOC-BRAVO', 'DOC-CHARLIE', 'DOC-DELTA', 'DOC-ECHO']));

        // Âncora: 1ª linha visível.
        fireEvent.click(checkboxDaLinha(0));
        await waitFor(() => expect(checkboxDaLinha(0).checked).toBe(true));

        // Shift+clique na 3ª linha visível.
        fireEvent.click(checkboxDaLinha(2), { shiftKey: true });

        // Exatamente as linhas 1–3 da TELA (ALFA, BRAVO, CHARLIE) — não as posições
        // 1–3 da lista do serviço (DELTA, BRAVO, ALFA).
        await waitFor(() => expect(nomesMarcados()).toEqual(['DOC-ALFA', 'DOC-BRAVO', 'DOC-CHARLIE']));
        expect(screen.getByText('3 selecionados')).toBeTruthy();
    });
});
