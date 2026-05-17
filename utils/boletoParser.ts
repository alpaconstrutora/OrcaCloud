/**
 * Parser client-side de boletos a partir de PDF ou entrada manual.
 *
 * Estratégia:
 *   1. Se for PDF com camada de texto, usar pdf.js para extrair e regex para achar
 *      a linha digitável (formato típico: 5 grupos separados por espaços/pontos).
 *   2. Se não extrair, o usuário cola/digita a linha manualmente.
 *   3. Em ambos os casos, valida via febrabanRules.parseLinhaDigitavel.
 *
 * OCR de imagens fica fora do MVP — imagens caem no fluxo manual.
 */

import {
    parseLinhaDigitavel,
    nomeBanco,
    calcularConfidence,
    onlyDigits,
    LinhaDigitavelParsed,
} from './febrabanRules';
import type { BoletoExtractionResult, BoletoMetodoExtracao } from '../types/boletos';

export const ENGINE_VERSAO = 'boleto-parser-1.0';

/**
 * Regex robusta para linha digitável em texto livre.
 * Aceita dígitos com espaços, pontos ou nada entre eles. Após normalização
 * (onlyDigits), o resultado é validado por tamanho.
 */
const LINHA_DIGITAVEL_REGEX =
    /(?:\d[\s.]?){43,52}/g;

/**
 * Tenta extrair a linha digitável de um texto.
 * Retorna a primeira ocorrência válida (44, 47 ou 48 dígitos), ou null.
 */
export function findLinhaDigitavelInText(text: string, referenceDate = new Date()): string | null {
    const matches = text.match(LINHA_DIGITAVEL_REGEX) || [];
    for (const m of matches) {
        const digits = onlyDigits(m);
        if (digits.length === 44 || digits.length === 47 || digits.length === 48) {
            const parsed = parseLinhaDigitavel(digits, referenceDate);
            if (parsed.valida) return digits;
        }
    }
    // Fallback: retorna o primeiro candidato com tamanho compatível, mesmo inválido
    for (const m of matches) {
        const digits = onlyDigits(m);
        if (digits.length === 44 || digits.length === 47 || digits.length === 48) {
            return digits;
        }
    }
    return null;
}

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

function emptyCampo<T>(): { valor: T | null; confidence: number } {
    return { valor: null, confidence: 0 };
}

/**
 * Constrói um ExtractionResult a partir de uma linha digitável já isolada.
 * Reutilizado tanto pelo fluxo de PDF quanto pelo manual.
 */
export function buildExtractionFromLinhaDigitavel(
    linha: string,
    metodo: BoletoMetodoExtracao = 'deterministic',
    referenceDate = new Date(),
): BoletoExtractionResult {
    const parsed: LinhaDigitavelParsed = parseLinhaDigitavel(linha, referenceDate);
    const confidence = calcularConfidence(parsed);
    const ldigits = onlyDigits(linha);

    const result: BoletoExtractionResult = {
        metodo,
        confidence_score: confidence,
        engine_versao: ENGINE_VERSAO,
        campos: {
            linha_digitavel:    { valor: ldigits || null, confidence: ldigits ? 100 : 0 },
            codigo_barras:      { valor: parsed.codigoBarras || null, confidence: parsed.codigoBarras ? 100 : 0 },
            qr_pix:             emptyCampo<string>(),
            valor:              { valor: parsed.valor ?? null, confidence: parsed.valor ? 95 : 0 },
            valor_original:     emptyCampo<number>(),
            vencimento:         { valor: parsed.vencimento ?? null, confidence: parsed.vencimento ? 85 : 0 },
            beneficiario_nome:  emptyCampo<string>(),
            beneficiario_cnpj:  emptyCampo<string>(),
            banco_codigo:       { valor: parsed.bancoCodigo ?? null, confidence: parsed.bancoCodigo ? 100 : 0 },
            banco_nome:         { valor: nomeBanco(parsed.bancoCodigo) ?? null, confidence: parsed.bancoCodigo ? 90 : 0 },
        },
        raw: { linhaDigitavel: ldigits, parsed },
        erros: parsed.erros,
    };

    return result;
}

/**
 * Tenta extrair linha digitável + texto de beneficiário/CNPJ de um PDF.
 * Beneficiário e CNPJ usam regex heurística — confidence baixa quando ambíguo.
 */
export async function extractFromPdfFile(file: File, referenceDate = new Date()): Promise<BoletoExtractionResult> {
    const { text, paginas } = await extractTextFromPdf(file);
    if (!text || text.length < 50) {
        // PDF sem camada de texto (escaneado) — devolve resultado vazio para fallback manual
        return {
            metodo: 'pdf_text',
            confidence_score: 0,
            engine_versao: ENGINE_VERSAO,
            campos: {
                linha_digitavel: emptyCampo(),
                codigo_barras: emptyCampo(),
                qr_pix: emptyCampo(),
                valor: emptyCampo(),
                valor_original: emptyCampo(),
                vencimento: emptyCampo(),
                beneficiario_nome: emptyCampo(),
                beneficiario_cnpj: emptyCampo(),
                banco_codigo: emptyCampo(),
                banco_nome: emptyCampo(),
            },
            raw: { paginas, pdfText: text.slice(0, 500) },
            erros: ['PDF sem camada de texto extraível — informe a linha digitável manualmente'],
        };
    }

    const linha = findLinhaDigitavelInText(text, referenceDate);
    if (!linha) {
        return {
            metodo: 'pdf_text',
            confidence_score: 0,
            engine_versao: ENGINE_VERSAO,
            campos: {
                linha_digitavel: emptyCampo(),
                codigo_barras: emptyCampo(),
                qr_pix: emptyCampo(),
                valor: emptyCampo(),
                valor_original: emptyCampo(),
                vencimento: emptyCampo(),
                beneficiario_nome: emptyCampo(),
                beneficiario_cnpj: emptyCampo(),
                banco_codigo: emptyCampo(),
                banco_nome: emptyCampo(),
            },
            raw: { paginas, pdfText: text.slice(0, 500) },
            erros: ['Linha digitável não encontrada no texto extraído'],
        };
    }

    const base = buildExtractionFromLinhaDigitavel(linha, 'pdf_text', referenceDate);

    // Heurística: CNPJ no texto (xx.xxx.xxx/xxxx-xx)
    const cnpjMatch = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    if (cnpjMatch) {
        base.campos.beneficiario_cnpj = { valor: cnpjMatch[1], confidence: 70 };
    }

    // Heurística: beneficiário — procura por "Beneficiário" ou "Cedente"
    const benefMatch = text.match(/(?:Benefici[áa]rio|Cedente)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n\r]{3,80})/i);
    if (benefMatch) {
        base.campos.beneficiario_nome = { valor: benefMatch[1].trim(), confidence: 60 };
    }

    base.raw = { ...base.raw, paginas, pdfTextPreview: text.slice(0, 500) };
    return base;
}
