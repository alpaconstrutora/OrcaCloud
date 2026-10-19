// @vitest-environment jsdom
/**
 * Modelos de documento › mapeamento do marcador em GAVETA com grupos e busca (19/10/2026).
 *
 * Pedido: "o dropdown de cada campo … esta muito longo. minha sugestão e abrir uma gaveta com
 * separacao por grupo e campo de busca." Eram 277 opções num `<select>`, sem busca, e fechado
 * ele mostrava só "Número" — do contrato ou do endereço?
 *
 * O que este teste trava:
 *  1. não existe mais `<select>` de campo no mapeamento;
 *  2. o gatilho mostra "Grupo ›" antes do campo;
 *  3. a gaveta abre com o título do marcador, busca por campo e escolher grava
 *     `{ source, field, label }` (formato de sempre — `token_map` antigo segue valendo);
 *  4. a busca também acha pelo nome do GRUPO;
 *  5. "Texto fixo" continua abrindo o campo de texto.
 *
 * Plano: docs/planos/2026-10-19-modelos-mapeamento-gaveta.md
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const update = vi.fn();

vi.mock('../../lib/supabase', () => ({
    supabase: { auth: { getUser: () => Promise.resolve({ data: { user: null } }) } },
}));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org-1' }) }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/docxRenderService', () => ({ detectTokens: () => Promise.resolve([]) }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve([MODELO]),
        create: vi.fn(),
        update: (...a: unknown[]) => update(...a),
        deactivate: vi.fn(),
    },
}));

import DocxTemplateManager from '../../components/DocxTemplateManager';
import { ConfirmProvider } from '../../components/ui/confirm';

const MODELO = {
    id: 'tpl-1', organization_id: 'org-1', name: 'Contrato', description: '', file_path: 'x.docx', file_name: 'x.docx',
    detected_tokens: ['001', '002'],
    token_map: { '001': { source: 'contract', field: 'number', label: 'Número' } },
    is_active: true, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
};

const abrirModelo = async () => {
    render(<ConfirmProvider><DocxTemplateManager organizationId="org-1" onClose={() => {}} /></ConfirmProvider>);
    fireEvent.click(await screen.findByText('Contrato'));
    await screen.findByText(/Mapeamento dos marcadores/);
};
const linhaDo = (tk: string) => screen.getByText(`{${tk}}`).closest('div.grid') as HTMLElement;

describe('mapeamento do marcador em gaveta', () => {
    beforeEach(() => {
        update.mockReset();
        update.mockImplementation((_id, _org, p) => Promise.resolve({ ...MODELO, ...p }));
    });

    it('sem <select> de campo; o gatilho diz o GRUPO do campo', async () => {
        await abrirModelo();
        expect(linhaDo('001').querySelector('select')).toBeNull();
        // "Número" sozinho era ambíguo — fechado agora mostra "Contrato de Serviço ›".
        expect(within(linhaDo('001')).getByText(/Contrato de Serviço ›/)).toBeTruthy();
        expect(within(linhaDo('001')).getByText('Número')).toBeTruthy();
        expect(within(linhaDo('002')).getByText('— não mapeado —')).toBeTruthy();
    });

    it('busca o campo na gaveta e grava { source, field, label }', async () => {
        await abrirModelo();
        fireEvent.click(within(linhaDo('002')).getByRole('button'));
        expect(await screen.findByText('Campo do marcador {002}')).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText(/Buscar campo ou grupo/), { target: { value: 'CPF do cônjuge' } });
        // Mais de um grupo tem "CPF do cônjuge" (Cliente, Fiador) — na busca, cada linha leva o
        // grupo ao lado, e é por ele que se escolhe.
        await waitFor(() => expect(screen.getAllByText('CPF do cônjuge').length).toBeGreaterThan(1));
        const doCliente = screen.getAllByText('CPF do cônjuge')
            .map(el => el.closest('button')!)
            .find(b => /^Cliente/.test(b.textContent ?? ''))!;
        fireEvent.mouseDown(doCliente);

        await waitFor(() => expect(within(linhaDo('002')).getByText('CPF do cônjuge')).toBeTruthy());
        expect(within(linhaDo('002')).getByText(/Cliente ›/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Salvar modelo/ }));
        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update.mock.calls[0][2].token_map['002']).toEqual({ source: 'client', field: 'spouse_document', label: 'CPF do cônjuge' });
        expect(update.mock.calls[0][2].token_map['001']).toEqual(MODELO.token_map['001']);   // o resto intacto
    });

    it('a busca acha pelo nome do grupo (ex.: "fiador")', async () => {
        await abrirModelo();
        fireEvent.click(within(linhaDo('002')).getByRole('button'));
        fireEvent.change(await screen.findByPlaceholderText(/Buscar campo ou grupo/), { target: { value: 'fiador' } });
        // todos os campos do grupo "Fiador / Garantidor" aparecem, com o grupo ao lado
        await waitFor(() => expect(screen.getAllByText(/Fiador \/ Garantidor/).length).toBeGreaterThan(5));
    });

    it('"Texto fixo" continua abrindo o campo de texto', async () => {
        await abrirModelo();
        fireEvent.click(within(linhaDo('002')).getByRole('button'));
        fireEvent.mouseDown((await screen.findByText(/Texto fixo \(digitar o valor\)/)).closest('button')!);
        expect(await screen.findByPlaceholderText('Texto que substituirá o marcador')).toBeTruthy();
    });
});
