import { describe, it, expect } from 'vitest';
import { resumoDosComparaveis, posicaoDoPreco, ImovibComparable } from '../utils/imovibMercado';

/** Comparáveis de mercado (item 7.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const comp = (over: Partial<ImovibComparable>): ImovibComparable => ({ id: 'c', study_id: 'e', name: 'Concorrente', ...over });
const HOJE = '2027-01-15';

describe('7.1 — resumoDosComparaveis', () => {
    it('preço médio ponderado pelo total de unidades: 100 a R$ 10.000 e 300 a R$ 12.000 dão R$ 11.500', () => {
        const r = resumoDosComparaveis([
            comp({ id: 'a', total_units: 100, price_sqm: 10_000 }),
            comp({ id: 'b', total_units: 300, price_sqm: 12_000 }),
        ], HOJE);
        expect(r.n).toBe(2);
        expect(r.precoM2Medio).toBe(11_500);
    });

    it('VSO de cada um = vendidas ÷ total ÷ meses desde o lançamento; a média é a simples, em % ao mês', () => {
        const r = resumoDosComparaveis([
            // 40 de 100 em 10 meses = 4% a.m.; 60 de 200 em 5 meses = 6% a.m.
            comp({ id: 'a', total_units: 100, sold_units: 40, launch_date: '2026-03-15', price_sqm: 10_000 }),
            comp({ id: 'b', total_units: 200, sold_units: 60, launch_date: '2026-08-15', price_sqm: 10_000 }),
        ], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo(5, 9);
        expect(r.estoque).toBe(200);
    });

    it('sem data de lançamento ou sem total: fora da VSO e dentro do preço (média simples quando falta o total)', () => {
        const r = resumoDosComparaveis([
            comp({ id: 'a', total_units: 100, sold_units: 40, launch_date: '2026-03-15', price_sqm: 10_000 }),
            comp({ id: 'b', total_units: 300, sold_units: 30, price_sqm: 12_000 }), // sem lançamento
            comp({ id: 'c', price_sqm: 14_000 }), // sem total
        ], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo(4, 9);
        expect(r.precoM2Medio).toBe(12_000);
    });

    it('lista vazia: n = 0 e nulos', () => {
        expect(resumoDosComparaveis([], HOJE)).toEqual({ n: 0, precoM2Medio: null, vsoMediaMensal: null, estoque: 0 });
    });

    it('lançamento no mês atual conta como 1 mês (não divide por zero)', () => {
        const r = resumoDosComparaveis([comp({ total_units: 100, sold_units: 10, launch_date: '2027-01-02' })], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo(10, 9);
    });
});

describe('7.1 — posicaoDoPreco', () => {
    it('R$ 12.650 contra média de R$ 11.500 dá +10%; abaixo dá negativo; sem média, nulo', () => {
        const resumo = { n: 2, precoM2Medio: 11_500, vsoMediaMensal: null, estoque: 0 };
        expect(posicaoDoPreco(12_650, resumo)).toBeCloseTo(10, 9);
        expect(posicaoDoPreco(10_350, resumo)).toBeCloseTo(-10, 9);
        expect(posicaoDoPreco(12_650, { ...resumo, precoM2Medio: null })).toBeNull();
    });
});
