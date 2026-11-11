import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { simularMonteCarlo, sortearTriangular } from '../utils/imovibMonteCarlo';
import { aplicarCenario, faixasDoMonteCarlo } from '../utils/imovibCenarios';
import { CHOQUES_PADRAO } from '../utils/imovibSensibilidade';
import { IMOVIB_CENARIOS_PADRAO } from '../constants/imovibDefaults';
import { baseStudy } from './fixtures/imovibEstudos';

/** Cenários e Monte Carlo (itens 3.3 e 3.4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const FAIXAS = { preco: { min: -10, moda: 0, max: 10 }, custo_obra: { min: -10, moda: 0, max: 15 } };

describe('3.3 — cenários', () => {
    it('cenário sem choques calcula igual ao estudo, e não altera o estudo', () => {
        const s = baseStudy();
        const antes = JSON.stringify(s);
        const x = aplicarCenario(s, {});
        expect(computeImovibMath(x.study, x.options).vpl).toBe(computeImovibMath(s).vpl);
        expect(JSON.stringify(s)).toBe(antes);
    });

    it('cenários padrão: pessimista < base < otimista no VPL', () => {
        const s = baseStudy();
        const [pess, otim] = IMOVIB_CENARIOS_PADRAO;
        const vpl = (c: { choques: Record<string, number> }) => { const x = aplicarCenario(s, c.choques); return computeImovibMath(x.study, x.options).vpl; };
        const base = computeImovibMath(s).vpl;
        expect(vpl(pess)).toBeLessThan(base);
        expect(vpl(otim)).toBeGreaterThan(base);
    });

    it('faixas do Monte Carlo: dos cenários salvos quando existem, senão ± o choque do tornado', () => {
        const [pess, otim] = IMOVIB_CENARIOS_PADRAO;
        const comCenarios = faixasDoMonteCarlo([pess, otim] as never, CHOQUES_PADRAO);
        expect(comCenarios.preco).toEqual({ min: -10, moda: 0, max: 5 });
        expect(comCenarios.prazo_obra).toEqual({ min: 0, moda: 0, max: 6 });
        expect(comCenarios.terreno).toBeUndefined();
        const semCenarios = faixasDoMonteCarlo([], CHOQUES_PADRAO);
        expect(semCenarios.terreno).toEqual({ min: -10, moda: 0, max: 10 });
        expect(Object.keys(semCenarios)).toHaveLength(8);
    });
});

describe('3.4 — Monte Carlo', () => {
    it('sorteio triangular: limites e moda', () => {
        const d = { min: -10, moda: 0, max: 20 };
        expect(sortearTriangular(d, 0)).toBeCloseTo(-10, 12);
        expect(sortearTriangular(d, 1)).toBeCloseTo(20, 12);
        expect(sortearTriangular(d, 1 / 3)).toBeCloseTo(0, 12);
        expect(sortearTriangular({ min: 5, moda: 5, max: 5 }, 0.7)).toBe(5);
    });

    it('a mesma semente repete o resultado; outra semente muda', () => {
        const s = baseStudy();
        const a = simularMonteCarlo(s, FAIXAS, 200, 42);
        const b = simularMonteCarlo(s, FAIXAS, 200, 42);
        const c = simularMonteCarlo(s, FAIXAS, 200, 43);
        expect(b).toEqual(a);
        expect(c.vpl.p50).not.toBe(a.vpl.p50);
    });

    it('faixas degeneradas: todo percentil é o valor do estudo', () => {
        const s = baseStudy();
        const r = simularMonteCarlo(s, { preco: { min: 0, moda: 0, max: 0 } }, 50, 1);
        const base = computeImovibMath(s);
        expect(r.vpl).toEqual({ p10: base.vpl, p50: base.vpl, p90: base.vpl });
        expect(r.tir!.p50).toBeCloseTo(base.annualIrr, 9);
        expect(r.histogramaVpl).toHaveLength(1);
    });

    it('probabilidades entre 0 e 1; histograma soma as iterações; P10 ≤ P50 ≤ P90', () => {
        const r = simularMonteCarlo(baseStudy(), FAIXAS, 300, 7);
        expect(r.probVplNegativo).toBeGreaterThanOrEqual(0);
        expect(r.probVplNegativo).toBeLessThanOrEqual(1);
        expect(r.histogramaVpl.reduce((a, h) => a + h.n, 0)).toBe(300);
        expect(r.vpl.p10).toBeLessThanOrEqual(r.vpl.p50);
        expect(r.vpl.p50).toBeLessThanOrEqual(r.vpl.p90);
    });

    it('sorteio sem TIR conta em semTir e fica fora dos percentis da TIR', () => {
        const s = baseStudy();
        s.blocks[0].sales_price_sqm = 0; // sem receita: o fluxo nunca fica positivo
        const r = simularMonteCarlo(s, FAIXAS, 30, 3);
        expect(r.semTir).toBe(30);
        expect(r.tir).toBeNull();
        // Sem TIR e com VPL negativo: conta como abaixo da TMA (regra da revisão da Fase 3).
        expect(r.probTirAbaixoDaTma).toBe(1);
        expect(r.probVplNegativo).toBe(1);
    });

    it('triangular não é uniforme: em u = 0,1 sorteia −4,52 (a uniforme daria −7)', () => {
        expect(sortearTriangular({ min: -10, moda: 0, max: 20 }, 0.1)).toBeCloseTo(-10 + Math.sqrt(0.1 * 30 * 10), 9);
    });

    it('sorteio sem TIR e com VPL negativo conta como TIR abaixo da TMA (a base são todos os sorteios)', () => {
        const s = baseStudy();
        // Faixa de preço entre −99,9% e −90%: perto de −99% a TIR some.
        const r = simularMonteCarlo(s, { preco: { min: -99.9, moda: -99.9, max: -90 } }, 200, 5);
        expect(r.semTir).toBeGreaterThan(0);
        expect(r.probTirAbaixoDaTma!).toBeGreaterThanOrEqual(r.semTir / 200);
    });

    it('2.000 sorteios no estudo-base cabem em 2 s', () => {
        const t0 = performance.now();
        simularMonteCarlo(baseStudy(), FAIXAS, 2000, 9);
        expect(performance.now() - t0).toBeLessThan(2000);
    });
});
