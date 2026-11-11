import { describe, it, expect } from 'vitest';
import { aportesEDistribuicoes } from '../utils/imovibAportes';
import { computeImovibMath } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

/** Cronograma de aportes e distribuições (item 4.3 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('4.3 — aportesEDistribuicoes', () => {
    it('exemplo do plano: [−100, −50, 80, −20, 120] com caixa mínimo 0', () => {
        const l = aportesEDistribuicoes([-100, -50, 80, -20, 120], 0);
        expect(l.map(x => x.aporte)).toEqual([100, 50, 0, 0, 0]);
        // Mês 3 distribui 60 e retém 20, que o mês 4 consome; mês 5 distribui 120.
        expect(l.map(x => x.distribuicao)).toEqual([0, 0, 60, 0, 120]);
        expect(l.map(x => x.caixa)).toEqual([0, 0, 20, 0, 0]);
        expect(l.map(x => x.mes)).toEqual([1, 2, 3, 4, 5]);
    });

    it('distribuições menos aportes é a soma do fluxo, e o caixa nunca fica abaixo do mínimo antes do último mês', () => {
        const fluxo = [-300, 40, -10, 200, -150, 90, 400, -30, 60];
        for (const minimo of [0, 25, 100]) {
            const l = aportesEDistribuicoes(fluxo, minimo);
            expect(soma(l.map(x => x.distribuicao)) - soma(l.map(x => x.aporte))).toBeCloseTo(soma(fluxo), 9);
            l.slice(0, -1).forEach(x => expect(x.caixa).toBeGreaterThanOrEqual(minimo - 1e-9));
            // No último mês a SPE devolve todo o caixa.
            expect(l[l.length - 1].caixa).toBe(0);
        }
    });

    it('caixa mínimo: o primeiro aporte já inclui o mínimo', () => {
        const l = aportesEDistribuicoes([-100, 50, 80], 30);
        expect(l[0].aporte).toBe(130);
        expect(l[0].caixa).toBe(30);
    });

    it('fluxo vazio não quebra', () => {
        expect(aportesEDistribuicoes([], 0)).toEqual([]);
    });
});

describe('4.3 — motor', () => {
    it('o resultado traz os aportes do fluxo do incorporador, e a soma bate com o fluxo', () => {
        const r = computeImovibMath(baseStudy());
        expect(r.aportes).toHaveLength(r.duration);
        expect(soma(r.aportes.map(a => a.distribuicao)) - soma(r.aportes.map(a => a.aporte)))
            .toBeCloseTo(soma(r.monthlyFlows.map(f => f.net)), 2);
    });

    it('caixa mínimo do estudo (min_cash_balance) entra nos aportes', () => {
        const a = computeImovibMath(baseStudy()).aportes[0].aporte;
        const b = computeImovibMath(baseStudy({ min_cash_balance: 100_000 })).aportes[0].aporte;
        expect(b - a).toBeCloseTo(100_000, 2);
    });
});
