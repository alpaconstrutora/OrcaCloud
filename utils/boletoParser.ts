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
/**
 * Rótulos de coluna da ficha de compensação que às vezes ficam colados ao
 * rótulo "Beneficiário"/"Cedente" na extração de texto do PDF — nunca são o
 * nome do credor.
 */
const BENEFICIARIO_STOPWORDS =
    /^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))/i;

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
 * Extrai multa e juros do texto livre do boleto.
 *
 * Bancos não seguem formato único — cobrimos os padrões mais comuns:
 *   "Multa: R$ 10,00"  /  "Multa de 2%"  /  "Mora: R$ 0,50/dia"
 *   "Juros ao dia: R$ 0,10"  /  "Juros de 1% a.m."  /  "Mora 0,033% a.d."
 *
 * Confidence reflete a ambiguidade: ~50 quando encontrado via heurística de texto.
 */
export function extractMultaJurosFromText(text: string): {
    multa:           { valor: number | null; confidence: number };
    multa_percentual:{ valor: number | null; confidence: number };
    juros_dia:       { valor: number | null; confidence: number };
    juros_dia_tipo:  { valor: 'valor' | 'percentual' | null; confidence: number };
} {
    const empty = emptyCampo<number>();
    const emptyTipo = emptyCampo<'valor' | 'percentual'>();

    const t = text.replace(/\s+/g, ' ');

    // ── Multa em R$ ──────────────────────────────────────────────────────────
    // "Multa: R$ 10,00"  |  "Multa por atraso R$ 5,50"  |  "Multa R$10.00"
    const multaValorMatch = t.match(
        /multa\b[^%\d]{0,30}R\$\s*([\d.,]+)/i,
    );
    const multaValor = multaValorMatch ? parseBRL(multaValorMatch[1]) : null;

    // ── Multa em % ───────────────────────────────────────────────────────────
    // "Multa de 2%"  |  "Multa: 2,00%"  |  "Multa 2 %"
    const multaPctMatch = !multaValor
        ? t.match(/multa\b[^R\d]{0,20}([\d.,]+)\s*%/i)
        : null;
    const multaPct = multaPctMatch ? parseFloat(multaPctMatch[1].replace(',', '.')) : null;

    // ── Juros por dia em R$ ──────────────────────────────────────────────────
    // "Juros ao dia: R$ 0,10"  |  "Mora R$ 0,50 por dia"  |  "Juros R$0.10/dia"
    const jurosDiaValorMatch = t.match(
        /(?:juros|mora)\b[^%]{0,40}R\$\s*([\d.,]+)\s*(?:\/?\s*dia|ao\s+dia|por\s+dia|a\.?d\.?)/i,
    );
    // Fallback: "Juros: R$ 0,10" sem menção a "dia" (campo típico em boletos onde o rótulo já implica diário)
    const jurosFallbackMatch = !jurosDiaValorMatch
        ? t.match(/(?:juros|mora)\b[^%\d]{0,20}R\$\s*([\d.,]+)/i)
        : null;
    const jurosDiaR = jurosDiaValorMatch
        ? parseBRL(jurosDiaValorMatch[1])
        : jurosFallbackMatch
            ? parseBRL(jurosFallbackMatch[1])
            : null;

    // ── Juros por dia em % ───────────────────────────────────────────────────
    // "Juros 0,033% a.d."  |  "Mora 1% a.m." (convertemos a.m. → /30)
    // "Juros ao dia: 0,5%"
    let jurosDiaPct: number | null = null;
    if (!jurosDiaR) {
        const jurosPctDiaMatch = t.match(
            /(?:juros|mora)\b[^R\d]{0,30}([\d.,]+)\s*%\s*(?:a\.?\s*d\.?|ao\s+dia|por\s+dia|\/\s*dia)/i,
        );
        if (jurosPctDiaMatch) {
            jurosDiaPct = parseFloat(jurosPctDiaMatch[1].replace(',', '.'));
        } else {
            // Juros % a.m. → dividir por 30
            const jurosPctMesMatch = t.match(
                /(?:juros|mora)\b[^R\d]{0,30}([\d.,]+)\s*%\s*(?:a\.?\s*m\.?|ao\s+m[eê]s|por\s+m[eê]s|\/\s*m[eê]s)/i,
            );
            if (jurosPctMesMatch) {
                jurosDiaPct = parseFloat(jurosPctMesMatch[1].replace(',', '.')) / 30;
            }
        }
    }

    const temJuros = jurosDiaR !== null || jurosDiaPct !== null;
    const jurosDiaValor = jurosDiaR ?? jurosDiaPct;
    const jurosTipo: 'valor' | 'percentual' | null = temJuros
        ? (jurosDiaR !== null ? 'valor' : 'percentual')
        : null;

    return {
        multa:            multaValor !== null
            ? { valor: multaValor, confidence: 50 }
            : empty as { valor: number | null; confidence: number },
        multa_percentual: multaPct !== null
            ? { valor: multaPct, confidence: 50 }
            : empty as { valor: number | null; confidence: number },
        juros_dia:        jurosDiaValor !== null
            ? { valor: jurosDiaValor, confidence: jurosDiaValorMatch ? 50 : 35 }
            : empty as { valor: number | null; confidence: number },
        juros_dia_tipo:   jurosTipo !== null
            ? { valor: jurosTipo, confidence: 50 }
            : emptyTipo as { valor: 'valor' | 'percentual' | null; confidence: number },
    };
}

/** Converte string "1.234,56" ou "1234.56" para número. */
function parseBRL(s: string): number | null {
    // Remove separadores de milhar (ponto antes de vírgula ou 3 dígitos no final)
    const normalized = s.includes(',')
        ? s.replace(/\./g, '').replace(',', '.')
        : s;
    const n = parseFloat(normalized);
    return isNaN(n) || n <= 0 ? null : n;
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
            multa:              emptyCampo<number>(),
            multa_percentual:   emptyCampo<number>(),
            juros_dia:          emptyCampo<number>(),
            juros_dia_tipo:     emptyCampo<'valor' | 'percentual'>(),
        },
        raw: { linhaDigitavel: ldigits, parsed },
        erros: parsed.erros,
        // Ressalvas sem invalidar o documento — hoje, fator de vencimento ambíguo.
        avisos: parsed.avisos,
    };

    return result;
}

/**
 * Tenta extrair linha digitável + texto de beneficiário/CNPJ de um PDF.
 * Beneficiário e CNPJ usam regex heurística — confidence baixa quando ambíguo.
 */
export async function extractFromPdfFile(file: File, referenceDate = new Date()): Promise<BoletoExtractionResult> {
    const { text, paginas } = await extractTextFromPdf(file);
    const emptyFields = () => ({
        linha_digitavel: emptyCampo<string>(),
        codigo_barras: emptyCampo<string>(),
        qr_pix: emptyCampo<string>(),
        valor: emptyCampo<number>(),
        valor_original: emptyCampo<number>(),
        vencimento: emptyCampo<string>(),
        beneficiario_nome: emptyCampo<string>(),
        beneficiario_cnpj: emptyCampo<string>(),
        banco_codigo: emptyCampo<string>(),
        banco_nome: emptyCampo<string>(),
        multa: emptyCampo<number>(),
        multa_percentual: emptyCampo<number>(),
        juros_dia: emptyCampo<number>(),
        juros_dia_tipo: emptyCampo<'valor' | 'percentual'>(),
    });

    if (!text || text.length < 50) {
        return {
            metodo: 'pdf_text',
            confidence_score: 0,
            engine_versao: ENGINE_VERSAO,
            campos: emptyFields(),
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
            campos: emptyFields(),
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

    // Heurística: beneficiário — procura por "Beneficiário" ou "Cedente".
    // pdf.js extrai o texto na ordem do fluxo interno do PDF, não na ordem
    // visual — em muitos layouts de ficha de compensação o que fica "colado"
    // depois do rótulo não é o nome, é o cabeçalho da tabela de valores
    // ("Vencimento Valor do Documento (-) Desconto..."). Por isso o match só
    // é aceito se não começar com um desses rótulos conhecidos.
    const benefMatch = text.match(/(?:Benefici[áa]rio|Cedente)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n\r]{3,80})/i);
    if (benefMatch) {
        const candidato = benefMatch[1].trim();
        if (!BENEFICIARIO_STOPWORDS.test(candidato)) {
            base.campos.beneficiario_nome = { valor: candidato, confidence: 60 };
        }
    }

    // Heurística: multa e juros — texto livre do boleto
    const mj = extractMultaJurosFromText(text);
    if (mj.multa.valor !== null)            base.campos.multa            = mj.multa;
    if (mj.multa_percentual.valor !== null) base.campos.multa_percentual = mj.multa_percentual;
    if (mj.juros_dia.valor !== null)        base.campos.juros_dia        = mj.juros_dia;
    if (mj.juros_dia_tipo.valor !== null)   base.campos.juros_dia_tipo   = mj.juros_dia_tipo;

    base.raw = { ...base.raw, paginas, pdfTextPreview: text.slice(0, 500) };
    return base;
}
