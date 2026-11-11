import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { aplicarVariacao, VariavelDoEstudo } from '../utils/imovibVariacoes';
import { tornado, gradeCruzada, metricaDoEstudo, CHOQUES_PADRAO, MetricaDoEstudo } from '../utils/imovibSensibilidade';
import { baseStudy } from './fixtures/imovibEstudos';

/** Tornado e grade cruzada (itens 3.1 e 3.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const METRICAS: MetricaDoEstudo[] = ['tir', 'vpl', 'margem', 'exposicao'];
const valor = (s: any, v: VariavelDoEstudo, d: number, m: MetricaDoEstudo) => {
    const x = aplicarVariacao(s, v, d);
    return metricaDoEstudo(computeImovibMath(x.study, x.options), m);
};

describe('3.1 — tornado', () => {
    it('oito barras, ordenadas da maior amplitude para a menor', () => {
        const barras = tornado(baseStudy({ cancellation_rate_percent: 5, funding_debt_percent: 50 }), 'vpl');
        expect(barras).toHaveLength(8);
        const amplitudes = barras.map(b => b.melhor - b.pior);
        expect([...amplitudes].sort((a, b) => b - a)).toEqual(amplitudes);
        for (const b of barras) expect(b.pior).toBeLessThanOrEqual(b.melhor);
    });

    it('subir o preço melhora e subir o custo de obra piora as quatro métricas', () => {
        const s = baseStudy();
        for (const m of METRICAS) {
            const base = metricaDoEstudo(computeImovibMath(s), m);
            expect(valor(s, 'preco', 10, m), m).toBeGreaterThan(base);
            expect(valor(s, 'custo_obra', 10, m), m).toBeLessThan(base);
        }
    });

    it('variável sem efeito (juros sem dívida) aparece com barra zero', () => {
        const juros = tornado(baseStudy({ funding_debt_percent: 0 }), 'vpl').find(b => b.variavel === 'juros_financiamento')!;
        expect(juros.melhor - juros.pior).toBeCloseTo(0, 6);
        expect(juros.pior).toBeCloseTo(juros.base, 6);
    });

    it('usa os choques pedidos e, sem eles, os padrões', () => {
        const s = baseStudy();
        const padrao = tornado(s, 'vpl').find(b => b.variavel === 'preco')!;
        const pedido = tornado(s, 'vpl', { preco: 20 }).find(b => b.variavel === 'preco')!;
        expect(CHOQUES_PADRAO.preco).toBe(10);
        expect(pedido.melhor - pedido.pior).toBeGreaterThan(padrao.melhor - padrao.pior);
        expect(padrao.melhor).toBeCloseTo(valor(s, 'preco', 10, 'vpl'), 6);
        expect(padrao.pior).toBeCloseTo(valor(s, 'preco', -10, 'vpl'), 6);
    });

    it('métricas: margem = lucro ÷ VGV; exposição é o menor acumulado; TIR sem raiz = NaN', () => {
        const s = baseStudy();
        const r = computeImovibMath(s);
        expect(metricaDoEstudo(r, 'margem')).toBeCloseTo(r.monthlyFlows.reduce((a, f) => a + f.net, 0) / r.vgvTotal, 12);
        expect(metricaDoEstudo(r, 'exposicao')).toBe(r.maxExposure);
        expect(metricaDoEstudo(r, 'vpl')).toBe(r.vpl);
    });
});

describe('3.2 — grade cruzada', () => {
    const deltas = [-20, -10, 0, 10, 20];
    it('5 × 5; a célula central é o valor base', () => {
        const s = baseStudy();
        const g = gradeCruzada(s, { variavel: 'preco', deltas }, { variavel: 'custo_obra', deltas }, 'vpl');
        expect(g).toHaveLength(5);
        for (const linha of g) expect(linha).toHaveLength(5);
        expect(g[2][2]).toBeCloseTo(computeImovibMath(s).vpl, 6);
    });

    it('preço × custo é monótona nas duas direções', () => {
        const g = gradeCruzada(baseStudy(), { variavel: 'preco', deltas }, { variavel: 'custo_obra', deltas }, 'vpl');
        // linhas = eixo y (custo), colunas = eixo x (preço)
        for (const linha of g) for (let j = 1; j < 5; j++) expect(linha[j]).toBeGreaterThan(linha[j - 1]);
        for (let j = 0; j < 5; j++) for (let i = 1; i < 5; i++) expect(g[i][j]).toBeLessThan(g[i - 1][j]);
    });

    it('a mesma variável nos dois eixos soma os deltas, não troca um pelo outro', () => {
        const s = baseStudy();
        const g = gradeCruzada(s, { variavel: 'terreno', deltas: [0, 10] }, { variavel: 'terreno', deltas: [0, 10] }, 'vpl');
        expect(g[1][1]).toBeCloseTo(valor(s, 'terreno', 20, 'vpl'), 4);
    });
});
