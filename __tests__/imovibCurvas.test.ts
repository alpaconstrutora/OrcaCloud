import { describe, it, expect } from 'vitest';
import { curvaDeVendas, curvaDeDesembolso, curvaDoCronograma } from '../utils/imovibCurvas';

/** Curvas de venda (item 1.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('5.3 — curvaDeDesembolso', () => {
    const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

    it('linear: a mesma fração todo mês', () => {
        const c = curvaDeDesembolso('linear', 24).pesos;
        expect(c).toHaveLength(24);
        c.forEach(x => expect(x).toBeCloseTo(1 / 24, 12));
    });

    it('curva S de 24 meses: soma 1, é simétrica e é o incremento de 3x² − 2x³', () => {
        const c = curvaDeDesembolso('curva_s', 24).pesos;
        expect(soma(c)).toBeCloseTo(1, 12);
        for (let i = 0; i < 12; i++) expect(c[i]).toBeCloseTo(c[23 - i], 12);
        const F = (x: number) => 3 * x * x - 2 * x * x * x;
        c.forEach((w, i) => expect(w).toBeCloseTo(F((i + 1) / 24) - F(i / 24), 12));
        expect(c[11]).toBeGreaterThan(c[0]);
    });

    it('personalizada: segue os pesos; se não somam 100, distribui na proporção e diz quanto somavam', () => {
        const ok = curvaDeDesembolso('custom', 4, [10, 20, 30, 40]);
        expect(ok.pesos).toEqual([0.1, 0.2, 0.3, 0.4]);
        expect(ok.somaInformada).toBeNull();
        const torta = curvaDeDesembolso('custom', 4, [10, 10, 10, 20]);
        expect(soma(torta.pesos)).toBeCloseTo(1, 12);
        expect(torta.somaInformada).toBe(50);
        // Prazo da obra diferente do tamanho da curva (choque de prazo, importação do
        // planejamento): a forma acumulada é reamostrada no prazo novo.
        const longa = curvaDeDesembolso('custom', 2, [25, 25, 50]);
        expect(longa.pesos[0]).toBeCloseTo(0.375, 12);
        expect(longa.pesos[1]).toBeCloseTo(0.625, 12);
        expect(longa.reamostrada).toBe(3);
        curvaDeDesembolso('custom', 3, [100]).pesos.forEach(w => expect(w).toBeCloseTo(1 / 3, 12));
        expect(ok.reamostrada).toBeNull();
    });

    it('personalizada vazia ou zerada cai na linear', () => {
        expect(curvaDeDesembolso('custom', 4, []).pesos).toEqual([0.25, 0.25, 0.25, 0.25]);
        expect(curvaDeDesembolso('custom', 4, [0, 0]).pesos).toEqual([0.25, 0.25, 0.25, 0.25]);
    });
});

describe('5.4 — curva do cronograma físico-financeiro (a mesma conta do previsto da FinancialSchedule)', () => {
    const item = (id: string, quantity: number, price: number) => ({ id, quantity, sinapiItem: { price } });

    it('formato novo: o total de cada item (quantidade × preço) se espalha pelos dias da tarefa', () => {
        const c = curvaDoCronograma([{
            budget: [item('a', 10, 100), item('b', 1, 3_000)],
            // 'a' (1.000) em 31 dias de janeiro; 'b' (3.000) de 15/01 a 14/03 = 59 dias.
            schedule: { periods: [], distributions: [], itemSchedules: [{ id: 'a', startDate: '2027-01-01', endDate: '2027-01-31' }, { id: 'b', startDate: '2027-01-15', endDate: '2027-03-14' }] },
        }]);
        expect(c!.primeiroMes).toBe('2027-01');
        const total = 4_000;
        const jan = 1_000 + 3_000 * 17 / 59, fev = 3_000 * 28 / 59, mar = 3_000 * 14 / 59;
        [jan, fev, mar].forEach((v, i) => expect(c!.percentuais[i]).toBeCloseTo(v / total * 100, 9));
    });

    it('formato antigo: percentual de cada item no período × total do item (o "value" gravado é 0)', () => {
        const c = curvaDoCronograma([{
            budget: [item('a', 1, 1_000), item('b', 1, 3_000)],
            schedule: {
                periods: [{ id: 'p2', date: '2027-02-01' }, { id: 'p1', date: '2027-01-01' }],
                distributions: [
                    { itemId: 'a', periodId: 'p1', percentage: 100, value: 0 },
                    { itemId: 'b', periodId: 'p1', percentage: 50, value: 0 },
                    { itemId: 'b', periodId: 'p2', percentage: 50, value: 0 },
                ],
            },
        }]);
        expect(c).toEqual({ percentuais: [62.5, 37.5], primeiroMes: '2027-01' });
    });

    it('várias obras somam pelo mês do calendário; mês vazio no meio vale 0; tarefa inativa fica fora', () => {
        const c = curvaDoCronograma([
            { budget: [item('a', 1, 100)], schedule: { periods: [], distributions: [], itemSchedules: [{ id: 'a', startDate: '2027-01-10', endDate: '2027-01-10' }] } },
            { budget: [item('x', 1, 100), item('z', 1, 999)], schedule: { periods: [], distributions: [], itemSchedules: [{ id: 'x', startDate: '2027-03-05', endDate: '2027-03-05' }, { id: 'z', startDate: '2027-02-01', endDate: '2027-02-02', inactive: true }] } },
        ]);
        expect(c).toEqual({ percentuais: [50, 0, 50], primeiroMes: '2027-01' });
    });

    it('sem item com valor e data: nulo', () => {
        expect(curvaDoCronograma([{ budget: [item('a', 0, 100)], schedule: { periods: [], distributions: [], itemSchedules: [{ id: 'a', startDate: '2027-01-01', endDate: '2027-01-02' }] } }])).toBeNull();
        expect(curvaDoCronograma([])).toBeNull();
    });
});

describe('1.1 — curvaDeVendas', () => {
    it('linear: a mesma fração todo mês, somando 1', () => {
        const c = curvaDeVendas({ tipo: 'linear', duracao: 24 });
        expect(c).toHaveLength(24);
        for (const x of c) expect(x).toBeCloseTo(1 / 24, 12);
        expect(sum(c)).toBeCloseTo(1, 12);
    });

    it('lançamento: 30% em 3 meses, o resto nos 21 seguintes', () => {
        const c = curvaDeVendas({ tipo: 'lancamento', duracao: 24, lancamentoPct: 30, lancamentoMeses: 3 });
        expect(c).toHaveLength(24);
        for (const x of c.slice(0, 3)) expect(x).toBeCloseTo(0.10, 12);
        for (const x of c.slice(3)) expect(x).toBeCloseTo(0.70 / 21, 12);
        expect(sum(c)).toBeCloseTo(1, 12);
    });

    it('lançamento que ocupa todo o prazo: vende tudo nesses meses', () => {
        const c = curvaDeVendas({ tipo: 'lancamento', duracao: 3, lancamentoPct: 30, lancamentoMeses: 5 });
        expect(c).toHaveLength(3);
        expect(sum(c)).toBeCloseTo(1, 12);
    });

    it('VSO: vende a cada mês a fração do estoque que resta, e pode não vender tudo', () => {
        const c = curvaDeVendas({ tipo: 'vso', duracao: 36, vsoPct: 5 });
        expect(c[0]).toBeCloseTo(0.05, 12);
        expect(c[1]).toBeCloseTo(0.0475, 12);
        expect(sum(c)).toBeCloseTo(1 - Math.pow(0.95, 36), 12);
    });

    it('custom: normaliza os pesos; lista vazia ou só zeros cai na linear', () => {
        expect(curvaDeVendas({ tipo: 'custom', duracao: 3, pesos: [1, 1, 2] })).toEqual([0.25, 0.25, 0.5]);
        expect(curvaDeVendas({ tipo: 'custom', duracao: 4, pesos: [] })).toEqual([0.25, 0.25, 0.25, 0.25]);
        expect(curvaDeVendas({ tipo: 'custom', duracao: 2, pesos: [0, 0] })).toEqual([0.5, 0.5]);
    });

    it('custom com lista de outro tamanho: o que passa do prazo é ignorado, o que falta é zero', () => {
        expect(curvaDeVendas({ tipo: 'custom', duracao: 2, pesos: [1, 3, 9] })).toEqual([0.25, 0.75]);
        expect(curvaDeVendas({ tipo: 'custom', duracao: 3, pesos: [2] })).toEqual([1, 0, 0]);
    });

    it('custom com peso negativo conta como zero', () => {
        expect(curvaDeVendas({ tipo: 'custom', duracao: 2, pesos: [-5, 1] })).toEqual([0, 1]);
    });

    it('prazo zero ou negativo: lista vazia', () => {
        expect(curvaDeVendas({ tipo: 'linear', duracao: 0 })).toEqual([]);
        expect(curvaDeVendas({ tipo: 'vso', duracao: -3, vsoPct: 5 })).toEqual([]);
    });

    it('VSO fora de 0–100% fica dentro do intervalo', () => {
        expect(sum(curvaDeVendas({ tipo: 'vso', duracao: 10, vsoPct: 150 }))).toBeCloseTo(1, 12);
        expect(sum(curvaDeVendas({ tipo: 'vso', duracao: 10, vsoPct: -5 }))).toBe(0);
    });
});
