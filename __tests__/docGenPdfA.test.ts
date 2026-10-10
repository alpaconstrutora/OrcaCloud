import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { montarDocDefinition } from '../services/docGen/motorRender';
import { comMetadadosFixos, PERFIL_PDFA } from '../services/docGen/pdf';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/**
 * PDF/A-2b em todo PDF do motor (pedido de 10/10). A conformidade foi conferida
 * com o veraPDF 1.30 (PASS no 2b; o PDF anterior à mudança dá FAIL) — o veraPDF
 * não roda no CI, então aqui se trava o que o torna PDF/A: versão 1.7,
 * identificação pdfaid parte 2 / conformidade B no XMP, perfil de cor sRGB
 * (OutputIntent), idioma — e que o PDF continua determinístico (o hash do GED).
 */
const require = createRequire(import.meta.url);
interface PdfMakeNode {
    virtualfs: { writeFileSync(nome: string, conteudo: string, encoding: string): void };
    addFonts(f: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy(cb: (u: string) => boolean): void;
    setLocalAccessPolicy(cb: (p: string) => boolean): void;
    createPdf(def: unknown): { getBuffer(): Promise<Buffer> };
}
let pm: PdfMakeNode | null = null;
function pdfmake(): PdfMakeNode {
    if (!pm) {
        pm = require('pdfmake') as PdfMakeNode;
        const vfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
        for (const [n, b] of Object.entries(vfs)) pm.virtualfs.writeFileSync(n, b, 'base64');
        pm.addFonts({ Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } });
        pm.setUrlAccessPolicy(() => false);
        pm.setLocalAccessPolicy(() => false);
    }
    return pm;
}

const DOC: DocTipTap = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ofício de teste.' }] }, { type: 'assinaturas' }] };

describe('docGen · PDF/A-2b', () => {
    it('versão, identificação PDF/A, perfil de cor e idioma; e os mesmos bytes a cada geração', async () => {
        expect(PERFIL_PDFA).toBe('PDF/A-2b');
        // O pdfmake MUDA o docDefinition que recebe — cada geração monta o seu, como o app faz.
        const def = () => comMetadadosFixos(
            montarDocDefinition({ conteudo: DOC, layout: LAYOUT_PADRAO, valores: {}, assinaturas: [{ nome: 'Ana' }], validacao: { url: 'https://x/publico/validar-documento/1' } }),
            { id: 'doc-1', criadoEm: new Date(Date.UTC(2026, 9, 10, 12)) },
        );
        const a = await pdfmake().createPdf(def()).getBuffer();
        const b = await pdfmake().createPdf(def()).getBuffer();
        const texto = a.toString('latin1');
        expect(texto.startsWith('%PDF-1.7')).toBe(true);
        expect(texto).toContain('<pdfaid:part>2</pdfaid:part>');
        expect(texto).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
        expect(texto).toContain('/OutputIntents');
        expect(texto).toContain('/Lang (pt-BR)');
        expect(Buffer.compare(a, b)).toBe(0);
    });
});
