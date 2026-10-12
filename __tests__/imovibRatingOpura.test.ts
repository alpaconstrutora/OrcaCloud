import { describe, it, expect } from 'vitest';
import { calcularRatingOpura } from '../components/ImovibEsgReportForm';

/**
 * Item 5.5 do plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md:
 * a barreira do rating é a TMA do estudo, não mais 12% a.a. fixo.
 */
describe('calcularRatingOpura — barreira = TMA do estudo', () => {
    it('TMA de 15%: TIR de 14% fica abaixo da barreira (C) — com os 12% fixos seria BBB', () => {
        expect(calcularRatingOpura(14, 15, 3).rating).toBe('C');
        expect(calcularRatingOpura(14, 12, 3).rating).toBe('BBB');
    });

    it('faixas sobem com a TMA: TMA 15% → BBB a partir de 15, A/AA acima de 19, AA/AAA acima de 23', () => {
        expect(calcularRatingOpura(15, 15, 3).rating).toBe('BBB');
        expect(calcularRatingOpura(15, 15, 2).rating).toBe('BB');
        expect(calcularRatingOpura(19.5, 15, 3).rating).toBe('A');
        expect(calcularRatingOpura(19.5, 15, 3.5).rating).toBe('AA');
        expect(calcularRatingOpura(23.5, 15, 3).rating).toBe('AA');
        expect(calcularRatingOpura(23.5, 15, 4).rating).toBe('AAA');
    });

    it('sem TIR (NaN) ou TIR ≤ 0: N/A', () => {
        expect(calcularRatingOpura(NaN, 12, 5).rating).toBe('N/A');
        expect(calcularRatingOpura(0, 12, 5).rating).toBe('N/A');
        expect(calcularRatingOpura(-3, 12, 5).rating).toBe('N/A');
    });
});
