import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { montarDocDefinition } from '../services/docGen/motorRender';
import { comMetadadosFixos } from '../services/docGen/pdf';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/**
 * No navegador o PDF sai de `pdfmake/build/pdfmake` (`gerarPdfBlob`). Aqui, em
 * node, usamos o printer do pdfmake (`pdfmake` → js/index.js) com as MESMAS
 * fontes do vfs embutido — é o mesmo núcleo (pdfkit), então o que se prova
 * sobre bytes vale para os dois: mesmo docDefinition + `creationDate` fixa =
 * mesmos bytes. É o que permite ao GED guardar o hash e reconhecer o arquivo.
 */
const require = createRequire(import.meta.url);

interface PdfMakeNode {
    virtualfs: { writeFileSync(nome: string, conteudo: string, encoding: string): void };
    addFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    createPdf(def: unknown): { getBuffer(): Promise<Buffer> };
}

let instancia: PdfMakeNode | null = null;
function pdfmakeNode(): PdfMakeNode {
    if (!instancia) {
        // pdfmake 0.3 em node exporta uma INSTÂNCIA (js/index.js: `module.exports = new pdfmake()`)
        // com um `virtualfs` próprio. As fontes entram nele decodificadas do MESMO vfs_fonts que
        // o navegador usa (`gerarPdfBlob`), para o PDF ser idêntico nos dois lados.
        instancia = require('pdfmake') as PdfMakeNode;
        const vfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
        for (const [nome, b64] of Object.entries(vfs)) instancia.virtualfs.writeFileSync(nome, b64, 'base64');
        instancia.addFonts({
            Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
        });
        // Nada de rede nem de disco no teste.
        instancia.setUrlAccessPolicy(() => false);
        instancia.setLocalAccessPolicy(() => false);
    }
    return instancia;
}

async function gerarBuffer(def: ReturnType<typeof comMetadadosFixos>): Promise<Buffer> {
    return pdfmakeNode().createPdf(def).getBuffer();
}

const MODELO: DocTipTap = {
    type: 'doc',
    content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'OFÍCIO Nº ' }, { type: 'variavel', attrs: { chave: 'documento.numero' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Prezados Senhores, ' }, { type: 'text', text: 'negrito', marks: [{ type: 'bold' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
        { type: 'assinaturas' },
        { type: 'anexos' },
    ],
};

describe('docGen · PDF determinístico (pdfmake)', () => {
    it('o mesmo docDefinition com creationDate fixa gera os mesmos bytes, com texto real e paginação', async () => {
        const entrada = {
            conteudo: MODELO, layout: LAYOUT_PADRAO,
            valores: { 'documento.numero': 'OF-ENG-047/2026', 'empresa.razao_social': 'Construtora Exemplo' },
            assinaturas: [{ nome: 'João da Silva', cargo: 'Diretor' }],
            anexos: ['Memorial'],
        };
        const opts = { id: 'doc-1', criadoEm: new Date('2026-10-07T12:00:00Z') };
        const a = await gerarBuffer(comMetadadosFixos(montarDocDefinition(entrada), opts));
        const b = await gerarBuffer(comMetadadosFixos(montarDocDefinition(entrada), opts));
        expect(a.length).toBeGreaterThan(5000);
        expect(a.equals(b)).toBe(true);
        const texto = a.toString('latin1');
        expect(texto.startsWith('%PDF-')).toBe(true);
        // Strings do /Info saem em UTF-16 hex no PDFKit — conferimos as chaves, não os valores.
        expect(texto).toContain('/Subject');
        expect(texto).toContain('/CreationDate');
        expect(texto).toContain('/Type /Page');
    }, 30000);

    it('mudar a data de criação muda o arquivo (prova que a data é o que fixa o ID)', async () => {
        const entrada = { conteudo: MODELO, layout: LAYOUT_PADRAO, valores: { 'documento.numero': '1' } };
        const a = await gerarBuffer(comMetadadosFixos(montarDocDefinition(entrada), { id: 'x', criadoEm: new Date('2026-10-07T12:00:00Z') }));
        const b = await gerarBuffer(comMetadadosFixos(montarDocDefinition(entrada), { id: 'x', criadoEm: new Date('2026-10-08T12:00:00Z') }));
        expect(a.equals(b)).toBe(false);
    }, 30000);
});
