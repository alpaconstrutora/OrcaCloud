import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { Packer } from 'docx';
import { tipoDoArquivoDeFonte } from '../services/docGenFonteService';
import { comMetadadosFixos, familiaDaFonte } from '../services/docGen/pdf';
import { montarDocDefinition } from '../services/docGen/motorRender';
import { montarDocx } from '../services/docGen/motorDocx';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/**
 * Fonte livre nos modelos (F9). Usa a Liberation Sans (licença SIL OFL) que já
 * vem no pdfjs-dist — nada de fonte proprietária no teste.
 */
const require = createRequire(import.meta.url);
const pasta = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts');
const ttf = (n: string) => readFileSync(path.join(pasta, n));
const FONTE_ID = '9b6e1c2a-0000-4000-8000-00000000f0f0';
const DOC: DocTipTap = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto em ' }, { type: 'text', text: 'negrito', marks: [{ type: 'bold' }] }] }] };

describe('docGen · fontes da organização', () => {
    it('reconhece TrueType/OpenType pelos bytes, não pela extensão', () => {
        expect(tipoDoArquivoDeFonte(new Uint8Array(ttf('LiberationSans-Regular.ttf').subarray(0, 4)))).toBe('ttf');
        expect(tipoDoArquivoDeFonte(new TextEncoder().encode('OTTO'))).toBe('otf');
        expect(tipoDoArquivoDeFonte(new TextEncoder().encode('wOF2'))).toBeNull();      // WOFF2 não serve ao PDF
        expect(tipoDoArquivoDeFonte(new TextEncoder().encode('%PDF'))).toBeNull();
    });

    it('variação ausente usa a Regular; negrito-itálico cai no negrito antes do itálico', () => {
        expect(familiaDaFonte({ normal: 'r' })).toEqual({ normal: 'r', bold: 'r', italics: 'r', bolditalics: 'r' });
        expect(familiaDaFonte({ normal: 'r', bold: 'b', italics: 'i' })).toEqual({ normal: 'r', bold: 'b', italics: 'i', bolditalics: 'b' });
    });

    it('o PDF embute a fonte da organização, continua PDF/A e determinístico', async () => {
        const pm = require('pdfmake');
        pm.virtualfs.writeFileSync(`${FONTE_ID}-normal.ttf`, ttf('LiberationSans-Regular.ttf'));
        pm.virtualfs.writeFileSync(`${FONTE_ID}-bold.ttf`, ttf('LiberationSans-Bold.ttf'));
        pm.addFonts({ [FONTE_ID]: familiaDaFonte({ normal: `${FONTE_ID}-normal.ttf`, bold: `${FONTE_ID}-bold.ttf` }) });
        pm.setUrlAccessPolicy(() => false);
        pm.setLocalAccessPolicy(() => false);
        const def = () => comMetadadosFixos(
            montarDocDefinition({ conteudo: DOC, layout: { ...LAYOUT_PADRAO, fonte: FONTE_ID, fonteNome: 'Liberation Sans', cabecalho: { ...LAYOUT_PADRAO.cabecalho, mostrar: false }, rodape: { ...LAYOUT_PADRAO.rodape, mostrar: false } }, valores: {} }),
            { id: 'f9', criadoEm: new Date(Date.UTC(2026, 9, 10, 12)) },
        );
        const a: Buffer = await pm.createPdf(def()).getBuffer();
        const b: Buffer = await pm.createPdf(def()).getBuffer();
        const texto = a.toString('latin1');
        expect(texto).toMatch(/\/BaseFont \/[A-Z]{6}\+LiberationSans\b/);
        expect(texto).toMatch(/\/BaseFont \/[A-Z]{6}\+LiberationSans-Bold\b/);
        expect(texto).not.toMatch(/Roboto/);
        expect(texto).toContain('<pdfaid:part>2</pdfaid:part>');
        expect(Buffer.compare(a, b)).toBe(0);
        if (process.env.PDF_FONTE_SAIDA) writeFileSync(process.env.PDF_FONTE_SAIDA, a);
    });

    it('no Word vai o NOME da família (o id só serve ao PDF)', async () => {
        const docx = await Packer.toBuffer(montarDocx({ conteudo: DOC, layout: { ...LAYOUT_PADRAO, fonte: FONTE_ID, fonteNome: 'Liberation Sans' }, valores: {} }));
        const estilos = new PizZip(docx).file('word/styles.xml')!.asText();
        expect(estilos).toContain('w:ascii="Liberation Sans"');
        expect(estilos).not.toContain(FONTE_ID);
    });
});
