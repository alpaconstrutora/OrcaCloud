import { describe, it, expect } from 'vitest';
import { calculateINSS, calculateIRRF } from '../lib/payrollCalc';
import type { INSSBracket, IRRFBracket } from '../services/fiscalService';

const INSS_2024: INSSBracket[] = [
    { min_value: 0,       max_value: 1412.00,  rate: 0.075, deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 1412.00, max_value: 2666.68,  rate: 0.09,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2666.68, max_value: 4000.03,  rate: 0.12,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 4000.03, max_value: 7786.02,  rate: 0.14,  deduction: 0, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

const IRRF_2024: IRRFBracket[] = [
    { min_value: 0,       max_value: 2112.00,  rate: 0,     deduction: 0,      valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2112.00, max_value: 2826.65,  rate: 0.075, deduction: 158.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 2826.65, max_value: 3751.05,  rate: 0.15,  deduction: 370.40, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 3751.05, max_value: 4664.68,  rate: 0.225, deduction: 651.73, valid_from: '2024-01-01', valid_to: '2024-12-31' },
    { min_value: 4664.68, max_value: null,      rate: 0.275, deduction: 884.96, valid_from: '2024-01-01', valid_to: '2024-12-31' },
];

// ─── calculateINSS ────────────────────────────────────────────────────────────

describe('calculateINSS (lib/payrollCalc)', () => {
    it('salário mínimo R$ 1.412 — faixa única 7.5%', () => {
        expect(calculateINSS(1412, INSS_2024)).toBeCloseTo(105.90, 2);
    });

    it('R$ 2.000 — duas faixas: 105.90 + 52.92 = 158.82', () => {
        // Faixa 1: 1412 × 7.5% = 105.90
        // Faixa 2: (2000 - 1412) × 9% = 52.92
        expect(calculateINSS(2000, INSS_2024)).toBeCloseTo(158.82, 2);
    });

    it('R$ 3.000 — três faixas', () => {
        // Faixa 1: 105.90 | Faixa 2: 112.921 | Faixa 3: (3000-2666.68)×12% = 39.998
        expect(calculateINSS(3000, INSS_2024)).toBeCloseTo(258.82, 1);
    });

    it('R$ 5.000 — quatro faixas', () => {
        expect(calculateINSS(5000, INSS_2024)).toBeCloseTo(518.82, 0);
    });

    it('acima do teto: INSS igual ao do teto (sem faixa adicional)', () => {
        const teto = calculateINSS(7786.02, INSS_2024);
        expect(calculateINSS(9000, INSS_2024)).toBeCloseTo(teto, 2);
    });

    it('base zero retorna zero', () => {
        expect(calculateINSS(0, INSS_2024)).toBe(0);
    });

    it('base negativa retorna zero', () => {
        expect(calculateINSS(-500, INSS_2024)).toBe(0);
    });

    it('tabela vazia retorna zero', () => {
        expect(calculateINSS(3000, [])).toBe(0);
    });

    it('INSS sempre menor que a base', () => {
        [1412, 2000, 3000, 5000, 7786.02].forEach(base => {
            expect(calculateINSS(base, INSS_2024)).toBeLessThan(base);
        });
    });
});

// ─── calculateIRRF ────────────────────────────────────────────────────────────

describe('calculateIRRF (lib/payrollCalc)', () => {
    it('base isenta (R$ 2.000) retorna zero', () => {
        expect(calculateIRRF(2000, IRRF_2024)).toBe(0);
    });

    it('base R$ 2.500 — faixa 7.5%: 2500×7.5% − 158.40 = 29.10', () => {
        expect(calculateIRRF(2500, IRRF_2024)).toBeCloseTo(29.10, 1);
    });

    it('base R$ 3.200 — faixa 15%: 3200×15% − 370.40 = 109.60', () => {
        expect(calculateIRRF(3200, IRRF_2024)).toBeCloseTo(109.60, 1);
    });

    it('base R$ 5.000 — faixa 27.5%: 5000×27.5% − 884.96 = 490.04', () => {
        expect(calculateIRRF(5000, IRRF_2024)).toBeCloseTo(490.04, 1);
    });

    it('IRRF nunca negativo', () => {
        [1000, 1500, 2000, 2112, 2113].forEach(base => {
            expect(calculateIRRF(base, IRRF_2024)).toBeGreaterThanOrEqual(0);
        });
    });

    it('base zero retorna zero', () => {
        expect(calculateIRRF(0, IRRF_2024)).toBe(0);
    });

    it('tabela vazia retorna zero', () => {
        expect(calculateIRRF(5000, [])).toBe(0);
    });
});
