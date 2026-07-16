import { describe, it, expect } from 'vitest';
import { simulatePayment } from '../services/salesPlanService';

// O motor e' puro e deterministico — testavel sem banco.
describe('simulatePayment — separacao de descontos (§5 do PRD)', () => {
    it('a vista sem desconto: VPL == preco, todos os descontos zero', () => {
        const r = simulatePayment({
            unitPrice: 450000, discountPct: 0, downPaymentPct: 100, monthlyInstallments: 0,
        });
        expect(r.totalValue).toBe(450000);
        expect(r.presentValue).toBe(450000);        // tudo no mes 0, sem desconto do tempo
        expect(r.nominalDiscount).toBe(0);
        expect(r.financialDiscount).toBe(0);
        expect(r.economicDiscount).toBe(0);
    });

    it('desconto comercial de 10% aparece como nominal', () => {
        const r = simulatePayment({
            unitPrice: 450000, discountPct: 10, downPaymentPct: 100, monthlyInstallments: 0,
        });
        expect(r.totalValue).toBe(405000);
        expect(r.nominalDiscount).toBe(45000);
        expect(r.nominalDiscountPct).toBe(10);
        expect(r.presentValue).toBe(405000);         // a vista: sem perda financeira
        expect(r.financialDiscount).toBe(0);
    });

    it('CASO-CHAVE: "sem desconto" em 120x sem correcao tem desconto ECONOMICO alto', () => {
        const r = simulatePayment({
            unitPrice: 450000, discountPct: 0, downPaymentPct: 0, monthlyInstallments: 120,
            correctionRateMonthly: 0, opportunityRateMonthly: 0.01,
        });
        expect(r.nominalDiscount).toBe(0);            // "sem desconto" no papel
        expect(r.financialDiscount).toBeGreaterThan(100000); // mas perde >R$100k de valor
        expect(r.economicDiscount).toBe(r.financialDiscount); // sem nominal, economico == financeiro
        expect(r.economicDiscountPct).toBeGreaterThan(20);
    });

    it('correcao == custo de capital zera a perda financeira', () => {
        const r = simulatePayment({
            unitPrice: 450000, discountPct: 0, downPaymentPct: 0, monthlyInstallments: 60,
            correctionRateMonthly: 0.01, opportunityRateMonthly: 0.01,
        });
        // Parcela corrigida a' mesma taxa do desconto -> VPL ~ totalValue.
        expect(Math.abs(r.financialDiscount)).toBeLessThan(1);
    });

    it('economico = nominal + financeiro', () => {
        const r = simulatePayment({
            unitPrice: 450000, discountPct: 5, downPaymentPct: 20, monthlyInstallments: 36,
            correctionRateMonthly: 0, opportunityRateMonthly: 0.008,
        });
        expect(r.economicDiscount).toBeCloseTo(r.nominalDiscount + r.financialDiscount, 1);
    });
});
