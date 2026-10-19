// @vitest-environment jsdom
/**
 * Gaveta "Gerar pelo modelo" / "Emitir documento" — no design padrão do app (19/10/2026).
 *
 * Defeito: o app NÃO tem tema escuro, mas a gaveta tinha 10 classes `dark:`. No Tailwind v4 sem
 * `@custom-variant dark`, `dark:` segue o modo escuro do SISTEMA — e quem usa o Windows escuro via o
 * valor de cada campo em BRANCO sobre a gaveta branca (invisível), o aviso rosado com texto amarelo e
 * o título apagado. Reproduzido no Chrome com `colorScheme: 'dark'` (`rgb(255,255,255)` no valor).
 *
 * O que este teste trava:
 *  1. nenhuma classe `dark:` no código nem no DOM renderizado;
 *  2. a pré-visualização é uma TABELA (§6.9) com Marcador · Campo do sistema · Valor, sem `font-mono`
 *     (§7) e com o "(vazio…)" legível (não `red-400`);
 *  3. "Baixar" e "Gerar" desligados DIZEM o motivo (title no wrapper);
 *  4. sem modelo cadastrado: estado vazio padrão (§12) — título + frase.
 *
 * Plano: docs/planos/2026-10-19-gerar-pelo-modelo-padrao.md
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let modelos: unknown[] = [];

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('../../services/documentTemplateService', () => ({
    documentTemplateService: {
        list: () => Promise.resolve(modelos),
        downloadFile: () => Promise.resolve(new Blob(['x'])),
    },
}));
vi.mock('../../services/docxRenderService', () => ({
    fillDocx: () => Promise.resolve(new Blob(['x'])),
    docxBlobToPdf: () => Promise.resolve(new Blob(['%PDF'])),
}));
vi.mock('../../services/docxFieldCatalog', () => ({
    // {001} resolve; {002} não tem mapeamento → "(vazio…)" e o aviso de marcador sem mapeamento
    resolveFields: () => ({ '001': 'Alpa Construtora' }),
    describeMapping: (m?: unknown) => (m ? 'Minha Organização › Nome' : '— sem mapeamento —'),
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/organizationService', () => ({ organizationService: { listOrganizations: () => Promise.resolve([]) } }));
vi.mock('../../services/projectService', () => ({ projectService: { loadProject: () => Promise.resolve(null) } }));
vi.mock('../../services/contractDocumentVersionService', () => ({
    contractDocumentVersionService: { addVersionFromBlob: vi.fn(), listByOwner: () => Promise.resolve([]) },
}));

import EmitDocumentModal from '../../components/EmitDocumentModal';
import { ConfirmProvider } from '../../components/ui/confirm';

const CONTRATO = { id: 'c-1', number: 'CTS-001', organization_id: 'org-1' } as never;
const RAIZ = path.resolve(__dirname, '../..');
const modelo = (id: string, name: string) => ({
    id, name, file_path: `${id}.docx`, detected_tokens: ['001', '002'], token_map: { '001': { source: 'organization', field: 'name' } },
});

const montar = () => render(
    <ConfirmProvider>
        <EmitDocumentModal organizationId="org-1" contract={CONTRATO} organization={null} onClose={() => {}} persistVersion />
    </ConfirmProvider>,
);

describe('Gerar pelo modelo — design padrão', () => {
    beforeEach(() => { modelos = [modelo('t1', 'Contrato A'), modelo('t2', 'Contrato B')]; });

    it('não tem NENHUMA classe dark: (o app só tem tema claro) — nem no código, nem no DOM', async () => {
        const fonte = fs.readFileSync(path.join(RAIZ, 'components', 'EmitDocumentModal.tsx'), 'utf8');
        expect(fonte).not.toMatch(/\bdark:/);
        montar();
        fireEvent.change(await screen.findByLabelText(/Modelo/), { target: { value: 't1' } });
        await screen.findByText(/Pré-visualização/);
        expect(document.body.innerHTML).not.toMatch(/\bdark:/);
    });

    it('sem modelo escolhido: os dois botões desligados DIZEM o motivo', async () => {
        montar();
        const gerar = await screen.findByRole('button', { name: /Gerar versão \(PDF\)/ });
        const baixar = screen.getByRole('button', { name: /Baixar \.docx/ });
        expect(gerar).toBeDisabled();
        expect(baixar).toBeDisabled();
        expect(gerar.parentElement?.getAttribute('title')).toMatch(/Escolha um modelo/);
        expect(baixar.parentElement?.getAttribute('title')).toMatch(/Escolha um modelo/);
    });

    it('com modelo: pré-visualização em tabela, valor legível e vazio sem cinza-claro', async () => {
        montar();
        fireEvent.change(await screen.findByLabelText(/Modelo/), { target: { value: 't1' } });
        const tabela = await screen.findByRole('table');
        const cab = within(tabela).getAllByRole('columnheader').map(c => c.textContent);
        expect(cab).toEqual(['Marcador', 'Campo do sistema', 'Valor']);
        const linhas = within(tabela).getAllByRole('row').slice(1);
        expect(linhas).toHaveLength(2);
        expect(linhas[0].textContent).toContain('{001}');
        expect(linhas[0].textContent).toContain('Alpa Construtora');
        expect(linhas[1].textContent).toContain('(vazio');
        // §7: sem font-mono em <td>; §32: valor/“vazio” nunca em cinza-claro ou vermelho-claro
        expect(tabela.innerHTML).not.toMatch(/font-mono/);
        expect(tabela.innerHTML).not.toMatch(/text-(gray|red)-(300|400)/);
        // com modelo escolhido os botões liberam
        expect(screen.getByRole('button', { name: /Gerar versão \(PDF\)/ })).toBeEnabled();
    });

    it('sem modelo cadastrado: estado vazio padrão com título e frase', async () => {
        modelos = [];
        montar();
        expect(await screen.findByRole('heading', { name: 'Nenhum modelo de documento cadastrado' })).toBeTruthy();
        await waitFor(() => expect(screen.getByText(/Suba um \.docx/)).toBeTruthy());
    });
});
