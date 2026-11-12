import { describe, it, expect } from 'vitest';
import { resumoDosComparaveis, posicaoDoPreco, ImovibComparable } from '../utils/imovibMercado';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy, instancia } from './fixtures/imovibEstudos';

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
        expect(r.mediaDoPreco).toBe('ponderada');
    });

    it('VSO de cada um SOBRE O ESTOQUE (a definição da curva VSO, decisão de 12/11): 1 − (1 − vendidas/total)^(1/meses)', () => {
        const vso = (f: number, m: number) => (1 - Math.pow(1 - f, 1 / m)) * 100;
        const r = resumoDosComparaveis([
            comp({ id: 'a', total_units: 100, sold_units: 40, launch_date: '2026-03-15', price_sqm: 10_000 }),
            comp({ id: 'b', total_units: 200, sold_units: 60, launch_date: '2026-08-15', price_sqm: 10_000 }),
        ], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo((vso(0.4, 10) + vso(0.3, 5)) / 2, 9);
        expect(r.estoque).toBe(200);
    });

    it('a curva VSO com a VSO do comparável vende o mesmo que ele vendeu: 80 de 100 em 12 meses dá 12,55%', () => {
        const r = resumoDosComparaveis([comp({ total_units: 100, sold_units: 80, launch_date: '2026-01-15' })], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo(12.55, 2);
        expect(1 - Math.pow(1 - r.vsoMediaMensal! / 100, 12)).toBeCloseTo(0.8, 9);
    });

    it('lançamento no futuro e empreendimento esgotado ficam fora da VSO, e o resumo conta quantos', () => {
        const r = resumoDosComparaveis([
            comp({ id: 'a', total_units: 100, sold_units: 40, launch_date: '2026-03-15' }),
            comp({ id: 'b', total_units: 200, sold_units: 60, launch_date: '2027-03-01' }), // pré-lançamento
            comp({ id: 'c', total_units: 50, sold_units: 50, launch_date: '2026-01-01' }), // esgotado
        ], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo((1 - Math.pow(0.6, 1 / 10)) * 100, 9);
        expect(r.foraDaVso).toEqual({ lancamentoFuturo: 1, esgotado: 1 });
    });

    it('sem data de lançamento ou sem total: fora da VSO e dentro do preço (média simples quando falta o total)', () => {
        const r = resumoDosComparaveis([
            comp({ id: 'a', total_units: 100, sold_units: 40, launch_date: '2026-03-15', price_sqm: 10_000 }),
            comp({ id: 'b', total_units: 300, sold_units: 30, price_sqm: 12_000 }), // sem lançamento
            comp({ id: 'c', price_sqm: 14_000 }), // sem total
        ], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo((1 - Math.pow(0.6, 1 / 10)) * 100, 9);
        expect(r.precoM2Medio).toBe(12_000);
        expect(r.mediaDoPreco).toBe('simples');
    });

    it('lista vazia: n = 0 e nulos', () => {
        expect(resumoDosComparaveis([], HOJE)).toEqual({ n: 0, precoM2Medio: null, mediaDoPreco: null, vsoMediaMensal: null, estoque: 0, foraDaVso: { lancamentoFuturo: 0, esgotado: 0 } });
    });

    it('lançamento no mês atual conta como 1 mês (não divide por zero)', () => {
        const r = resumoDosComparaveis([comp({ total_units: 100, sold_units: 10, launch_date: '2027-01-02' })], HOJE);
        expect(r.vsoMediaMensal).toBeCloseTo(10, 9); // 1 mês: 1 − 0,9 = 10%
    });
});

describe('7.1 — posicaoDoPreco', () => {
    it('R$ 12.650 contra média de R$ 11.500 dá +10%; abaixo dá negativo; sem média, nulo', () => {
        const resumo = { n: 2, precoM2Medio: 11_500, mediaDoPreco: 'ponderada' as const, vsoMediaMensal: null, estoque: 0, foraDaVso: { lancamentoFuturo: 0, esgotado: 0 } };
        expect(posicaoDoPreco(12_650, resumo)).toBeCloseTo(10, 9);
        expect(posicaoDoPreco(10_350, resumo)).toBeCloseTo(-10, 9);
        expect(posicaoDoPreco(12_650, { ...resumo, precoM2Medio: null })).toBeNull();
    });
});

describe('7.1 — área privativa vendável no motor (posição do preço)', () => {
    it('fora as unidades PERMUTADO do espelho e as tipologias não vendáveis: VGV ÷ área = preço/m²', () => {
        const espelho = Array.from({ length: 40 }, (_, i) => instancia(`u${i}`, 'b1', 700_000, i < 8 ? 'PERMUTADO' : 'DISPONÍVEL'));
        const s = baseStudy({ unit_instances: espelho });
        s.blocks[0].units.push({ id: 'z', quantity: 1, private_area: 50, common_area: 0, is_vendavel: false });
        const r = computeImovibMath(s);
        expect(r.areaPrivativaVendavel).toBe(32 * 70);
        expect(r.vgvBase / r.areaPrivativaVendavel).toBe(10_000);
    });
});
