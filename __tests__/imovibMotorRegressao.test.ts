import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { ESTUDOS_DE_REGRESSAO } from './fixtures/imovibEstudos';

/**
 * O número de hoje (item 0.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 *
 * Este teste fica verde em todo commit. Item que muda número de propósito
 * atualiza os valores AQUI, no mesmo commit, e põe o antes → depois na
 * mensagem do commit e no plano.
 *
 * Histórico dos valores:
 *   0.1 (11/11): motor de origin/main 21b6daa4, antes de qualquer mudança.
 *   1.4 (11/11): curva de vendas + recebimento por safra. VPL antes → depois:
 *     base 1.460.203 → 1.306.511; divida60 1.427.207 → 1.243.697;
 *     completo 730.847 → 577.155; espelhoInflacao 1.186.680 → 2.801.758
 *     (inadimplência e distrato deixam de descontar o VGV; distrato com
 *     revenda retém 25% do pago).
 */

const centavos = (x: number) => Math.round(x * 100) / 100;
const rep = (v: number, n: number) => Array.from({ length: n }, () => v);

interface Esperado {
    vpl: number; annualIrr: number; maxExposure: number; netVgvTotal: number; duration: number; net: number[];
}

const ESPERADO: Record<string, Esperado> = {
    base: {
        vpl: 1306511, annualIrr: 19.31782, maxExposure: -13272508.21, netVgvTotal: 28000000, duration: 29,
        net: [
            -4893833.33, 113750, 121614.2, 129780.86, 138274.2, -527878.58, -518646.7, -508995.18, -498884.07,
            -488267.4, -477091.96, -465295.67, -452805.47, -439534.64, -425379.08, -410212.42, -393879.08,
            -376184.64, -356881.61, -335648.28, -312055.68, -285514.02, -255180.68, -219791.79,
            ...rep(-283491.79, 4), 17552508.21,
        ],
    },
    divida60: {
        vpl: 1243696.97, annualIrr: 20.434511, maxExposure: -10600414.07, netVgvTotal: 28000000, duration: 29,
        net: [
            -4893833.33, 113750, 121614.2, 129780.86, 138274.2, ...rep(-270000, 23), 14324129.51,
        ],
    },
    completo: {
        vpl: 577155, annualIrr: 15.124379, maxExposure: -14068841.54, netVgvTotal: 28000000, duration: 29,
        net: [
            -5053833.33, 103750, 111614.2, 119780.86, 128274.2, -555545.25, -546313.36, -536661.85, -526550.74,
            -515934.07, -504758.63, -492962.34, -480472.14, -467201.31, -453045.75, -437879.08, -421545.75,
            -403851.31, -384548.28, -363314.94, -339722.35, -313180.68, -282847.35, -247458.46,
            ...rep(-301158.46, 4), 17534841.54,
        ],
    },
    espelhoInflacao: {
        vpl: 2702613.88, annualIrr: 26.417731, maxExposure: -13827023.1, netVgvTotal: 28344234.19, duration: 30,
        net: [
            -4891634.17, 116337.53, 124651.58, 133333.37, 142411.25, -536691.37, -529476.14, -521767.35,
            -513518.61, -504676.67, -495180.02, -484957.01, -482683.03, -466185.22, -453137.63, -438896.56,
            -423279.71, -406059.35, -386945.86, -365562.9, -341408.94, -313794.68, -281735.81, -243756.42,
            -316757.91, -316638.27, -315758.41, -313254.78, 19549765.71, 435370.43,
        ],
    },
};

describe('regressão — o número de hoje', () => {
    it('tem um valor esperado para cada estudo fixo', () => {
        expect(Object.keys(ESPERADO).sort()).toEqual(Object.keys(ESTUDOS_DE_REGRESSAO).sort());
    });

    for (const [nome, estudo] of Object.entries(ESTUDOS_DE_REGRESSAO)) {
        it(nome, () => {
            const r = computeImovibMath(estudo());
            const e = ESPERADO[nome];
            expect(centavos(r.vpl)).toBe(e.vpl);
            expect(r.annualIrr).toBeCloseTo(e.annualIrr, 5);
            expect(centavos(r.maxExposure)).toBe(e.maxExposure);
            expect(centavos(r.netVgvTotal)).toBe(e.netVgvTotal);
            expect(r.duration).toBe(e.duration);
            expect(r.monthlyFlows.map(f => centavos(f.net))).toEqual(e.net);
            expect(r.avisos).toEqual([]);
        });
    }
});
