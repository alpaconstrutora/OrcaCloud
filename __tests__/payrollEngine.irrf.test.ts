import { describe, it, expect } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import type { IRRFBracket } from '../services/fiscalService';

// Tabela IRRF 2026 — mesmos limites de 2025 (IN RFB 2.216/2024), isenção ampliada
const IRRF_2026: IRRFBracket[] = [
    { id: '1', min_value: 0,        max_value: 2428.80, rate: 0,     deduction: 0,      effective_date: '2026-01-01' },
    { id: '2', min_value: 2428.81,  max_value: 2826.65, rate: 0.075, deduction: 182.16, effective_date: '2026-01-01' },
    { id: '3', min_value: 2826.66,  max_value: 3751.05, rate: 0.15,  deduction: 394.16, effective_date: '2026-01-01' },
    { id: '4', min_value: 3751.06,  max_value: 4664.68, rate: 0.225, deduction: 675.49, effective_date: '2026-01-01' },
    { id: '5', min_value: 4664.69,  max_value: Infinity, rate: 0.275, deduction: 908.73, effective_date: '2026-01-01' },
];

// Tabela IRRF 2024 — Tabela Prática (RFB — vigência Jan/2024)
// Base de cálculo = salário bruto - INSS - dependentes (R$ 189,59/dep)
const IRRF_2024: IRRFBracket[] = [
    { id: '1', min_value: 0,        max_value: 2259.20, rate: 0,     deduction: 0,      effective_date: '2024-01-01' },
    { id: '2', min_value: 2259.21,  max_value: 2826.65, rate: 0.075, deduction: 169.44, effective_date: '2024-01-01' },
    { id: '3', min_value: 2826.66,  max_value: 3751.05, rate: 0.15,  deduction: 381.44, effective_date: '2024-01-01' },
    { id: '4', min_value: 3751.06,  max_value: 4664.68, rate: 0.225, deduction: 662.77, effective_date: '2024-01-01' },
    { id: '5', min_value: 4664.68,  max_value: Infinity, rate: 0.275, deduction: 896.00, effective_date: '2024-01-01' },
];

describe('calculateIRRF — Tabela Prática', () => {

    it('base isenta (≤ R$ 2.259,20) — retorna zero', () => {
        expect(payrollEngine.calculateIRRF(2259.20, IRRF_2024)).toBe(0);
        expect(payrollEngine.calculateIRRF(1500, IRRF_2024)).toBe(0);
        expect(payrollEngine.calculateIRRF(0, IRRF_2024)).toBe(0);
    });

    it('faixa 7.5% — R$ 2.500 líquido de INSS', () => {
        // 2500 × 7.5% - 169.44 = 187.50 - 169.44 = R$ 18,06
        const irrf = payrollEngine.calculateIRRF(2500, IRRF_2024);
        expect(irrf).toBeCloseTo(18.06, 2);
    });

    it('faixa 15% — R$ 3.200 líquido de INSS', () => {
        // 3200 × 15% - 381.44 = 480 - 381.44 = R$ 98,56
        const irrf = payrollEngine.calculateIRRF(3200, IRRF_2024);
        expect(irrf).toBeCloseTo(98.56, 2);
    });

    it('faixa 22.5% — R$ 4.000 líquido de INSS', () => {
        // 4000 × 22.5% - 662.77 = 900 - 662.77 = R$ 237,23
        const irrf = payrollEngine.calculateIRRF(4000, IRRF_2024);
        expect(irrf).toBeCloseTo(237.23, 2);
    });

    it('faixa 27.5% — R$ 6.000 líquido de INSS', () => {
        // 6000 × 27.5% - 896.00 = 1650 - 896 = R$ 754,00
        const irrf = payrollEngine.calculateIRRF(6000, IRRF_2024);
        expect(irrf).toBeCloseTo(754.00, 2);
    });

    it('base negativa — retorna zero', () => {
        expect(payrollEngine.calculateIRRF(-100, IRRF_2024)).toBe(0);
    });

    it('tabela vazia — retorna zero e não lança exceção', () => {
        expect(payrollEngine.calculateIRRF(5000, [])).toBe(0);
    });

    it('IRRF sempre positivo quando há imposto', () => {
        const irrf = payrollEngine.calculateIRRF(5000, IRRF_2024);
        expect(irrf).toBeGreaterThan(0);
    });

    it('IRRF cresce com a base (alíquota progressiva via tabela prática)', () => {
        const irrf1 = payrollEngine.calculateIRRF(3000, IRRF_2024);
        const irrf2 = payrollEngine.calculateIRRF(5000, IRRF_2024);
        expect(irrf2).toBeGreaterThan(irrf1);
    });
});

// ─── applyIRRFReducer — Lei 9.250, art. 3º-A (Lei 15.270/2025) ───────────────
// Redução mensal 2026 sobre o RENDIMENTO tributável (2º argumento):
//   até R$ 5.000 → até R$ 312,89; R$ 5.000,01–7.350 → 978,62 − 0,133145 × rendimento;
//   limitada ao imposto (§ 1º). Até 11/10/2026 o código usava uma âncora de
//   R$ 466,27 que zerava tudo até R$ 5.000 — sem amparo no texto da lei.

describe('applyIRRFReducer — redutor 2026', () => {

    it('base ≤ R$5.000 — IRRF zerado pelo redutor', () => {
        // base 4000: rawIRRF = 4000×22,5% − 675,49 = 224,51 → zerado
        const raw = payrollEngine.calculateIRRF(4000, IRRF_2026);
        expect(payrollEngine.applyIRRFReducer(raw, 4000)).toBe(0);
    });

    it('rendimento = R$5.000 — redução de até R$ 312,89 (não zera imposto maior que isso)', () => {
        // imposto 466,27 (sem dedução nenhuma) − 312,89 = 153,38
        const raw = payrollEngine.calculateIRRF(5000, IRRF_2026);
        expect(raw).toBeCloseTo(466.27, 2);
        expect(payrollEngine.applyIRRFReducer(raw, 5000)).toBeCloseTo(153.38, 2);
    });

    it('rendimento = R$6.000 — redução 978,62 − 0,133145 × 6000 = 179,75', () => {
        // imposto 741,27 − 179,75 = 561,52
        const raw = payrollEngine.calculateIRRF(6000, IRRF_2026);
        expect(raw).toBeCloseTo(741.27, 2);
        const final = payrollEngine.applyIRRFReducer(raw, 6000);
        expect(final).toBeCloseTo(561.52, 2);
    });

    it('base = R$7.350 — redutor zerado (limite superior da faixa de transição)', () => {
        // rawIRRF = 7350×27,5% − 908,73 = 1112,52; redutor = 466,27×0/2350 = 0
        const raw = payrollEngine.calculateIRRF(7350, IRRF_2026);
        expect(payrollEngine.applyIRRFReducer(raw, 7350)).toBeCloseTo(raw, 2);
    });

    it('base > R$7.350 — sem redutor (IRRF integral)', () => {
        // rawIRRF = 8000×27,5% − 908,73 = 1291,27; sem redutor
        const raw = payrollEngine.calculateIRRF(8000, IRRF_2026);
        expect(payrollEngine.applyIRRFReducer(raw, 8000)).toBeCloseTo(raw, 2);
    });

    it('redutor não gera IRRF negativo (Math.max(0, ...))', () => {
        // Qualquer base na faixa isenta retorna 0
        expect(payrollEngine.applyIRRFReducer(0, 2000)).toBe(0);
    });

    it('IRRF 2026 é sempre menor ou igual ao IRRF pré-redutor para mesma base', () => {
        [3000, 4000, 5000, 6000, 7000, 7350, 8000, 10000].forEach(base => {
            const raw = payrollEngine.calculateIRRF(base, IRRF_2026);
            const final = payrollEngine.applyIRRFReducer(raw, base);
            expect(final).toBeLessThanOrEqual(raw);
            expect(final).toBeGreaterThanOrEqual(0);
        });
    });
});
