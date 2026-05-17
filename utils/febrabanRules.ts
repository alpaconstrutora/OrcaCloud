/**
 * Validação e parsing de boletos brasileiros (FEBRABAN).
 *
 * Suporta dois formatos:
 *   - 47 dígitos: boleto bancário tradicional (5+5+5+6+1+14)
 *   - 48 dígitos: boleto de arrecadação/concessionária (segmentos de 11/12 dígitos)
 *
 * Referência: Manual Operacional FEBRABAN — Boleto de Cobrança.
 *
 * Fator de vencimento:
 *   - Base original: 1997-10-07 (fator 1000). Saturou em 21/02/2025.
 *   - A partir de 22/02/2025: continuação com base ajustada.
 */

export interface LinhaDigitavelParsed {
    valida: boolean;
    tipo: 'bancario' | 'arrecadacao';
    codigoBarras: string;
    bancoCodigo?: string;
    moeda?: string;
    valor?: number;
    vencimento?: string; // ISO yyyy-mm-dd
    erros: string[];
}

// Remove tudo que não for dígito
export function onlyDigits(s: string): string {
    return (s || '').replace(/\D+/g, '');
}

// Módulo 10 (FEBRABAN) — peso alternado 2-1, soma dígitos do produto
export function mod10(input: string): number {
    let sum = 0;
    let weight = 2;
    for (let i = input.length - 1; i >= 0; i--) {
        const product = Number(input[i]) * weight;
        sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
        weight = weight === 2 ? 1 : 2;
    }
    const remainder = sum % 10;
    return remainder === 0 ? 0 : 10 - remainder;
}

// Módulo 11 (FEBRABAN) — pesos de 2 a 9, ciclando.
// Usado para o DV geral do código de barras (boleto bancário).
export function mod11(input: string): number {
    let sum = 0;
    let weight = 2;
    for (let i = input.length - 1; i >= 0; i--) {
        sum += Number(input[i]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    const dv = 11 - remainder;
    if (dv === 0 || dv === 10 || dv === 11) return 1;
    return dv;
}

// Módulo 11 para boleto de arrecadação (segmentos): DV pode ser 0
export function mod11Arrecadacao(input: string): number {
    let sum = 0;
    let weight = 2;
    for (let i = input.length - 1; i >= 0; i--) {
        sum += Number(input[i]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    const dv = 11 - remainder;
    if (dv === 10 || dv === 11) return 0;
    return dv;
}

// Módulo 10 para arrecadação (8º bloco usa mod10 quando o 3º dígito é 6 ou 7)
// O 3º dígito do código de barras indica a forma de cálculo:
//   6, 7 → módulo 10
//   8, 9 → módulo 11

/**
 * Converte fator de vencimento (4 dígitos) em data ISO.
 *
 * Regras:
 *   - 1000..9999 com base 1997-10-07 (regra antiga, válida até 21/02/2025).
 *   - Após 21/02/2025, novos fatores foram redefinidos para começar em 1000
 *     com base 22/02/2025 (manual FEBRABAN — release 2024).
 *
 * Implementação prática: tentamos a regra "nova" primeiro se o fator estiver
 * dentro do range pós-reset e a data resultante não for absurdamente distante.
 * Para boletos emitidos antes de 22/02/2025 com fator > 0, a regra antiga é usada.
 *
 * Para o MVP, usamos a interpretação simples e amplamente compatível:
 *   - fator 1000..1666: pode ser pré-reset (próximo de jul/2000) ou pós-reset
 *     (próximo de nov/2027). Preferimos pós-reset se a data atual for ≥ 2025.
 *   - demais fatores: regra antiga (base 1997-10-07).
 */
export function fatorVencimentoToDate(fator: number, referenceDate = new Date()): string | undefined {
    if (!fator || fator <= 0) return undefined;

    const BASE_ANTIGA = new Date(Date.UTC(1997, 9, 7)); // 1997-10-07
    const BASE_NOVA = new Date(Date.UTC(2025, 1, 22));  // 2025-02-22, fator 1000
    const MS_DAY = 24 * 60 * 60 * 1000;

    // Candidata 1 — regra antiga
    const candAntiga = new Date(BASE_ANTIGA.getTime() + fator * MS_DAY);

    // Candidata 2 — regra nova (fator começa em 1000)
    let candNova: Date | undefined;
    if (fator >= 1000) {
        candNova = new Date(BASE_NOVA.getTime() + (fator - 1000) * MS_DAY);
    }

    // Se a candidata antiga for futuro razoável (até 5 anos à frente) ou passado recente
    // (até 5 anos atrás), usa ela. Caso contrário, usa a nova.
    const ref = referenceDate.getTime();
    const diffAntiga = Math.abs(candAntiga.getTime() - ref);
    const diffNova = candNova ? Math.abs(candNova.getTime() - ref) : Infinity;

    const escolhida = diffNova < diffAntiga ? candNova! : candAntiga;
    const yyyy = escolhida.getUTCFullYear();
    const mm = String(escolhida.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(escolhida.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converte código de barras de 44 dígitos em linha digitável de 47 (bancário).
 *
 * Estrutura do código de barras (0-indexado):
 *   0..2   banco       3 dígitos
 *   3      moeda       1
 *   4      DV geral    1
 *   5..8   fator venc  4
 *   9..18  valor       10
 *   19..43 campo livre 25
 *
 * Estrutura da linha digitável (47 dígitos):
 *   Campo 1: banco + moeda + 5 primeiros do campo livre + DV mod10 (10 dígitos)
 *   Campo 2: 10 dígitos seguintes do campo livre + DV mod10 (11 dígitos)
 *   Campo 3: 10 últimos dígitos do campo livre + DV mod10 (11 dígitos)
 *   Campo 4: DV geral (1)
 *   Campo 5: fator vencimento + valor (14)
 */
export function codigoBarrasToLinhaDigitavel(codBarras44: string): string {
    if (codBarras44.length !== 44) return '';

    // Campo 1 (sem DV): banco(0..2) + moeda(3) + campoLivre[0..4] (slice 19..24)
    const c1 = codBarras44.slice(0, 4) + codBarras44.slice(19, 24);
    const c1dv = mod10(c1);

    // Campo 2 (sem DV): campoLivre[5..14] (slice 24..34)
    const c2 = codBarras44.slice(24, 34);
    const c2dv = mod10(c2);

    // Campo 3 (sem DV): campoLivre[15..24] (slice 34..44)
    const c3 = codBarras44.slice(34, 44);
    const c3dv = mod10(c3);

    // Campo 4: DV geral (pos 5 no padrão 1-indexado = index 4)
    const c4 = codBarras44.slice(4, 5);

    // Campo 5: fator + valor (14 dígitos a partir do index 5)
    const c5 = codBarras44.slice(5, 19);

    return `${c1}${c1dv}${c2}${c2dv}${c3}${c3dv}${c4}${c5}`;
}

/**
 * Converte linha digitável de 47 dígitos (bancário) em código de barras de 44.
 */
export function linhaDigitavelToCodigoBarras47(ld47: string): string {
    if (ld47.length !== 47) return '';
    // posições no código de barras (1-indexado):
    //   1-3   banco                  ld[0..3]
    //   4     moeda                  ld[3]
    //   5     DV geral               ld[33]
    //   6-9   fator vencimento       ld[33..37] (depois do DV)
    //   10-19 valor (10 dígitos)
    //   20-44 campo livre

    const banco = ld47.slice(0, 3);
    const moeda = ld47.slice(3, 4);
    const dvGeral = ld47.slice(32, 33);
    const fatorValor = ld47.slice(33, 47); // 14 dígitos
    const campoLivre =
        ld47.slice(4, 9) +    // resto do campo 1 (após banco+moeda)
        ld47.slice(10, 20) +  // campo 2 sem DV
        ld47.slice(21, 31);   // campo 3 sem DV

    return `${banco}${moeda}${dvGeral}${fatorValor}${campoLivre}`;
}

/**
 * Converte linha digitável de 48 dígitos (arrecadação) em código de barras de 44.
 * Arrecadação: 4 segmentos de 11 ou 12 dígitos com DV no final de cada segmento.
 */
export function linhaDigitavelToCodigoBarras48(ld48: string): string {
    if (ld48.length !== 48) return '';
    // 4 segmentos de 12 dígitos cada (11 + DV). Remover os DVs.
    const s1 = ld48.slice(0, 11);
    const s2 = ld48.slice(12, 23);
    const s3 = ld48.slice(24, 35);
    const s4 = ld48.slice(36, 47);
    return `${s1}${s2}${s3}${s4}`;
}

/**
 * Valida e parseia uma linha digitável (47 ou 48 dígitos) ou código de barras (44).
 */
export function parseLinhaDigitavel(input: string, referenceDate = new Date()): LinhaDigitavelParsed {
    const digits = onlyDigits(input);
    const erros: string[] = [];

    let codBarras = '';
    let tipo: 'bancario' | 'arrecadacao' = 'bancario';

    if (digits.length === 44) {
        codBarras = digits;
        tipo = digits.startsWith('8') ? 'arrecadacao' : 'bancario';
    } else if (digits.length === 47) {
        codBarras = linhaDigitavelToCodigoBarras47(digits);
        tipo = 'bancario';
    } else if (digits.length === 48) {
        codBarras = linhaDigitavelToCodigoBarras48(digits);
        tipo = 'arrecadacao';
    } else {
        erros.push(`Tamanho inválido: ${digits.length} dígitos (esperado 44, 47 ou 48)`);
        return { valida: false, tipo: 'bancario', codigoBarras: '', erros };
    }

    if (codBarras.length !== 44) {
        erros.push('Falha ao normalizar código de barras');
        return { valida: false, tipo, codigoBarras: codBarras, erros };
    }

    let valida = true;

    if (tipo === 'bancario') {
        return parseBoletoBancario(codBarras, digits, referenceDate, erros);
    }

    // Arrecadação: validar DVs por segmento na linha digitável (se foi passada de 48)
    if (digits.length === 48) {
        const seg1 = digits.slice(0, 11);
        const dv1 = Number(digits.slice(11, 12));
        const seg2 = digits.slice(12, 23);
        const dv2 = Number(digits.slice(23, 24));
        const seg3 = digits.slice(24, 35);
        const dv3 = Number(digits.slice(35, 36));
        const seg4 = digits.slice(36, 47);
        const dv4 = Number(digits.slice(47, 48));

        const terceiroDigito = digits[2];
        const useMod10 = terceiroDigito === '6' || terceiroDigito === '7';
        const calc = useMod10 ? mod10 : mod11Arrecadacao;

        if (calc(seg1) !== dv1) { erros.push('DV segmento 1 inválido'); valida = false; }
        if (calc(seg2) !== dv2) { erros.push('DV segmento 2 inválido'); valida = false; }
        if (calc(seg3) !== dv3) { erros.push('DV segmento 3 inválido'); valida = false; }
        if (calc(seg4) !== dv4) { erros.push('DV segmento 4 inválido'); valida = false; }
    }

    // Valor (arrecadação): posições 5-15 do código de barras → 11 dígitos com 2 decimais
    const valorRaw = codBarras.slice(4, 15);
    const valor = Number(valorRaw) / 100;

    return {
        valida,
        tipo: 'arrecadacao',
        codigoBarras: codBarras,
        valor: valor > 0 ? valor : undefined,
        erros,
    };
}

function parseBoletoBancario(
    codBarras: string,
    linhaOriginal: string,
    referenceDate: Date,
    erros: string[],
): LinhaDigitavelParsed {
    let valida = true;

    // DV geral: módulo 11 sobre código de barras sem o 5º dígito (DV)
    const dvGeral = Number(codBarras[4]);
    const semDV = codBarras.slice(0, 4) + codBarras.slice(5);
    const dvCalc = mod11(semDV);
    if (dvCalc !== dvGeral) {
        erros.push(`DV geral inválido (esperado ${dvCalc}, encontrado ${dvGeral})`);
        valida = false;
    }

    // Banco
    const bancoCodigo = codBarras.slice(0, 3);
    const moeda = codBarras.slice(3, 4);

    // Fator vencimento (posições 6-9)
    const fator = Number(codBarras.slice(5, 9));
    const vencimento = fatorVencimentoToDate(fator, referenceDate);

    // Valor (posições 10-19): 10 dígitos com 2 decimais
    const valorRaw = codBarras.slice(9, 19);
    const valorNum = Number(valorRaw) / 100;
    const valor = valorNum > 0 ? valorNum : undefined;

    // Se linha original tinha 47 dígitos, validar DVs dos 3 primeiros campos (mod10)
    if (linhaOriginal.length === 47) {
        const c1 = linhaOriginal.slice(0, 9);  // 9 dígitos + DV em pos 10
        const dv1 = Number(linhaOriginal[9]);
        if (mod10(c1) !== dv1) { erros.push('DV campo 1 inválido'); valida = false; }

        const c2 = linhaOriginal.slice(10, 20);
        const dv2 = Number(linhaOriginal[20]);
        if (mod10(c2) !== dv2) { erros.push('DV campo 2 inválido'); valida = false; }

        const c3 = linhaOriginal.slice(21, 31);
        const dv3 = Number(linhaOriginal[31]);
        if (mod10(c3) !== dv3) { erros.push('DV campo 3 inválido'); valida = false; }
    }

    return {
        valida,
        tipo: 'bancario',
        codigoBarras: codBarras,
        bancoCodigo,
        moeda,
        valor,
        vencimento,
        erros,
    };
}

/**
 * Banco brasileiro pelo código de 3 dígitos (compilação parcial — os mais comuns).
 * Lista pode ser estendida; valores não mapeados retornam o próprio código.
 */
const BANCOS: Record<string, string> = {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '041': 'Banrisul',
    '070': 'BRB',
    '077': 'Inter',
    '104': 'Caixa Econômica Federal',
    '136': 'Unicred',
    '212': 'Banco Original',
    '237': 'Bradesco',
    '260': 'Nu Pagamentos',
    '290': 'PagSeguro',
    '323': 'Mercado Pago',
    '336': 'C6 Bank',
    '341': 'Itaú',
    '380': 'PicPay',
    '422': 'Safra',
    '655': 'Votorantim',
    '745': 'Citibank',
    '748': 'Sicredi',
    '756': 'Sicoob',
};

export function nomeBanco(codigo?: string): string | undefined {
    if (!codigo) return undefined;
    const padded = codigo.padStart(3, '0');
    return BANCOS[padded] ?? `Banco ${padded}`;
}

/**
 * Calcula confidence score (0-100) de uma extração com base em quantos campos
 * críticos foram preenchidos e se a validação FEBRABAN passou.
 */
export function calcularConfidence(parsed: LinhaDigitavelParsed): number {
    let score = 0;
    if (parsed.codigoBarras) score += 30;
    if (parsed.valida) score += 30;
    if (parsed.valor && parsed.valor > 0) score += 20;
    if (parsed.vencimento) score += 15;
    if (parsed.bancoCodigo) score += 5;
    return Math.min(100, score);
}
