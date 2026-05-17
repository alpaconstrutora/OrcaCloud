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
export function calculateIRRF(base: number, brackets: IRRFBracket[]): number {
    if (base <= 0 || brackets.length === 0) return 0;

    const sorted = [...brackets].sort((a, b) => a.min_value - b.min_value);
    const range = [...sorted].reverse().find(b => base >= b.min_value);

    if (range && range.rate > 0) {
        return Math.max(0, (base * range.rate) - range.deduction);
    }

    return 0;
}
