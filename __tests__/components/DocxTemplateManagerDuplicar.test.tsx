// @vitest-environment jsdom
/**
 * Modelos de documento › Duplicar (19/10/2026).
 *
 * Pedido: a revisão de um documento não pode exigir mapear o .docx inteiro de novo —
 * "botao duplicar e remapear em um novo documento. reaproveitando."
 *
 * O que este teste trava:
 *  1. ⋮ › Duplicar abre a CRIAÇÃO já preenchida: "<nome> (cópia)", descrição,
 *     marcadores e mapeamento do original;
 *  2. salvar sem enviar arquivo novo cria um modelo a partir do arquivo do original
 *     (`{ fromPath }`), na organização DO ORIGINAL — e nunca chama `update`;
 *  3. enviar a versão revisada mantém o mapeamento dos marcadores que continuam,
 *     marca os novos ("Novo") e lista os que saíram.
 *
 * Plano: docs/planos/2026-10-19-modelos-documento-duplicar.md
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const create = vi.fn();
const update = vi.fn();
let tokensDoArquivo: string[] = [];

vi.mock('../../lib/supabase', () => ({
    supabase: { auth: { getUser: () => Promise.resolve({ data: { user: null } }) } },
}));
vi.mock('../../hooks/useOrgContext', () => ({ useOrgContext: () => ({ orgId: 'org-topo' }) }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/docxRenderService', () => ({ detectTokens: () => Promise.resolve(tokensDoArquivo) }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve([ORIGINAL]),
        create: (...a: unknown[]) => create(...a),
        update: (...a: unknown[]) => update(...a),
        deactivate: vi.fn(),
    },
}));

import DocxTemplateManager from '../../components/DocxTemplateManager';
import { ConfirmProvider } from '../../components/ui/confirm';

const MAPA = {
    '001': { source: 'organization', field: 'name', label: 'Nome' },
    '002': { source: 'client', field: 'name', label: 'Nome' },
    '003': { source: 'fixed', fixed: 'Foro de Cuiabá' },
};
const ORIGINAL = {
    id: 'tpl-1',
    organization_id: 'org-do-modelo',
    name: 'Contrato de empreitada',
    description: 'Rev. 3',
    file_path: 'org-do-modelo/111_contrato.docx',
    file_name: 'contrato.docx',
    detected_tokens: ['001', '002', '003'],
    token_map: MAPA,
    is_active: true,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
};

const montar = () => render(
    <ConfirmProvider>
        <DocxTemplateManager organizationId="org-tela" onClose={() => {}} />
    </ConfirmProvider>,
);

const duplicar = async () => {
    const linha = (await screen.findByText('Contrato de empreitada')).closest('tr')!;
    // o gatilho do ⋮ é o único botão da célula de ações
    fireEvent.click(within(linha).getAllByRole('button').at(-1)!);
    fireEvent.click(await screen.findByRole('button', { name: /Duplicar/ }));
};

describe('Modelos de documento › Duplicar', () => {
    beforeEach(() => {
        create.mockReset();
        update.mockReset();
        create.mockImplementation((_org, _src, p) => Promise.resolve({ ...ORIGINAL, ...p, id: 'tpl-2' }));
    });

    it('abre a criação já preenchida com o nome "(cópia)" e o mapeamento do original', async () => {
        montar();
        await duplicar();

        expect(screen.getByDisplayValue('Contrato de empreitada (cópia)')).toBeTruthy();
        expect(screen.getByDisplayValue('Rev. 3')).toBeTruthy();
        expect(screen.getByText(/Cópia de “Contrato de empreitada”/)).toBeTruthy();
        expect(screen.getByText('3/3 mapeados')).toBeTruthy();
        expect(screen.getByDisplayValue('Foro de Cuiabá')).toBeTruthy();   // texto fixo veio junto
        expect(screen.getByText(/Arquivo do modelo de origem:/)).toBeTruthy();
        expect(screen.getByText('Enviar versão revisada (.docx)')).toBeTruthy();
        // o Salvar já pode: o arquivo do original serve
        expect((screen.getByRole('button', { name: /Salvar modelo/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('salvar sem arquivo novo cria a partir do arquivo do original, na org DO ORIGINAL', async () => {
        montar();
        await duplicar();
        fireEvent.click(screen.getByRole('button', { name: /Salvar modelo/ }));

        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        const [org, origem, payload] = create.mock.calls[0];
        expect(org).toBe('org-do-modelo');
        expect(origem).toEqual({ fromPath: 'org-do-modelo/111_contrato.docx', fileName: 'contrato.docx' });
        expect(payload).toMatchObject({
            name: 'Contrato de empreitada (cópia)',
            detected_tokens: ['001', '002', '003'],
            token_map: MAPA,
        });
        expect(update).not.toHaveBeenCalled();
        // criar fecha o formulário (§25) e a lista ganha a linha nova (§22)
        expect(await screen.findByText('Contrato de empreitada (cópia)')).toBeTruthy();
    });

    it('versão revisada: mantém o mapeamento do que continuou, marca o novo e lista o que saiu', async () => {
        tokensDoArquivo = ['001', '002', '004'];       // {003} saiu, {004} entrou
        montar();
        await duplicar();

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const revisado = new File(['x'], 'contrato-rev4.docx');
        fireEvent.change(input, { target: { files: [revisado] } });

        expect(await screen.findByText(/Comparado ao arquivo anterior/)).toBeTruthy();
        expect(screen.getByText('2/3 mapeados')).toBeTruthy();
        expect(screen.getByText(/Saíram do documento/).textContent).toContain('{003}');
        const novos = screen.getAllByText('Novo');
        expect(novos).toHaveLength(1);
        expect(novos[0].closest('div')!.textContent).toContain('{004}');

        fireEvent.click(screen.getByRole('button', { name: /Salvar modelo/ }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        const [, origem, payload] = create.mock.calls[0];
        expect(origem).toBe(revisado);                 // o arquivo novo, não o do original
        expect(payload.detected_tokens).toEqual(['001', '002', '004']);
        expect(payload.token_map).toEqual({ '001': MAPA['001'], '002': MAPA['002'] });
    });
});
