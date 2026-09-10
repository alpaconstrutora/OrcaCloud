// @vitest-environment jsdom
/**
 * Portal do Parceiro › aba Documentos — a árvore lateral saiu, entram dois
 * selects na toolbar. Pedido de 10/09/2026:
 * docs/planos/2026-09-10-portal-parceiro-documentos-sem-arvore.md
 *
 * O GED tirou o painel "Pastas e disciplinas" em b19f216c e trocou por dois
 * selects na toolbar. O portal do parceiro espelhava a árvore antiga. O que
 * estes casos travam:
 *   1. a árvore não volta;
 *   2. os dois selects existem, com a hierarquia das pastas na indentação e o
 *      rótulo `CÓDIGO — Nome` da disciplina, como no GED;
 *   3. pasta e disciplina valem JUNTOS (AND) — a regra do GED desde b19f216c.
 *
 * A `DocumentsTable` é substituída por um stub que expõe quantos documentos
 * recebeu: o que interessa aqui é o recorte que chega nela, não a tabela.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const WORKSPACE = { id: 'ws1', supplier_id: 'sup1', supplier_name: 'AFONSO H VILELA ENGENHARIA LTDA', is_active: true };

// Projetos ─┬─ Contenções (2 docs CON)
//           └─ Sondagem   (1 doc SON)      + 1 doc CON direto em Projetos
const FOLDERS = [
    { id: 'f-proj', name: 'Projetos', parent_id: null, naming_mask: null },
    { id: 'f-con', name: 'Contenções', parent_id: 'f-proj', naming_mask: null },
    { id: 'f-son', name: 'Sondagem', parent_id: 'f-proj', naming_mask: null },
];
const DISCIPLINES = [{ code: 'CON', name: 'Contenções' }, { code: 'SON', name: 'Sondagem' }];
const doc = (id: string, folder_id: string, discipline_code: string) => ({
    id, document_id: id, shared_at: '2026-09-01T00:00:00Z',
    document: { id, nome: `${id}.pdf`, folder_id, discipline_code, status: 'ativo', categoria: 'engenharia' },
});
const DOCS = [
    doc('017-CON-001', 'f-con', 'CON'),
    doc('017-CON-002', 'f-con', 'CON'),
    doc('017-SON-001', 'f-son', 'SON'),
    doc('017-CON-003', 'f-proj', 'CON'),
];
const BUNDLE = { documents: DOCS, folders: FOLDERS, disciplines: DISCIPLINES, sharedFolderIds: ['f-proj'] };

vi.mock('../../services/partnerService', () => ({
    partnerService: {
        getPartnerUserByEmail: vi.fn(async () => null),
        getWorkspaceById: vi.fn(async () => WORKSPACE),
        listSharedDocumentTree: vi.fn(async () => BUNDLE),
        listRequests: vi.fn(async () => []),
        listContracts: vi.fn(async () => []),
        listConversations: vi.fn(async () => []),
        listMessages: vi.fn(async () => []),
        listFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: vi.fn(async () => ({ supplier: null, bankAccounts: [] })),
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
        getFinancials: vi.fn(async () => ({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } })),
        getSupplierProfile: vi.fn(async () => ({ supplier: null, bankAccounts: [] })),
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
// Stub que só diz quantos documentos recebeu — é o recorte que está em teste.
vi.mock('../../components/documents/DocumentsTable', () => ({
    DocumentsTable: ({ documents }: { documents: unknown[] }) => (
        <div data-testid="tabela" data-linhas={documents.length} />
    ),
}));
vi.mock('../../components/documents/DocumentQrLabelModal', () => ({ DocumentQrLabelModal: () => null }));

import { PartnerPortal } from '../../components/partner/PartnerPortal';
import { ConfirmProvider } from '../../components/ui/confirm';

async function abrirDocumentos() {
    const user = userEvent.setup();
    render(<ConfirmProvider><PartnerPortal userEmail="" portalToken="tok123" /></ConfirmProvider>);
    await user.click(await screen.findByRole('button', { name: /^Documentos$/ }));
    await waitFor(() => expect(screen.getByTestId('tabela')).toHaveAttribute('data-linhas', '4'));
    return user;
}

const linhas = () => Number(screen.getByTestId('tabela').getAttribute('data-linhas'));
const selectPasta = () => screen.getByTitle('Filtrar por pasta') as HTMLSelectElement;
const selectDisc = () => screen.getByTitle('Filtrar por disciplina') as HTMLSelectElement;

describe('PartnerPortal › Documentos — toolbar no lugar da árvore', () => {
    beforeEach(() => { window.localStorage.clear(); });

    it('1. a árvore lateral não existe mais', async () => {
        await abrirDocumentos();
        expect(screen.queryByText(/pastas e disciplinas/i)).toBeNull();
        expect(screen.queryByText(/todos os documentos/i)).toBeNull();
    });

    it('2. o select de pasta traz a hierarquia na indentação, como no GED', async () => {
        await abrirDocumentos();
        // `option.text` colapsa espaço à esquerda (é o que a spec manda); o rótulo
        // real, com a indentação, está em `textContent`.
        const opcoes = Array.from(selectPasta().options).map(o => o.textContent);
        expect(opcoes).toEqual(['Todas as pastas', 'Projetos', '  └ Contenções', '  └ Sondagem']);
    });

    it('3. o select de disciplina rotula `CÓDIGO — Nome`', async () => {
        await abrirDocumentos();
        const opcoes = Array.from(selectDisc().options).map(o => o.text);
        expect(opcoes).toEqual(['Todas as disciplinas', 'CON — Contenções', 'SON — Sondagem']);
    });

    it('4. pasta filtra a subárvore inteira', async () => {
        const user = await abrirDocumentos();
        await user.selectOptions(selectPasta(), 'f-con');
        expect(linhas()).toBe(2);
        await user.selectOptions(selectPasta(), 'f-proj');
        expect(linhas()).toBe(4);   // Projetos inclui as duas subpastas
    });

    it('5. pasta e disciplina valem JUNTOS — a regra do GED desde b19f216c', async () => {
        const user = await abrirDocumentos();
        await user.selectOptions(selectDisc(), 'CON');
        expect(linhas()).toBe(3);
        await user.selectOptions(selectPasta(), 'f-son');
        // Sondagem só tem SON: com CON ainda escolhido, o cruzamento é vazio.
        expect(linhas()).toBe(0);
        await user.selectOptions(selectDisc(), '');
        expect(linhas()).toBe(1);
    });
});
