import { describe, it, expect } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import type { INSSBracket } from '../services/fiscalService';

// Tabela INSS 2024 — Progressiva (RFB Portaria MPS 914/2024)
const INSS_2024: INSSBracket[] = [
    { id: '1', min_value: 0,       max_value: 1412.00,  rate: 0.075, effective_date: '2024-01-01' },
    { id: '2', min_value: 1412.00, max_value: 2666.68,  rate: 0.09,  effective_date: '2024-01-01' },
    { id: '3', min_value: 2666.68, max_value: 4000.03,  rate: 0.12,  effective_date: '2024-01-01' },
    { id: '4', min_value: 4000.03, max_value: 7786.02,  rate: 0.14,  effective_date: '2024-01-01' },
];

describe('calculateINSS — Método Progressivo', () => {

    it('salário mínimo 2024 (R$ 1.412,00) — faixa única 7.5%', () => {
        // 1412 × 7.5% = R$ 105,90
        const inss = payrollEngine.calculateINSS(1412, INSS_2024);
        expect(inss).toBeCloseTo(105.90, 2);
    });

    it('salário R$ 2.000 — abrange 2 faixas', () => {
        // Faixa 1: (1412 - 0) × 7.5%    = 105.90
        // Faixa 2: (2000 - 1412) × 9%   = 52.92
        // Total = R$ 158,82
        const inss = payrollEngine.calculateINSS(2000, INSS_2024);
        expect(inss).toBeCloseTo(158.82, 2);
    });

    it('salário R$ 3.000 — abrange 3 faixas', () => {
        // Faixa 1: 1412.00 × 7.5%               = 105.90
        // Faixa 2: (2666.68 - 1412) × 9%        = 112.921
        // Faixa 3: (3000 - 2666.68) × 12%       = 39.998
        // Total ≈ R$ 258,82
        const inss = payrollEngine.calculateINSS(3000, INSS_2024);
        expect(inss).toBeCloseTo(258.82, 1);
    });

    it('salário R$ 5.000 — abrange 4 faixas', () => {
        // Faixa 1: 1412.00 × 7.5%               = 105.90
        // Faixa 2: (2666.68 - 1412) × 9%        = 112.921
        // Faixa 3: (4000.03 - 2666.68) × 12%    = 160.002
        // Faixa 4: (5000 - 4000.03) × 14%       = 139.996
        // Total ≈ R$ 518,82
        const inss = payrollEngine.calculateINSS(5000, INSS_2024);
        expect(inss).toBeCloseTo(518.82, 0);
    });

    it('salário acima do teto (R$ 7.786,02) — capped na última faixa', () => {
        const inssTeto = payrollEngine.calculateINSS(7786.02, INSS_2024);
        const inssAcima = payrollEngine.calculateINSS(9000, INSS_2024);
        // Acima do teto não deve aumentar o INSS (sem faixa adicional)
        expect(inssAcima).toBeCloseTo(inssTeto, 2);
    });

    it('base zero — retorna zero', () => {
        expect(payrollEngine.calculateINSS(0, INSS_2024)).toBe(0);
    });

    it('base negativa — retorna zero', () => {
        expect(payrollEngine.calculateINSS(-100, INSS_2024)).toBe(0);
    });

    it('tabela vazia — retorna zero e não lança exceção', () => {
        expect(payrollEngine.calculateINSS(3000, [])).toBe(0);
    });

    it('INSS sempre menor que a base de cálculo', () => {
        const bases = [1412, 2000, 3000, 5000, 7786.02];
        bases.forEach(base => {
            expect(payrollEngine.calculateINSS(base, INSS_2024)).toBeLessThan(base);
        });
    });
});
