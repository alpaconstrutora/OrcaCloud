import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../hooks/useImovibMath';
import { ESTUDOS_DE_REGRESSAO } from './fixtures/imovibEstudos';

/**
 * O número de hoje (item 0.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 *
 * Valores medidos em 2026-11-11 no motor de origin/main (21b6daa4), antes de
 * qualquer mudança do plano. Este teste fica verde em todo commit. Item que
 * muda número de propósito atualiza os valores AQUI, no mesmo commit, e põe o
 * antes → depois na mensagem do commit.
 */

const centavos = (x: number) => Math.round(x * 100) / 100;
const rep = (v: number, n: number) => Array.from({ length: n }, () => v);

interface Esperado {
    vpl: number; annualIrr: number; maxExposure: number; netVgvTotal: number; duration: number; net: number[];
}

const ESPERADO: Record<string, Esperado> = {
    base: {
        vpl: 1460203.26, annualIrr: 20.806018, maxExposure: -13093333.33, netVgvTotal: 28000000, duration: 29,
        net: [-4893833.33, ...rep(106166.67, 4), ...rep(-356500, 19), ...rep(-462666.67, 4), 17373333.33],
    },
    divida60: {
        vpl: 1427207.47, annualIrr: 21.536883, maxExposure: -10679166.67, netVgvTotal: 28000000, duration: 29,
        net: [-4893833.33, ...rep(106166.67, 4), ...rep(-270000, 23), 14662898.51],
    },
    completo: {
        vpl: 730847.27, annualIrr: 16.249461, maxExposure: -13889666.67, netVgvTotal: 28000000, duration: 29,
        net: [-5053833.33, ...rep(96166.67, 4), ...rep(-384166.67, 19), ...rep(-480333.33, 4), 17355666.67],
    },
    espelhoInflacao: {
        vpl: 1186680.4, annualIrr: 18.894035, maxExposure: -14158459.71, netVgvTotal: 26293600, duration: 29,
        net: [
            -4900303.43, 100095.35, 100495.73, 100897.72, 101301.31,
            -383488.89, -385022.85, -386562.94, -388109.19, -389661.63, -391220.27, -392785.16, -394356.3,
            -395933.72, -397517.46, -399107.53, -400703.96, -402306.77, -403916, -405531.66, -407153.79,
            -408782.41, -410417.53, -412059.2,
            -523428.33, -525522.04, -527624.13, -529734.63, 18197959.5,
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
