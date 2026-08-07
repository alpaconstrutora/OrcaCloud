import { describe, it, expect } from 'vitest';
import { computeNoi, portfolioNoi, capRate, type NoiNode } from '../lib/rentalNoi';

const nodes: NoiNode[] = [
    { id: 'ed-1', parent_id: null },
    { id: 'u-101', parent_id: 'ed-1' },
    { id: 'u-102', parent_id: 'ed-1' },
    { id: 'galpao', parent_id: null },
];

describe('computeNoi — rollup unidade → edifício', () => {
    it('soma o NOI das unidades e ainda carrega a despesa que ficou no edifício', () => {
        const revenue = new Map([['u-101', 3_000], ['u-102', 2_000]]);
        // 800 lançados no edifício e NÃO rateados (seguro predial, por exemplo).
        const expense = new Map([['ed-1', 800], ['u-101', 200], ['u-102', 100]]);

        const results = computeNoi(nodes, revenue, expense);
        const ed = results.get('ed-1')!;

        expect(ed.revenue).toBe(5_000);
        expect(ed.expense).toBe(1_100);      // 800 do prédio + 200 + 100 das unidades
        expect(ed.noi).toBe(3_900);
        expect(ed.ownExpense).toBe(800);     // o que é dele, separado do rollup
    });

    it('não conta em dobro a despesa rateada', () => {
        // Rateio já desceu para as unidades: o edifício não guarda nada.
        const revenue = new Map([['u-101', 1_000], ['u-102', 1_000]]);
        const expense = new Map([['u-101', 150], ['u-102', 150]]);

        expect(computeNoi(nodes, revenue, expense).get('ed-1')!.expense).toBe(300);
    });

    it('NOI da unidade é só dela', () => {
        const revenue = new Map([['u-101', 3_000]]);
        const expense = new Map([['u-101', 500]]);
        const u = computeNoi(nodes, revenue, expense).get('u-101')!;

        expect(u.noi).toBe(2_500);
        expect(u.margin).toBeCloseTo(0.8333, 3);
    });

    it('imóvel locado inteiro tem receita própria, sem filhos', () => {
        const revenue = new Map([['galpao', 10_000]]);
        const expense = new Map([['galpao', 2_000]]);
        const g = computeNoi(nodes, revenue, expense).get('galpao')!;

        expect(g.noi).toBe(8_000);
        expect(g.margin).toBe(0.8);
    });

    it('margem sem receita é null, não zero — indefinida, não medida', () => {
        const vazio = computeNoi(nodes, new Map(), new Map()).get('u-101')!;
        expect(vazio.margin).toBeNull();
        expect(vazio.noi).toBe(0);
    });

    it('NOI negativo é resultado legítimo, não erro', () => {
        // Prédio vago que só gera despesa — o indicador tem de mostrar isso.
        const results = computeNoi(nodes, new Map(), new Map([['ed-1', 900]]));
        expect(results.get('ed-1')!.noi).toBe(-900);
    });

    it('não trava com parent_id circular', () => {
        const circular: NoiNode[] = [
            { id: 'a', parent_id: 'b' },
            { id: 'b', parent_id: 'a' },
        ];
        expect(() => computeNoi(circular, new Map(), new Map())).not.toThrow();
    });

    it('unidade cujo pai não veio na consulta ainda é calculada', () => {
        const soFilhas: NoiNode[] = [{ id: 'u-1', parent_id: 'fora-da-lista' }];
        const results = computeNoi(soFilhas, new Map([['u-1', 500]]), new Map());

        expect(results.get('u-1')!.noi).toBe(500);
    });
});

describe('portfolioNoi — consolidado soma só as raízes', () => {
    it('não conta as unidades duas vezes', () => {
        const revenue = new Map([['u-101', 3_000], ['u-102', 2_000], ['galpao', 10_000]]);
        const expense = new Map([['ed-1', 800], ['galpao', 2_000]]);
        const results = computeNoi(nodes, revenue, expense);
        const total = portfolioNoi(nodes, results);

        // Se somasse todos os nós, a receita daria 20.000 (5.000 do prédio
        // contados de novo pelas unidades).
        expect(total.revenue).toBe(15_000);
        expect(total.expense).toBe(2_800);
        expect(total.noi).toBe(12_200);
    });

    it('carteira vazia não vira NaN', () => {
        const total = portfolioNoi([], new Map());
        expect(total).toEqual({ revenue: 0, expense: 0, noi: 0, margin: null });
    });
});

describe('capRate', () => {
    it('NOI anual sobre valor de mercado', () => {
        expect(capRate(120_000, 1_500_000)).toBeCloseTo(0.08, 5);
    });

    it('sem patrimônio é null, não Infinity', () => {
        expect(capRate(120_000, 0)).toBeNull();
    });
});
