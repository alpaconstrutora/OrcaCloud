// @vitest-environment jsdom
/**
 * Contratos › Emissão › "Gerar pelo modelo" — Credor vem do contrato, e é modal (19/10/2026).
 *
 * Pedido: "trocar o nome do campo cliente para Credor", "O contrato ja sabe quem é o credor
 * então não ha necessidade de perguntar" e "substituir drawer por modal". Suprimentos nunca
 * tem cliente — o credor é o fornecedor de Dados Gerais › Fornecedor.
 *
 * O que este teste trava (com o catálogo de campos REAL, sem mock):
 *  1. contrato com fornecedor: campo "Credor" só-leitura com o nome do cadastro, sem seletor
 *     de cliente, e a lista de clientes nem é consultada;
 *  2. a pré-visualização preenche a parte contratada — pela origem nova "Credor
 *     (fornecedor)" e pelas antigas "Compradores"/"Cliente" (modelo atual sem remapear);
 *  3. é modal central (role=dialog, aria-modal), não o painel lateral;
 *  4. enquanto o credor carrega, gerar fica desligado e diz o motivo.
 *
 * Plano: docs/planos/2026-10-19-gerar-pelo-modelo-credor-modal.md
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const listClients = vi.fn(() => Promise.resolve([]));
let resolverFornecedor: (s: unknown) => void = () => {};

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve([{
            id: 't1', name: 'Contrato de prestação', file_path: 'x.docx',
            detected_tokens: ['010', '018', '040'],
            token_map: {
                '010': { source: 'buyers', field: 'names' },
                '018': { source: 'buyers', field: 'documents' },
                '040': { source: 'supplier', field: 'city' },
            },
        }]),
        downloadFile: () => Promise.resolve(new Blob(['x'])),
    },
}));
vi.mock('../../services/docxRenderService', () => ({
    fillDocx: () => Promise.resolve(new Blob(['x'])),
    docxBlobToPdf: () => Promise.resolve(new Blob(['%PDF'])),
}));
vi.mock('../../services/supplierService', () => ({
    supplierService: { getById: () => new Promise(r => { resolverFornecedor = r; }) },
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => listClients() } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: () => Promise.resolve(null) } }));
vi.mock('../../services/contractDocumentVersionService', () => ({
    contractDocumentVersionService: { addVersionFromBlob: vi.fn(), listByOwner: () => Promise.resolve([]) },
}));

import EmitDocumentModal from '../../components/EmitDocumentModal';
import { ConfirmProvider } from '../../components/ui/confirm';

const CONTRATO_SUPRIMENTOS = {
    id: 'c-1', number: 'CTS-010-036-0002', organization_id: 'org-1', supplier_id: 'sup-1', direction: 'INCOMING',
} as never;
const DEBORA = {
    id: 'sup-1', name: 'Débora Cristina Duarte', type: 'PF', document: '123.456.789-00', city: 'Cuiabá', state: 'MT',
};

const montar = () => render(
    <ConfirmProvider>
        <EmitDocumentModal organizationId="org-1" contract={CONTRATO_SUPRIMENTOS} organization={null} onClose={() => {}} persistVersion />
    </ConfirmProvider>,
);

describe('Gerar pelo modelo — Credor do contrato, em modal', () => {
    beforeEach(() => { listClients.mockClear(); });

    it('é modal central, não painel lateral', async () => {
        montar();
        const dialogo = await screen.findByRole('dialog');
        expect(dialogo.getAttribute('aria-modal')).toBe('true');
        expect(within(dialogo).getByText(/Gerar pelo modelo — CTS-010-036-0002/)).toBeTruthy();
    });

    it('mostra "Credor" só-leitura com o fornecedor do contrato — sem perguntar cliente', async () => {
        montar();
        await screen.findByText('Credor');
        resolverFornecedor(DEBORA);
        expect(await screen.findByText('Débora Cristina Duarte', { selector: 'p' })).toBeTruthy();
        expect(screen.getByText(/Vem de Dados Gerais › Fornecedor/)).toBeTruthy();
        expect(screen.queryByText('Cliente')).toBeNull();
        expect(screen.queryByText('Sem cliente')).toBeNull();
        expect(listClients).not.toHaveBeenCalled();
    });

    it('a pré-visualização preenche a parte contratada com o credor (origens antigas e a nova)', async () => {
        montar();
        resolverFornecedor(DEBORA);
        await screen.findByText('Débora Cristina Duarte', { selector: 'p' });
        fireEvent.change(screen.getByLabelText(/Modelo/), { target: { value: 't1' } });

        const linha = (tk: string) => screen.getByText(`{${tk}}`).closest('tr')!;
        await waitFor(() => expect(linha('010').textContent).toContain('Débora Cristina Duarte'));
        expect(linha('018').textContent).toContain('123.456.789-00');
        expect(linha('040').textContent).toContain('Cuiabá');
        expect(linha('040').textContent).toContain('Credor (fornecedor)');
    });

    it('enquanto o credor carrega, gerar fica desligado e diz o motivo', async () => {
        montar();
        fireEvent.change(await screen.findByLabelText(/Modelo/), { target: { value: 't1' } });
        const gerar = screen.getByRole('button', { name: /Gerar versão \(PDF\)/ });
        expect((gerar as HTMLButtonElement).disabled).toBe(true);
        expect(gerar.closest('span')!.getAttribute('title')).toBe('Carregando os dados do credor…');

        resolverFornecedor(DEBORA);
        await waitFor(() => expect((screen.getByRole('button', { name: /Gerar versão \(PDF\)/ }) as HTMLButtonElement).disabled).toBe(false));
    });
});
