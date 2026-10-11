import type { INSSBracket, IRRFBracket } from '../services/fiscalService';

/**
 * Cálculo progressivo de INSS por faixas — fonte única de verdade.
 * Usado por payrollEngine e payrollValidationService.
 */
export function calculateINSS(base: number, brackets: INSSBracket[]): number {
    if (base <= 0 || brackets.length === 0) return 0;

    let total = 0;
    const sorted = [...brackets].sort((a, b) => a.min_value - b.min_value);

    for (const bracket of sorted) {
        if (base > bracket.min_value) {
            const limit = bracket.max_value ?? Infinity;
            total += (Math.min(base, limit) - bracket.min_value) * bracket.rate;
            if (base <= limit) break;
        }
    }

    return total;
}

/** Arredonda para centavos. */
function centavos(v: number): number {
    return Math.round(v * 100) / 100;
}

/**
 * Redução mensal do IRPF a partir de 01/2026 — Lei 9.250/1995, art. 3º-A
 * (incluído pela Lei 15.270/2025), conferido no texto da lei em 11/10/2026:
 *   rendimentos tributáveis até R$ 5.000,00 → redução de até R$ 312,89;
 *   de R$ 5.000,01 a R$ 7.350,00 → R$ 978,62 − 0,133145 × rendimentos;
 *   acima de R$ 7.350,00 → sem redução (§ 2º).
 * A redução fica limitada ao imposto já calculado pela tabela e com as
 * deduções do art. 4º (§ 1º) — o resultado nunca é negativo.
 *
 * ⚠️ O segundo argumento é o RENDIMENTO TRIBUTÁVEL bruto do mês, NÃO a base
 * de cálculo depois das deduções. Até 11/10/2026 a folha usava a base e uma
 * âncora de R$ 466,27 que zerava tudo até R$ 5.000 — fórmula sem amparo na lei.
 */
export function aplicarRedutorIRRF2026(irrf: number, rendimentosTributaveis: number): number {
    const r = rendimentosTributaveis;
    const reducao = r <= 5000 ? 312.89
        // Sem arredondar no meio: só o imposto final é arredondado (por quem exibe/grava).
        : r <= 7350 ? Math.max(0, 978.62 - 0.133145 * r)
        : 0;
    return Math.max(0, irrf - reducao);
}

/**
 * Desconto simplificado mensal — Lei 9.250/1995, art. 4º, § 2º (Lei 14.663/2023):
 * "alternativamente às deduções de que trata o caput deste artigo, poderá ser
 * utilizado desconto simplificado mensal, correspondente a 25% do valor máximo
 * da faixa com alíquota zero da tabela progressiva mensal, caso seja mais
 * benéfico ao contribuinte". Vale a partir de 05/2023 (antes não existia).
 * O valor sai da própria tabela vigente — R$ 528,00 / 564,80 / 607,20 —, sem
 * constante no código.
 */
export function descontoSimplificadoMensal(brackets: IRRFBracket[], data: string): number {
    if (!data || data.slice(0, 10) < '2023-05-01') return 0;
    const isenta = brackets.find(b => Number(b.rate) === 0 && b.max_value != null);
    return isenta ? centavos(Number(isenta.max_value) * 0.25) : 0;
}

export interface IrrfMensal {
    /** Base de cálculo depois da maior dedução (legais × simplificado). */
    base: number;
    /** Dedução efetivamente usada. */
    deducao: number;
    /** Imposto final (com a redução de 2026+ quando cabe). Sem arredondar. */
    irrf: number;
}

/**
 * IRPF mensal retido na fonte — UMA conta para folha, pró-labore e aluguel:
 *   1. dedução = a maior entre as deduções legais do art. 4º (INSS, dependentes…)
 *      e o desconto simplificado mensal (§ 2º);
 *   2. imposto = tabela progressiva sobre (rendimentos − dedução);
 *   3. de 2026 em diante, redução do art. 3º-A sobre os RENDIMENTOS.
 * `data` (aaaa-mm-dd) decide se há desconto simplificado e redução.
 */
export function calcularIrrfMensal(
    rendimentosTributaveis: number,
    deducoesLegais: number,
    brackets: IRRFBracket[],
    data: string,
): IrrfMensal {
    const deducao = Math.max(deducoesLegais || 0, descontoSimplificadoMensal(brackets, data));
    const base = Math.max(0, rendimentosTributaveis - deducao);
    const bruto = calculateIRRF(base, brackets);
    const irrf = (data || '').slice(0, 10) >= '2026-01-01'
        ? aplicarRedutorIRRF2026(bruto, rendimentosTributaveis)
        : bruto;
    return { base, deducao, irrf };
}

/**
 * Cálculo de IRRF por tabela progressiva — fonte única de verdade.
 * Aplica alíquota da faixa correspondente menos a parcela a deduzir.
 */
export function calculateIRRF(base: number, brackets: IRRFBracket[]): number {
    if (base <= 0 || brackets.length === 0) return 0;

    const sorted = [...brackets].sort((a, b) => a.min_value - b.min_value);
    const range = [...sorted].reverse().find(b => base >= b.min_value);

    if (range && range.rate > 0) {
        return Math.max(0, (base * range.rate) - range.deduction);
    }

    return 0;
}
