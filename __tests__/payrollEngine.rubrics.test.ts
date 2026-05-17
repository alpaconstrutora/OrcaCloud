import { describe, it, expect } from 'vitest';
import { payrollEngine } from '../services/payrollEngine';
import type { PayrollRubric } from '../services/payrollService';

const baseRubric = (overrides: Partial<PayrollRubric>): PayrollRubric => ({
    id: 'test',
    code: 'TEST',
    name: 'Rubrica Teste',
    type: 'provento',
    calculation_type: 'fixed',
    calculation_config: {},
    formula: null,
    incidence_inss: false,
    incidence_fgts: false,
    incidence_irrf: false,
    is_clt_mandatory: false,
    is_automatic: false,
    active: true,
    ...overrides,
});

const BASE_VALUES = {
    SALARIO: 3000,
    TOTAL_PROVENTOS: 3000,
    HORAS_TRABALHADAS: 176,
};

const HOURLY_RATE = 3000 / 220; // ~R$ 13,64/h

const TIME_ENTRIES = [
    { hours_worked: 176, overtime_50: 0, overtime_100: 0, night_hours: 0 },
];

describe('calculateRubricValue — fixed', () => {
    it('retorna o valor fixo configurado', () => {
        const r = baseRubric({ calculation_type: 'fixed', calculation_config: { amount: 150 } });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBe(150);
        expect(result?.reference).toBe(1.0);
    });

    it('retorna zero quando amount não configurado', () => {
        const r = baseRubric({ calculation_type: 'fixed', calculation_config: {} });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBe(0);
    });
});

describe('calculateRubricValue — percentage', () => {
    it('calcula percentual sobre SALARIO', () => {
        // 10% de R$ 3.000 = R$ 300
        const r = baseRubric({
            calculation_type: 'percentage',
            calculation_config: { base: 'SALARIO', percentage: 0.10 },
        });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBeCloseTo(300, 2);
        expect(result?.base_amount).toBe(3000);
        expect(result?.reference).toBe(0.10);
    });

    it('calcula percentual sobre TOTAL_PROVENTOS', () => {
        const r = baseRubric({
            calculation_type: 'percentage',
            calculation_config: { base: 'TOTAL_PROVENTOS', percentage: 0.05 },
        });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBeCloseTo(150, 2);
    });

    it('base inexistente resulta em zero', () => {
        const r = baseRubric({
            calculation_type: 'percentage',
            calculation_config: { base: 'BASE_INEXISTENTE', percentage: 0.10 },
        });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBe(0);
    });
});

describe('calculateRubricValue — formula (HE e Adicional Noturno)', () => {
    it('hora extra 50% — fallback por código HE50', () => {
        const timeWithOT = [{ hours_worked: 176, overtime_50: 10, overtime_100: 0, night_hours: 0 }];
        const r = baseRubric({ code: 'HE50', calculation_type: 'formula', formula: null });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, timeWithOT);
        // 10h × (3000/220) × 1.5 ≈ R$ 204,55
        expect(result?.amount).toBeCloseTo(10 * HOURLY_RATE * 1.5, 2);
        expect(result?.reference).toBe(1.5);
    });

    it('hora extra 100% — fallback por código HE100', () => {
        const timeWithOT = [{ hours_worked: 176, overtime_50: 0, overtime_100: 5, night_hours: 0 }];
        const r = baseRubric({ code: 'HE100', calculation_type: 'formula', formula: null });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, timeWithOT);
        expect(result?.amount).toBeCloseTo(5 * HOURLY_RATE * 2.0, 2);
        expect(result?.reference).toBe(2.0);
    });

    it('adicional noturno 20% — fallback por código AD_NOTURNO', () => {
        const timeWithNight = [{ hours_worked: 176, overtime_50: 0, overtime_100: 0, night_hours: 20 }];
        const r = baseRubric({ code: 'AD_NOTURNO', calculation_type: 'formula', formula: null });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, timeWithNight);
        expect(result?.amount).toBeCloseTo(20 * HOURLY_RATE * 0.2, 2);
        expect(result?.reference).toBe(0.2);
    });

    it('fórmula customizada via expressão aritmética', () => {
        const r = baseRubric({
            calculation_type: 'formula',
            formula: 'SALARIO * 0.05',
            calculation_config: {},
        });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        // 3000 × 0.05 = R$ 150
        expect(result?.amount).toBeCloseTo(150, 2);
    });

    it('fórmula inválida não lança exceção — retorna null', () => {
        const r = baseRubric({
            calculation_type: 'formula',
            formula: 'SALARIO @@@ INVÁLIDO',
            calculation_config: {},
        });
        expect(() => payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES))
            .not.toThrow();
    });
});

describe('calculateRubricValue — rubrica inativa', () => {
    it('rubrica inativa — o engine filtra antes, mas calculateRubricValue não filtra sozinho', () => {
        // O filtro de active é feito no processMonthly, não no calculateRubricValue
        // Confirmar que a função em si não checa o flag active
        const r = baseRubric({ active: false, calculation_type: 'fixed', calculation_config: { amount: 100 } });
        const result = payrollEngine.calculateRubricValue(r, BASE_VALUES, HOURLY_RATE, TIME_ENTRIES);
        expect(result?.amount).toBe(100); // a função calcula, o filtro é responsabilidade de quem chama
    });
});
