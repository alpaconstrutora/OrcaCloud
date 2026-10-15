/**
 * Parser de boletos no NAVEGADOR: pdf.js lê o texto do PDF e
 * `boletoTexto.extractFromPdfText` faz o resto.
 *
 * Desde 15/10/2026 as regras (linha digitável, CNPJ, beneficiário, multa/juros)
 * moram em `utils/boletoTexto.ts`, que não depende de pdf.js nem de DOM — a
 * captura por e-mail roda a mesma leitura numa Edge Function. Este arquivo
 * re-exporta as funções puras para os call-sites antigos continuarem iguais.
 *
 * OCR de imagens fica fora do MVP — imagens caem no fluxo manual.
 */

import { extractFromPdfText } from './boletoTexto.ts';
import type { BoletoExtractionResult } from '../types/boletos.ts';

export {
    ENGINE_VERSAO,
    findLinhaDigitavelInText,
    extractMultaJurosFromText,
    buildExtractionFromLinhaDigitavel,
    findBeneficiarioCnpj,
    extractFromPdfText,
} from './boletoTexto.ts';

/**
 * Calcula SHA-256 de um File no browser, retornando hex.
 */
export async function sha256File(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Extrai texto de um PDF usando pdf.js. Import dinâmico para não impactar bundle inicial.
 * Retorna o texto concatenado de todas as páginas e o número de páginas.
 */
export async function extractTextFromPdf(file: File): Promise<{ text: string; paginas: number }> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return { text: '', paginas: 0 };
    }

    // Import dinâmico — pdfjs-dist é carregado sob demanda
    const pdfjs: any = await import('pdfjs-dist');

    // Worker local resolvido pelo Vite — evita violação de CSP com CDN externo
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
    }

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const paginas = doc.numPages;
    let text = '';

    for (let i = 1; i <= paginas; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(' ') + '\n';
    }

    return { text, paginas };
}

/**
 * Extrai os dados de um boleto em PDF (navegador): texto via pdf.js + regras
 * de `boletoTexto`. Imagens devolvem texto vazio e caem no fluxo manual.
 */
export async function extractFromPdfFile(file: File, referenceDate = new Date()): Promise<BoletoExtractionResult> {
    const { text, paginas } = await extractTextFromPdf(file);
    return extractFromPdfText(text, paginas, referenceDate);
}
