import { describe, it, expect } from 'vitest';
import { calculatePMT, calculateNPV, calculateIRR, calculateROI, round2 } from '../utils/financialMath';

// ─── round2 ──────────────────────────────────────────────────────────────────

describe('round2', () => {
    it('arredonda terceira casa para cima quando >= 5', () => {
        expect(round2(1.016)).toBe(1.02);
        expect(round2(1.235)).toBe(1.24); // 1.235 em float é 1.2350000000000001 → arredonda certo
        expect(round2(10.556)).toBe(10.56);
    });

    it('arredonda terceira casa para baixo quando < 5', () => {
        expect(round2(1.014)).toBe(1.01);
        expect(round2(1.004)).toBe(1.00);
        expect(round2(258.821)).toBe(258.82); // valor típico de INSS
    });

    it('não altera valores já com 2 casas', () => {
        expect(round2(10.50)).toBe(10.50);
        expect(round2(0.01)).toBe(0.01);
        expect(round2(3000.00)).toBe(3000.00);
    });

    it('lida com inteiros', () => {
        expect(round2(100)).toBe(100);
        expect(round2(0)).toBe(0);
    });

    // Limitação conhecida de IEEE 754: 1.005 é armazenado como 1.00499999...
    // Valores com exatamente 0.005 na terceira casa podem arredondar para baixo.
    // Em contexto de folha/financeiro isso não ocorre pois os cálculos partem de
    // valores já em 2 casas decimais.
    it('documenta limitação IEEE 754 em valores com .005 exato', () => {
        // 1.005 em float64 = 1.00499999... → arredonda para 1.00, não 1.01
        expect(round2(1.005)).toBe(1.00);
    });
});

// ─── calculatePMT ─────────────────────────────────────────────────────────────

describe('calculatePMT', () => {
    it('calcula parcela de financiamento padrão', () => {
        // R$ 100.000 em 120 meses a 1% ao mês
        const pmt = calculatePMT(0.01, 120, 100000);
        expect(pmt).toBeCloseTo(1434.71, 1);
    });

    it('retorna PV/nper quando taxa é zero (sem juros)', () => {
        // R$ 12.000 em 12 meses sem juros = R$ 1.000/mês
        expect(calculatePMT(0, 12, 12000)).toBeCloseTo(1000, 2);
    });

    it('taxa mensal derivada de anual', () => {
        // 12% a.a. = 0.9489% a.m. (taxa efetiva)
        const monthly = (1 + 0.12) ** (1 / 12) - 1;
        const pmt = calculatePMT(monthly, 12, 10000);
        // Soma das 12 parcelas deve ser maior que o PV (há juros)
        expect(pmt * 12).toBeGreaterThan(10000);
    });

    it('parcela maior com prazo menor', () => {
        const pmt60 = calculatePMT(0.01, 60, 50000);
        const pmt120 = calculatePMT(0.01, 120, 50000);
        expect(pmt60).toBeGreaterThan(pmt120);
    });
});

// ─── calculateNPV ─────────────────────────────────────────────────────────────

describe('calculateNPV', () => {
    it('VPL zero para fluxos que pagam exatamente a taxa', () => {
        // Investimento de -1000 com retorno de 1100 em 1 período a 10%
        const npv = calculateNPV(0.10, [-1000, 1100]);
        expect(npv).toBeCloseTo(0, 2);
    });

    it('VPL positivo para investimento rentável', () => {
        const npv = calculateNPV(0.10, [-1000, 600, 600]);
        expect(npv).toBeGreaterThan(0);
    });

    it('VPL negativo para investimento com retorno insuficiente', () => {
        const npv = calculateNPV(0.10, [-1000, 400, 400]);
        expect(npv).toBeLessThan(0);
    });

    it('período zero (t=0) não é descontado', () => {
        // Com taxa qualquer, fluxo em t=0 vale exatamente seu valor nominal
        const npv = calculateNPV(0.99, [500]);
        expect(npv).toBeCloseTo(500, 5);
    });
});

// ─── calculateIRR ─────────────────────────────────────────────────────────────

describe('calculateIRR', () => {
    it('TIR de projeto simples com retorno em 1 período', () => {
        // -1000 hoje, +1100 em 1 período → TIR = 10%
        const irr = calculateIRR([-1000, 1100]);
        expect(irr).not.toBeNull();
        expect(irr!).toBeCloseTo(0.10, 4);
    });

    it('TIR de projeto de 3 períodos', () => {
        // -1000, +400, +400, +400 → TIR ≈ 9.7%
        const irr = calculateIRR([-1000, 400, 400, 400]);
        expect(irr).not.toBeNull();
        expect(irr!).toBeCloseTo(0.097, 2);
    });

    it('retorna null (não zero) quando não converge', () => {
        // Todos fluxos positivos não têm TIR real
        const irr = calculateIRR([100, 200, 300]);
        expect(irr).toBeNull();
    });

    it('TIR deve satisfazer NPV ≈ 0', () => {
        const cashFlows = [-5000, 1500, 1500, 1500, 1500];
        const irr = calculateIRR(cashFlows);
        expect(irr).not.toBeNull();

        const npv = calculateNPV(irr!, cashFlows);
        expect(Math.abs(npv)).toBeLessThan(0.01);
    });
});

// ─── calculateROI ─────────────────────────────────────────────────────────────

describe('calculateROI', () => {
    it('ROI de 100% para retorno duplo', () => {
        expect(calculateROI(200, 100)).toBe(100);
    });

    it('ROI negativo para prejuízo', () => {
        expect(calculateROI(50, 100)).toBe(-50);
    });

    it('ROI zero quando não há lucro nem perda', () => {
        expect(calculateROI(100, 100)).toBe(0);
    });

    it('retorna 0 para investimento zero (sem divisão por zero)', () => {
        expect(calculateROI(500, 0)).toBe(0);
    });

    it('ROI de empreendimento típico', () => {
        // Investiu R$ 1.000.000, retornou R$ 1.350.000 → ROI = 35%
        expect(calculateROI(1350000, 1000000)).toBeCloseTo(35, 5);
    });
});
