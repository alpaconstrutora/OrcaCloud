/**
 * Leitura de boleto a partir de TEXTO — sem pdf.js, sem DOM, sem rede.
 *
 * Por que este arquivo existe (15/10/2026): a captura de boletos por e-mail
 * extrai o PDF numa Edge Function (Deno). O `boletoParser.ts` não roda lá — ele
 * carrega pdf.js com worker do Vite. Tudo o que é regra (achar a linha
 * digitável, CNPJ, beneficiário, multa/juros) mora aqui, e os dois leitores
 * (navegador e Edge Function) chamam a MESMA função `extractFromPdfText`.
 *
 * ⚠️ Imports só relativos e COM extensão `.ts`: é o que permite à Edge Function
 * importar `../../../utils/boletoTexto.ts` sem bundle (mesmo padrão do
 * `reconciliation-engine` com `utils/reconciliationRules.ts`). Import sem
 * extensão ou de pacote npm quebra o deploy da function.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 1.2).
 */

import {
    parseLinhaDigitavel,
    nomeBanco,
    calcularConfidence,
    onlyDigits,
    vencimentoPlausivel,
} from './febrabanRules.ts';
import type { LinhaDigitavelParsed } from './febrabanRules.ts';
import { validateCNPJ } from '../lib/validators.ts';
import type { BoletoExtractionResult, BoletoMetodoExtracao } from '../types/boletos.ts';

export const ENGINE_VERSAO = 'boleto-parser-1.1';

/** Abaixo disto o PDF não tem camada de texto útil (escaneado/imagem). */
export const MIN_TEXTO_UTIL = 50;

export const ERRO_SEM_TEXTO = 'PDF sem camada de texto extraível — informe a linha digitável manualmente';
export const ERRO_SEM_LINHA = 'Linha digitável não encontrada no texto extraído';
/**
 * PDF criptografado (15/10/2026): o 1º boleto lido da caixa real — Energisa,
 * "Reaviso Digital" — vem com senha, e o aviso dizia "sem camada de texto",
 * mandando o usuário procurar o problema errado. Concessionárias costumam
 * proteger a conta com dígitos do CPF/CNPJ do titular.
 */
export const ERRO_PDF_COM_SENHA = 'PDF protegido por senha — cadastre a senha no remetente monitorado ou informe a linha digitável manualmente';

/** pdf.js / unpdf sinalizam senha ausente ou errada com este nome de erro. */
export function ehErroDeSenha(e: unknown): boolean {
    const nome = (e as { name?: string } | null)?.name ?? '';
    return nome === 'PasswordException' || /password/i.test((e as { message?: string } | null)?.message ?? '');
}

/**
 * Regex robusta para linha digitável em texto livre.
 * Aceita dígitos com espaços, pontos ou nada entre eles. Após normalização
 * (onlyDigits), o resultado é validado por tamanho.
 */
const LINHA_DIGITAVEL_REGEX =
    /(?:\d[\s.]?){43,52}/g;

/** Linha bancária como é impressa: `00000.00000 00000.000000 00000.000000 0 00000000000000`. */
const LINHA_FORMATADA_BANCARIA =
    /(?<!\d)\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14}(?!\d)/g;

/** Arrecadação (concessionária/tributo) impressa: 4 blocos de 11 dígitos + DV. */
const LINHA_FORMATADA_ARRECADACAO =
    /(?<!\d)8\d{10}[\s-]?\d\s+\d{11}[\s-]?\d\s+\d{11}[\s-]?\d\s+\d{11}[\s-]?\d(?!\d)/g;

/**
 * Rótulos de coluna da ficha de compensação que às vezes ficam colados ao
 * rótulo "Beneficiário"/"Cedente" na extração de texto do PDF — nunca são o
 * nome do credor.
 */
const BENEFICIARIO_STOPWORDS =
    /^(vencimento|valor|data|nosso n[uú]mero|ag[eê]ncia|c[oó]digo|carteira|esp[eé]cie|aceite|processamento|documento|sacado|pagador|local de pagamento|instru[cç][oõ]es|\(-\)|\(\+\)|\(=\))/i;

const BENEFICIARIO_ROTULO = /(?:Benefici[áa]rio|Cedente)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n\r]{3,80})/i;

/** Distância máxima (caracteres) entre o rótulo "Beneficiário" e o CNPJ dele. */
const JANELA_CNPJ_BENEFICIARIO = 300;

/**
 * Tenta extrair a linha digitável de um texto.
 * Retorna a primeira ocorrência válida (44, 47 ou 48 dígitos), ou null.
 */
export function findLinhaDigitavelInText(text: string, referenceDate = new Date()): string | null {
    /* 1º: o FORMATO IMPRESSO, que delimita a linha sozinho mesmo com número
       vizinho encostado dos dois lados (15/10/2026). Só aceita se os DVs
       conferem. */
    for (const re of [LINHA_FORMATADA_BANCARIA, LINHA_FORMATADA_ARRECADACAO]) {
        for (const m of text.match(re) || []) {
            const digits = onlyDigits(m);
            if (parseLinhaDigitavel(digits, referenceDate).valida) return digits;
        }
    }

    const matches = text.match(LINHA_DIGITAVEL_REGEX) || [];
    for (const m of matches) {
        const digits = onlyDigits(m);
        if (digits.length === 44 || digits.length === 47 || digits.length === 48) {
            const parsed = parseLinhaDigitavel(digits, referenceDate);
            if (parsed.valida) return digits;
        }
    }
    /* Bloco maior que 48 dígitos: um número vizinho grudou na linha. O pdf.js
       junta os pedaços de texto com espaço e a regex aceita espaço entre
       dígitos, então "…/0001-81 34191.09008 …" vira um bloco de 49 dígitos e a
       linha some (achado em 15/10/2026 no teste de boletoTexto).

       Só olha as janelas ENCOSTADAS no início ou no fim do bloco (é onde o
       vizinho gruda) e só de 47/48 dígitos, que têm quatro DVs. Janela de 44
       (código de barras) tem um DV só: varrendo todas as posições, lixo
       numérico passava por acaso ~1 vez em 11 — o próprio teste pegou. */
    /* Vale também para o bloco de exatamente 48 dígitos inválido: no boleto
       Santander lido pelo unpdf (spike de 15/10/2026) a linha de 47 vem sem
       separadores e um "7" do texto anterior gruda nela — 48 dígitos que não
       fecham como arrecadação. Sem isto o fallback devolvia o bloco errado. */
    for (const m of matches) {
        const digits = onlyDigits(m);
        if (digits.length < 48) continue;
        for (const tam of [47, 48]) {
            if (tam >= digits.length) continue;
            for (const janela of [digits.slice(0, tam), digits.slice(digits.length - tam)]) {
                if (parseLinhaDigitavel(janela, referenceDate).valida) return janela;
            }
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

function emptyCampo<T>(): { valor: T | null; confidence: number } {
    return { valor: null, confidence: 0 };
}

function emptyFields(): BoletoExtractionResult['campos'] {
    return {
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
    };
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
 * CNPJ do beneficiário no texto.
 *
 * Até 15/10/2026 era "o primeiro CNPJ formatado do texto" — que pode ser o do
 * PAGADOR (o sacado costuma vir antes na ficha) ou um número com a forma de
 * CNPJ e DV errado; e CNPJ sem máscara ("CNPJ: 07604526000120", como VR e
 * Santander imprimem) nem era visto. Agora:
 *   1. candidatos: formatado, ou 14 dígitos logo depois do rótulo "CNPJ";
 *   2. só conta CNPJ cujos dígitos verificadores conferem;
 *   3. o rótulo mais próximo ANTES do CNPJ (até 300 caracteres) diz de quem
 *      ele é: "Beneficiário/Cedente" → 80; nenhum rótulo → 60;
 *      só "Pagador/Sacado/Avalista" → 30 (quase certamente o pagador);
 *   4. nenhum válido mas algum com a forma de CNPJ → confiança 30.
 * Abaixo de 70 o CNPJ fica no boleto para o usuário conferir, mas a captura
 * automática não o usa para casar fornecedor sozinha.
 */
export function findBeneficiarioCnpj(text: string): { valor: string; confidence: number } | null {
    const todos: Array<{ cnpj: string; pos: number; valido: boolean }> = [];
    let m: RegExpExecArray | null;

    // Formatado: 11.222.333/0001-81
    const reMascara = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    while ((m = reMascara.exec(text)) !== null) {
        todos.push({ cnpj: m[0], pos: m.index, valido: validateCNPJ(m[0]) });
    }
    // Sem máscara, só quando ROTULADO ("CNPJ: 07604526000120", "CNPJ/CPF 0253…")
    // — é como VR e Santander imprimem (spike de 15/10/2026). Sem o rótulo,
    // 14 dígitos soltos são qualquer coisa (nosso número, código de barras).
    const reRotulado = /CNPJ(?:\s*\/\s*CPF)?\s*:?\s*(\d{14})(?!\d)/gi;
    while ((m = reRotulado.exec(text)) !== null) {
        const pos = m.index + m[0].length - 14;
        if (!todos.some(c => c.pos === pos)) {
            todos.push({ cnpj: mascararCnpj(m[1]), pos, valido: validateCNPJ(m[1]) });
        }
    }
    if (!todos.length) return null;
    todos.sort((a, b) => a.pos - b.pos);

    const validos = todos.filter(c => c.valido);
    if (!validos.length) return { valor: todos[0].cnpj, confidence: 30 };

    // Rótulo mais próximo ANTES do CNPJ decide de quem ele é.
    const ultima = (s: string, re: RegExp): number => {
        let p = -1;
        for (const x of s.matchAll(re)) p = x.index ?? p;
        return p;
    };
    const dono = (pos: number): 'beneficiario' | 'pagador' | null => {
        const antes = text.slice(Math.max(0, pos - JANELA_CNPJ_BENEFICIARIO), pos);
        const ultimoBenef = ultima(antes, /Benefici[áa]rio|Cedente/gi);
        const ultimoPagador = ultima(antes, /Pagador|Sacado|Avalista/gi);
        if (ultimoBenef < 0 && ultimoPagador < 0) return null;
        return ultimoBenef > ultimoPagador ? 'beneficiario' : 'pagador';
    };

    const doBenef = validos.find(c => dono(c.pos) === 'beneficiario');
    if (doBenef) return { valor: doBenef.cnpj, confidence: 80 };
    const semDono = validos.find(c => dono(c.pos) === null);
    if (semDono) return { valor: semDono.cnpj, confidence: 60 };
    // Só sobrou CNPJ sob "Pagador": quase certamente NÃO é o beneficiário.
    return { valor: validos[0].cnpj, confidence: 30 };
}

function mascararCnpj(d: string): string {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** Corta o que vem colado depois do nome ("… LTDA - CNPJ: 0760… Venc"). */
function limparNomeBeneficiario(candidato: string): string {
    return candidato
        .split(/\s+[-–]?\s*(?:CNPJ|CPF)\b|\s+(?:Vencimento|Venc\b|Endere[çc]o|Ag[êe]ncia)/i)[0]
        .replace(/[\s\-–:]+$/, '')
        .trim();
}

/**
 * Vencimento impresso no texto ("Venc. 02/10/2026", "Vencimento: 20/09/2026",
 * "Data de vencimento 10/11/2026"), em AAAA-MM-DD.
 *
 * Existe para conta de CONCESSIONÁRIA (linha de arrecadação, começa com 8): a
 * linha não carrega data, e o 1º reaviso da Energisa lido pela captura
 * (boleto nº 1423, 16/10/2026) entrou sem vencimento com "Venc. 02/10/2026"
 * impresso. Só é usado quando a linha digitável não deu a data.
 */
export function findVencimentoNoTexto(text: string): string | null {
    const re = /(?:\bVenc(?:imento|to)?\.?|\bData\s+de\s+vencimento)\s*[:\-–]?\s*(\d{2})\/(\d{2})\/(\d{4})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const [, dd, mm, aaaa] = m;
        const dia = Number(dd), mes = Number(mm);
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
        return `${aaaa}-${mm}-${dd}`;
    }
    return null;
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

/** Resultado de um PDF que não abriu por falta da senha certa. */
export function resultadoPdfComSenha(): BoletoExtractionResult {
    return {
        metodo: 'pdf_text',
        confidence_score: 0,
        engine_versao: ENGINE_VERSAO,
        campos: emptyFields(),
        raw: { paginas: 0, protegidoPorSenha: true },
        erros: [ERRO_PDF_COM_SENHA],
    };
}

/**
 * Lê um boleto a partir do TEXTO já extraído do PDF (por pdf.js no navegador,
 * ou por unpdf na Edge Function). Linha digitável é determinística; beneficiário,
 * CNPJ e multa/juros são heurísticas com confiança menor.
 */
export function extractFromPdfText(
    text: string,
    paginas: number,
    referenceDate = new Date(),
): BoletoExtractionResult {
    if (!text || text.length < MIN_TEXTO_UTIL) {
        return {
            metodo: 'pdf_text',
            confidence_score: 0,
            engine_versao: ENGINE_VERSAO,
            campos: emptyFields(),
            raw: { paginas, pdfText: (text || '').slice(0, 500) },
            erros: [ERRO_SEM_TEXTO],
        };
    }

    const linha = findLinhaDigitavelInText(text, referenceDate);
    if (!linha) {
        // Sem linha, a revisão ao menos já abre com o vencimento impresso.
        const campos = emptyFields();
        const vencTexto = findVencimentoNoTexto(text);
        if (vencTexto) campos.vencimento = { valor: vencTexto, confidence: 60 };
        return {
            metodo: 'pdf_text',
            confidence_score: 0,
            engine_versao: ENGINE_VERSAO,
            campos,
            raw: { paginas, pdfText: text.slice(0, 500) },
            erros: [ERRO_SEM_LINHA],
        };
    }

    const base = buildExtractionFromLinhaDigitavel(linha, 'pdf_text', referenceDate);

    // Linha sem data (arrecadação/concessionária): vencimento pelo texto impresso.
    if (!base.campos.vencimento.valor) {
        const vencTexto = findVencimentoNoTexto(text);
        if (vencTexto) base.campos.vencimento = { valor: vencTexto, confidence: 70 };
    }

    const cnpj = findBeneficiarioCnpj(text);
    if (cnpj) base.campos.beneficiario_cnpj = cnpj;

    // Heurística: beneficiário — procura por "Beneficiário" ou "Cedente".
    // pdf.js extrai o texto na ordem do fluxo interno do PDF, não na ordem
    // visual — em muitos layouts de ficha de compensação o que fica "colado"
    // depois do rótulo não é o nome, é o cabeçalho da tabela de valores
    // ("Vencimento Valor do Documento (-) Desconto..."). Por isso o match só
    // é aceito se não começar com um desses rótulos conhecidos.
    const benefMatch = text.match(BENEFICIARIO_ROTULO);
    if (benefMatch) {
        const candidato = limparNomeBeneficiario(benefMatch[1].trim());
        if (candidato.length >= 3 && !BENEFICIARIO_STOPWORDS.test(candidato)) {
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

/**
 * Colunas de `boletos` a partir de uma extração — a MESMA conversão para o
 * upload na tela (`boletoService.uploadBoleto`) e para a captura por e-mail
 * (Edge Function). Movida para cá em 15/10/2026 para não existirem duas.
 */
export function colunasDaExtracao(ext: BoletoExtractionResult, agoraIso = new Date().toISOString()) {
    // Guarda da data (24/09/2026): a base tinha um boleto com vencimento
    // `20023-09-21` — ano de cinco dígitos, vindo de um PDF sem linha
    // digitável. Data implausível NÃO derruba a importação: vira `null` mais
    // um aviso, e o usuário preenche. O valor e o beneficiário podem ter vindo
    // certos, e perder o boleto inteiro por causa da data seria pior.
    const venc = vencimentoPlausivel(ext.campos.vencimento.valor);
    const avisoData = venc.ok ? [] : [venc.motivo];
    const errosEAvisos = [...ext.erros, ...(ext.avisos ?? []), ...avisoData];

    return {
        linha_digitavel: ext.campos.linha_digitavel.valor,
        codigo_barras: ext.campos.codigo_barras.valor,
        qr_pix: ext.campos.qr_pix.valor,
        valor: ext.campos.valor.valor,
        valor_original: ext.campos.valor_original.valor,
        vencimento: venc.ok ? venc.valor : null,
        beneficiario_nome: ext.campos.beneficiario_nome.valor,
        beneficiario_cnpj: ext.campos.beneficiario_cnpj.valor,
        banco_codigo: ext.campos.banco_codigo.valor,
        banco_nome: ext.campos.banco_nome.valor,
        multa: ext.campos.multa.valor,
        multa_percentual: ext.campos.multa_percentual.valor,
        juros_dia: ext.campos.juros_dia.valor,
        juros_dia_tipo: ext.campos.juros_dia_tipo.valor,
        metodo_extracao: ext.metodo,
        confidence_score: ext.confidence_score,
        engine_versao: ext.engine_versao,
        extracao_raw: ext.raw,
        extracao_em: agoraIso,
        /* `checksum_valido` olha SÓ `erros`. Aviso (ex.: fator de vencimento
           ambíguo) não pode marcar como inválido um boleto cujos DVs conferem —
           foi justamente esse campo que descartou o falso alarme dos boletos de
           2017 em 15/08/2026. */
        checksum_valido: ext.erros.length === 0,
        erros_validacao: errosEAvisos.length ? errosEAvisos : null,
    };
}
