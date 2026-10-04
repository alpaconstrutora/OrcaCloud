// @vitest-environment jsdom
/**
 * Contratos › Emissão — "Gerar pelo modelo" grava versão em PDF (04/10/2026).
 *
 * Defeito: o .docx gerado era enviado ao bucket `documents`, que só aceita PDF
 * e imagem desde a auditoria C3-07 (18/09/2026). O upload falhava, a versão
 * nunca nascia, o arquivo baixava mesmo assim e o painel fechava — o erro ficava
 * num toast de 4,5 s. Além disso, Baixar .docx + Baixar PDF criavam DUAS versões.
 *
 * O que este teste trava:
 *  1. só o PDF vira versão; o .docx só baixa (nenhum upload de .docx);
 *  2. um clique em "Gerar versão (PDF)" = uma versão;
 *  3. falha ao gravar mantém o painel aberto com o erro visível;
 *  4. "Subir documento" recusa arquivo que não é PDF;
 *  5. o botão da aba chama "Gerar pelo modelo" e o PDF do sistema grava versão
 *     de origem SISTEMA.
 *
 * Plano: docs/planos/2026-10-04-gerar-pelo-modelo-versao-pdf.md
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const addVersionFromBlob = vi.fn();
const saveAs = vi.fn();

vi.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => saveAs(...a) }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve([{ id: 't1', name: 'Contrato padrão', file_path: 'x.docx', detected_tokens: ['001'], token_map: { '001': { source: 'contract', field: 'number' } } }]),
        downloadFile: () => Promise.resolve(new Blob(['modelo'], { type: DOCX_MIME })),
    },
}));
vi.mock('../../services/docxRenderService', () => ({
    fillDocx: () => Promise.resolve(new Blob(['preenchido'], { type: DOCX_MIME })),
    docxBlobToPdf: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
}));
vi.mock('../../services/docxFieldCatalog', () => ({
    resolveFields: () => ({ '001': 'CTS-001' }),
    describeMapping: () => 'Contrato › Número',
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: () => Promise.resolve(null) } }));
vi.mock('../../services/contractDocumentVersionService', () => ({
    contractDocumentVersionService: {
        addVersionFromBlob: (...a: unknown[]) => addVersionFromBlob(...a),
        listByOwner: () => Promise.resolve([]),
    },
}));

import EmitDocumentModal from '../../components/EmitDocumentModal';
import DocumentVersionsPanel from '../../components/contracts/DocumentVersionsPanel';
import { ConfirmProvider } from '../../components/ui/confirm';

const CONTRATO = { id: 'c-1', number: 'CTS-001', organization_id: 'org-1' } as never;
const RAIZ = path.resolve(__dirname, '../..');

const montar = (onClose = vi.fn(), notify = vi.fn()) => {
    render(
        <ConfirmProvider>
            <EmitDocumentModal organizationId="org-1" contract={CONTRATO} organization={null}
                onClose={onClose} notify={notify} persistVersion />
        </ConfirmProvider>,
    );
    return { onClose, notify };
};

describe('Gerar pelo modelo — versão sempre em PDF', () => {
    beforeEach(() => { addVersionFromBlob.mockReset(); saveAs.mockReset(); });

    it('"Baixar .docx para editar" só baixa: nenhuma versão, nenhum upload de .docx', async () => {
        const { onClose } = montar();
        fireEvent.click(await screen.findByRole('button', { name: /Baixar \.docx para editar/ }));
        await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1));
        expect(addVersionFromBlob).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('"Gerar versão (PDF)" grava UMA versão, em PDF, e baixa', async () => {
        addVersionFromBlob.mockResolvedValue({});
        const { onClose } = montar();
        fireEvent.click(await screen.findByRole('button', { name: /Gerar versão \(PDF\)/ }));
        await waitFor(() => expect(addVersionFromBlob).toHaveBeenCalledTimes(1));
        const arg = addVersionFromBlob.mock.calls[0][0] as { blob: Blob; fileName: string };
        expect(arg.blob.type).toBe('application/pdf');
        expect(arg.fileName).toMatch(/\.pdf$/);
        expect(saveAs).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalled();
    });

    it('falha ao gravar: painel continua aberto e mostra o erro', async () => {
        addVersionFromBlob.mockRejectedValue(new Error('mime type not supported'));
        const { onClose } = montar();
        fireEvent.click(await screen.findByRole('button', { name: /Gerar versão \(PDF\)/ }));
        expect(await screen.findByText(/NÃO foi salvo como versão: mime type not supported/)).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('Subir documento — só PDF', () => {
    it('recusa .docx com o motivo', async () => {
        const { container } = render(
            <ConfirmProvider>
                <DocumentVersionsPanel ownerType="CONTRACT" ownerId="c-1" contractId="c-1" label="Contrato CTS-001" onNotify={() => {}} />
            </ConfirmProvider>,
        );
        // a barra da tabela e o rodapé do Sheet têm "Subir documento" — o 1º é o da barra
        fireEvent.click((await screen.findAllByRole('button', { name: /Subir documento/ }))[0]);
        const input = await waitFor(() => {
            const el = document.querySelector('input[type="file"]') as HTMLInputElement | null;
            if (!el) throw new Error('sem input');
            return el;
        });
        expect(input.accept).toContain('.pdf');
        expect(input.accept).not.toContain('docx');
        const docx = new File(['x'], 'minuta.docx', { type: DOCX_MIME });
        fireEvent.change(input, { target: { files: [docx] } });
        expect(await screen.findByText(/"minuta\.docx" não é PDF/)).toBeTruthy();
        expect(container).toBeTruthy();
    });
});

describe('aba Emissão — nomes e PDF do sistema', () => {
    const fonte = fs.readFileSync(path.join(RAIZ, 'components/ContractDetailView.tsx'), 'utf8');
    it('o botão da aba se chama "Gerar pelo modelo"', () => {
        expect(fonte).toMatch(/\r?\n\s*Gerar pelo modelo\r?\n/);
        expect(fonte).not.toMatch(/\r?\n\s*Emitir Contrato \(\.docx\)\r?\n/);
    });
    it('PDF do sistema grava versão de origem SISTEMA', () => {
        const corpo = fonte.slice(fonte.indexOf('const handleDownloadPDF'), fonte.indexOf('const handleSyncFinance'));
        expect(corpo).toMatch(/addVersionFromBlob/);
        expect(corpo).toMatch(/source: 'SISTEMA'/);
    });
});
