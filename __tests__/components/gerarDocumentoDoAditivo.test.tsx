// @vitest-environment jsdom
/**
 * Gerar o documento DO ADITIVO pelo modelo (plano
 * docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md, item 3b — decisão
 * do usuário: "incluir"). Caso real: AD-004 do CTL-006-012-0001.
 *
 *  - com `addendum`: a versão é do aditivo (ADDENDUM/ADITIVO, ownerId do aditivo),
 *    o nome diz qual aditivo e o aditivo entra no contexto dos campos;
 *  - sem `addendum`: nada muda (CONTRACT/MINUTA);
 *  - catálogo: os campos `addendum.*` resolvem com os dados do AD-004.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const addVersionFromBlob = vi.fn();
const saveAs = vi.fn();
const contextos: unknown[] = [];

vi.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => saveAs(...a) }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve([{ id: 't1', name: 'Aditivo de prorrogação', file_path: 'x.docx', detected_tokens: ['001'], token_map: { '001': { source: 'addendum', field: 'number' } } }]),
        downloadFile: () => Promise.resolve(new Blob(['modelo'], { type: DOCX_MIME })),
    },
}));
vi.mock('../../services/docxRenderService', () => ({
    fillDocx: () => Promise.resolve(new Blob(['preenchido'], { type: DOCX_MIME })),
    docxBlobToPdf: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
}));
vi.mock('../../services/docxFieldCatalog', async (original) => {
    const real = await original<typeof import('../../services/docxFieldCatalog')>();
    return {
        ...real,
        resolveFields: (map: never, ctx: unknown) => { contextos.push(ctx); return real.resolveFields(map, ctx as never); },
    };
});
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: () => Promise.resolve(null) } }));
vi.mock('../../services/contractDocumentVersionService', () => ({
    contractDocumentVersionService: { addVersionFromBlob: (...a: unknown[]) => addVersionFromBlob(...a), listByOwner: () => Promise.resolve([]) },
}));

import EmitDocumentModal from '../../components/EmitDocumentModal';
import { resolveFields } from '../../services/docxFieldCatalog';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { ContractAddendum } from '../../types';

const CONTRATO = { id: 'c1', number: 'CTL-006-012-0001', organization_id: 'org-1', nature: 'Locação', contract_type: 'Contrato Recorrente' } as never;
const AD4 = {
    id: 'ad4', contract_id: 'c1', organization_id: 'org-1', number: 'AD-004', type: 'Prazo', status: 'Aprovado', value_impact: 0,
    description: 'Prorrogação de vigência até 2021-09-22', new_start_date: '2020-03-23', new_end_date: '2021-09-22',
    previous_end_date: '2020-03-22', new_value: 5832.48, previous_value: 5832.48, reajuste_index: 'IGP-M', approved_at: '2026-11-25T19:28:00Z',
} as ContractAddendum;

const gerar = async (addendum?: ContractAddendum) => {
    render(
        <ConfirmProvider>
            <EmitDocumentModal organizationId="org-1" contract={CONTRATO} addendum={addendum} organization={null}
                onClose={vi.fn()} notify={vi.fn()} persistVersion lockClient />
        </ConfirmProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Gerar versão \(PDF\)/ }));
    await waitFor(() => expect(addVersionFromBlob).toHaveBeenCalledTimes(1));
    return addVersionFromBlob.mock.calls[0][0] as Record<string, unknown>;
};

beforeEach(() => { addVersionFromBlob.mockReset(); addVersionFromBlob.mockResolvedValue({}); saveAs.mockReset(); contextos.length = 0; });

describe('Gerar pelo modelo — documento do aditivo', () => {
    it('com o AD-004: versão do aditivo, com nome próprio, e o aditivo no contexto dos campos', async () => {
        const arg = await gerar(AD4);
        expect(arg).toMatchObject({ ownerType: 'ADDENDUM', ownerId: 'ad4', contractId: 'c1', kind: 'ADITIVO', source: 'TEMPLATE_DOCX' });
        expect(arg.name).toBe('CTL-006-012-0001 - Aditivo AD-004 ao Contrato de Locação');
        expect(saveAs.mock.calls[0][1]).toBe('CTL-006-012-0001 - Aditivo AD-004 ao Contrato de Locação.pdf');
        expect(contextos.at(-1)).toMatchObject({ addendum: { id: 'ad4' } });
    });

    it('sem aditivo: nada muda (versão do contrato, minuta)', async () => {
        const arg = await gerar();
        expect(arg).toMatchObject({ ownerType: 'CONTRACT', ownerId: 'c1', kind: 'MINUTA' });
        expect(arg.name).toBe('CTL-006-012-0001 - Minuta do Contrato de Locação');
    });
});

describe('Catálogo de campos — grupo Aditivo com o AD-004', () => {
    it('vigência, valor e valor por extenso', () => {
        const map = {
            a: { source: 'addendum', field: 'number' }, b: { source: 'addendum', field: 'new_start_date' },
            c: { source: 'addendum', field: 'new_end_date' }, d: { source: 'addendum', field: 'previous_end_date' },
            e: { source: 'addendum', field: 'new_value' }, f: { source: 'addendum', field: 'new_value_ext' },
        };
        const r = resolveFields(map as never, { addendum: AD4 });
        expect(r.a).toBe('AD-004');
        expect(r.b).toBe('23/03/2020');
        expect(r.c).toBe('22/09/2021');
        expect(r.d).toBe('22/03/2020');
        expect(r.e).toMatch(/5\.832,48/);
        // Só o que importa aqui: o grupo Aditivo resolve. A gramática do extenso
        // ("cinco mil e oitocentos") é defeito anterior do valorPorExtenso, fora deste plano.
        expect(r.f.toLowerCase()).toMatch(/^cinco mil .*reais e quarenta e oito centavos$/);
    });
});
