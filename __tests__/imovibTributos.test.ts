import { describe, it, expect } from 'vitest';
import { impostoPorMes, hipotesesDoEstudo } from '../utils/imovibTributos';
import { compararRegimes } from '../utils/imovibComparacaoDeRegimes';
import { computeImovibMath } from '../utils/imovibMotor';
import { HIPOTESES_TRIBUTARIAS } from '../constants/imovibDefaults';
import { baseStudy, rubrica } from './fixtures/imovibEstudos';

/** Tributos por regime (itens 6.1 e 6.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, D4). */

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const H = HIPOTESES_TRIBUTARIAS;

describe('6.1 — impostoPorMes', () => {
    it('RET e presumido são % da receita do mês: 1.000.000 dá 40.000 e 67.300', () => {
        const receita = [400_000, 600_000];
        expect(soma(impostoPorMes('ret', receita, [0, 0], H))).toBeCloseTo(40_000, 6);
        expect(soma(impostoPorMes('presumido', receita, [0, 0], H))).toBeCloseTo(67_300, 6);
        expect(soma(impostoPorMes('ret_his', receita, [0, 0], H))).toBeCloseTo(10_000, 6);
    });

    it('receita zero dá imposto zero em todos os regimes', () => {
        for (const r of ['ret', 'ret_his', 'presumido', 'real'] as const) {
            expect(impostoPorMes(r, [0, 0, 0], [100, 0, 50], H).every(x => x === 0)).toBe(true);
        }
    });

    it('lucro real: o crédito de PIS/Cofins sobre o custo passa para os meses seguintes; nunca negativo', () => {
        // Mês 1: só custo (crédito de 92,50); mês 2: receita de 1.000 (débito de 92,50) → nada a pagar.
        const i = impostoPorMes('real', [0, 1_000], [1_000, 0], { ...H, realIrCsPct: 0 });
        expect(i[0]).toBe(0);
        expect(i[1]).toBeCloseTo(0, 9);
    });

    it('lucro real: IRPJ/CSLL sobre o lucro de cada ano, no último mês do ano; ano com prejuízo não paga', () => {
        const receita = Array.from({ length: 24 }, (_, k) => (k < 12 ? 100 : 10));
        const custo = Array.from({ length: 24 }, (_, k) => (k < 12 ? 0 : 500));
        const i = impostoPorMes('real', receita, custo, H);
        const pisAno1 = 1_200 * 0.0925;
        expect(i[11]).toBeCloseTo(100 * 0.0925 + (1_200 - pisAno1) * 0.34, 6);
        // Ano 2 é prejuízo e só tem crédito: nada a pagar.
        expect(soma(i.slice(12))).toBe(0);
        i.forEach(x => expect(x).toBeGreaterThanOrEqual(0));
    });

    it('lucro real: prejuízo de um ano compensa o lucro dos anos seguintes, sem limite (decisão de 11/11); deduções saem do lucro', () => {
        // Ano 1: custo 1.000, sem receita (prejuízo 1.000). Ano 2: receita 1.500 com 300 de deduções.
        const receita = Array.from({ length: 24 }, (_, k) => (k === 23 ? 1_500 : 0));
        const custo = Array.from({ length: 24 }, (_, k) => (k === 0 ? 1_000 : 0));
        const deducoes = Array.from({ length: 24 }, (_, k) => (k === 23 ? 300 : 0));
        const h = { ...H, realPisCofinsPct: 0, realCreditoSobreCustoPct: 0 };
        const i = impostoPorMes('real', receita, custo, h, deducoes);
        expect(soma(i.slice(0, 12))).toBe(0);
        expect(i[23]).toBeCloseTo((1_500 - 300 - 1_000) * 0.34, 9);
    });

    it('lucro real no estudo: o imposto total nunca passa do lucro do projeto', () => {
        const r = computeImovibMath(baseStudy({ tax_regime: 'real' }));
        const imposto = -soma(r.monthlyFlows.map(f => f.linhas.impostos));
        const lucroAntesDoImposto = soma(r.monthlyFlows.map(f => f.net)) + imposto;
        expect(imposto).toBeGreaterThan(0);
        expect(imposto).toBeLessThan(lucroAntesDoImposto);
    });

    it('hipóteses do estudo: o que o estudo informa vale; o resto é o padrão', () => {
        const h = hipotesesDoEstudo({ tax_hypotheses: { retPct: 2 } } as never);
        expect(h.retPct).toBe(2);
        expect(h.presumidoPct).toBe(H.presumidoPct);
    });
});

describe('6.2 — regime no motor', () => {
    const completo = (over: Record<string, unknown> = {}) => baseStudy({
        capex_items: [
            rubrica('7. Impostos', 'RET', 'percent', 4, 'vgv'),
            rubrica('7. Impostos', 'Presumido', 'percent', 6.73, 'vgv'),
            rubrica('5. Marketing e Vendas', 'Comissão', 'percent', 5, 'vgv'),
        ],
        ...over,
    });
    const receita = (r: ReturnType<typeof computeImovibMath>) => soma(r.monthlyFlows.map(f => f.rev));
    const impostos = (r: ReturnType<typeof computeImovibMath>) => -soma(r.monthlyFlows.map(f => f.linhas.impostos));

    it('regime vazio ou manual: o cálculo de antes (as duas rubricas de imposto somam 10,73%)', () => {
        const a = computeImovibMath(completo());
        expect(impostos(a) / receita(a)).toBeCloseTo(0.1073, 9);
        expect(computeImovibMath(completo({ tax_regime: 'manual' })).vpl).toBe(a.vpl);
        expect(a.impostosForaDoCalculo).toEqual([]);
    });

    it('RET escolhido: impostos são 4% da receita, as rubricas 7. ficam fora (com aviso) e a comissão continua', () => {
        const r = computeImovibMath(completo({ tax_regime: 'ret' }));
        expect(impostos(r) / receita(r)).toBeCloseTo(0.04, 9);
        expect(-soma(r.monthlyFlows.map(f => f.linhas.comercial)) / receita(r)).toBeCloseTo(0.05, 9);
        // Sem aviso permanente (os campos ficam desligados pelo regime): o cartão do regime mostra o que ficou fora.
        expect(r.avisos.find(x => x.codigo === 'impostos_pelo_regime')).toBeUndefined();
        expect(r.impostosForaDoCalculo).toEqual(['RET (4%)', 'Presumido (6,73%)']);
        // A rubrica fora do cálculo vale 0 no cálculo, e as rubricas somam o total.
        expect(r.capexValorPorRubrica['RET']).toBe(0);
        expect(soma(Object.values(r.capexValorPorRubrica))).toBeCloseTo(r.capexRubricas.total, 4);
        expect(r.vpl).toBeGreaterThan(computeImovibMath(completo()).vpl);
    });

    it('sem rubricas: o regime substitui o imposto da Dinâmica; a corretagem continua', () => {
        const r = computeImovibMath(baseStudy({ tax_regime: 'presumido' }));
        expect(impostos(r) / receita(r)).toBeCloseTo(0.0673, 9);
        expect(-soma(r.monthlyFlows.map(f => f.linhas.comercial)) / receita(r)).toBeCloseTo(0.05, 9);
    });

    it('vendas durante a obra descontam o imposto do regime como descontavam o manual', () => {
        const manual = computeImovibMath(baseStudy({ tax_rate: 4 }));
        const ret = computeImovibMath(baseStudy({ tax_regime: 'ret' }));
        expect(ret.vpl).toBeCloseTo(manual.vpl, 4);
        expect(ret.capital.vendasNaObra).toBeCloseTo(manual.capital.vendasNaObra, 4);
    });

    it('as alíquotas do estudo valem', () => {
        const r = computeImovibMath(baseStudy({ tax_regime: 'ret', tax_hypotheses: { retPct: 2 } }));
        expect(impostos(r) / receita(r)).toBeCloseTo(0.02, 9);
    });

    it('as linhas do mês continuam somando o caixa', () => {
        const r = computeImovibMath(completo({ tax_regime: 'real' }));
        r.monthlyFlows.forEach(f => expect(soma(Object.values(f.linhas))).toBeCloseTo(f.net, 4));
    });
});

describe('6.3 — comparação dos regimes', () => {
    it('uma linha por regime; a do manual é o estudo como está; RET paga menos que presumido', () => {
        const s = baseStudy();
        const c = compararRegimes(s);
        expect(c.map(x => x.regime)).toEqual(['manual', 'ret', 'ret_his', 'presumido', 'real']);
        expect(c[0].vpl).toBe(computeImovibMath(s).vpl);
        const ret = c.find(x => x.regime === 'ret')!;
        const presumido = c.find(x => x.regime === 'presumido')!;
        expect(ret.aliquotaEfetiva).toBeCloseTo(0.04, 9);
        expect(ret.impostoTotal).toBeLessThan(presumido.impostoTotal);
        expect(ret.vpl).toBeGreaterThan(presumido.vpl);
    });
});
