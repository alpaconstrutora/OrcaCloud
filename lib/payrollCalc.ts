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

/**
 * Cálculo de IRRF por tabela progressiva — fonte única de verdade.
 * Aplica alíquota da faixa correspondente menos a parcela a deduzir.
 */
/**
 * IN RFB 2.216/2024 — redutor mensal do IRRF a partir de 2026.
 * Base ≤ R$5.000: imposto zerado; R$5.000,01–R$7.350: redução proporcional linear.
 * Âncora: IRRF exato em R$5.000 = 5000×27,5% − 908,73 = R$466,27.
 *
 * Movido de `payrollEngine.applyIRRFReducer` (10/10/2026) sem mudar o corpo, para
 * o IRRF retido em aluguel (taxPayableService) usar a MESMA conta da folha.
 * A folha continua chamando pelo payrollEngine, que delega para cá.
 */
export function aplicarRedutorIRRF2026(irrf: number, base: number): number {
    if (base <= 5000) return 0;
    if (base > 7350) return irrf;
    const reducer = 466.27 * (7350 - base) / 2350;
    return Math.max(0, irrf - reducer);
}

export function calculateIRRF(base: number, brackets: IRRFBracket[]): number {
    if (base <= 0 || brackets.length === 0) return 0;

    const sorted = [...brackets].sort((a, b) => a.min_value - b.min_value);
    const range = [...sorted].reverse().find(b => base >= b.min_value);

    if (range && range.rate > 0) {
        return Math.max(0, (base * range.rate) - range.deduction);
    }

    return 0;
}
