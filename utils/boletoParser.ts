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

import { extractFromPdfText, ehErroDeSenha, resultadoPdfComSenha, ERRO_SEM_LINHA, ERRO_SEM_TEXTO } from './boletoTexto.ts';
import { lerCodigoDeBarras } from './codigoBarrasI25.ts';
import { linhaDoCodigoDeBarras } from './febrabanRules.ts';
import type { BoletoExtractionResult } from '../types/boletos.ts';

export {
    ENGINE_VERSAO,
    findLinhaDigitavelInText,
    extractMultaJurosFromText,
    buildExtractionFromLinhaDigitavel,
    findBeneficiarioCnpj,
    extractFromPdfText,
    ehErroDeSenha,
    resultadoPdfComSenha,
    ERRO_PDF_COM_SENHA,
    AVISO_LINHA_DO_CODIGO_DE_BARRAS,
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

/** pdf.js sob demanda (não pesa no bundle inicial), com o worker local do Vite —
 *  evita violação de CSP com CDN externo. */
async function carregarPdfjs(): Promise<any> {
    const pdfjs: any = await import('pdfjs-dist');
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
    }
    return pdfjs;
}

export type LeituraDoCodigoDeBarras =
    | { linha: string; codigoBarras: string }
    | { linha: null; motivo: 'nenhum_codigo' | 'mais_de_um_codigo' };

/** Escala da renderização: ~216 dpi. Na amostra real (18/10/2026) as escalas 2 a 4
 *  leram igual; 3 deixa folga para boleto com barra estreita de 1 px na imagem. */
const ESCALA_CODIGO_DE_BARRAS = 3;

/**
 * Lê o código de barras DESENHADO no PDF (renderiza as primeiras páginas e
 * decodifica as barras — `codigoBarrasI25`). Para PDF que não imprime a linha
 * digitável (reaviso de concessionária) ou que é só imagem. Devolve a linha
 * digitável (47/48) já com o DV conferido, ou o motivo de não ter lido.
 */
export async function lerCodigoDeBarrasDoPdf(dados: ArrayBuffer, maxPaginas = 2): Promise<LeituraDoCodigoDeBarras> {
    const pdfjs = await carregarPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;
    let motivo: 'nenhum_codigo' | 'mais_de_um_codigo' = 'nenhum_codigo';
    try {
        for (let i = 1; i <= Math.min(doc.numPages, maxPaginas); i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: ESCALA_CODIGO_DE_BARRAS });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) break;
            // Fundo BRANCO: área transparente vira preto nos pixels e engole a
            // primeira barra de código embutido como imagem (visto na amostra real).
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            const r = lerCodigoDeBarras(ctx.getImageData(0, 0, canvas.width, canvas.height));
            canvas.width = canvas.height = 0;
            if (r.codigo) return { linha: linhaDoCodigoDeBarras(r.codigo), codigoBarras: r.codigo };
            if (r.motivo === 'mais_de_um_codigo') motivo = 'mais_de_um_codigo';
        }
    } finally {
        await doc.destroy?.();
    }
    return { linha: null, motivo };
}

/**
 * Extrai texto de um PDF usando pdf.js. Import dinâmico para não impactar bundle inicial.
 * Retorna o texto concatenado de todas as páginas e o número de páginas.
 */
export async function extractTextFromPdf(file: File): Promise<{ text: string; paginas: number }> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return { text: '', paginas: 0 };
    }

    const pdfjs = await carregarPdfjs();
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
    let lido: { text: string; paginas: number };
    try {
        lido = await extractTextFromPdf(file);
    } catch (e) {
        // PDF com senha: aviso próprio, em vez de "falha na extração" genérica.
        if (ehErroDeSenha(e)) return resultadoPdfComSenha();
        throw e;
    }
    const doTexto = extractFromPdfText(lido.text, lido.paginas, referenceDate);
    // Texto sem a linha (ou PDF só imagem): tenta o código de barras desenhado.
    const semLinha = (doTexto.erros ?? []).some(e => e === ERRO_SEM_LINHA || e === ERRO_SEM_TEXTO);
    if (!semLinha) return doTexto;
    try {
        const barras = await lerCodigoDeBarrasDoPdf(await file.arrayBuffer());
        if (!barras.linha) return doTexto;
        return extractFromPdfText(lido.text, lido.paginas, referenceDate, barras.linha);
    } catch {
        return doTexto;   // a leitura das barras é um extra: falhar nela não piora o que o texto deu
    }
}
