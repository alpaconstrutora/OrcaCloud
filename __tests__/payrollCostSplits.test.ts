/**
 * Rateio contábil do colaborador — a escada de herança e a divisão do valor.
 *
 * O que estes testes protegem (relato do usuário em 2026-08-23): dentro de um
 * mês, um colaborador pode apropriar custo em mais de um Centro de Custo /
 * Plano de Contas. A classificação única da etapa anterior não cobria isso, e
 * a herança tinha de continuar valendo para quem NÃO tem rateio.
 */

import { describe, expect, it } from 'vitest';
import {
    resolvePayrollShares,
    classificationKey,
    dividirValor,
    type EmployeeCostSplit,
} from '../services/payrollService';

const CICLO = { cost_center_id: 'cc-ciclo', plano_de_contas_id: 'pc-ciclo' };
const COLAB = { cost_center_id: 'cc-colab', plano_de_contas_id: 'pc-colab' };

function split(cc: string | null, pc: string | null, percent: number): EmployeeCostSplit {
    return { employee_id: 'e1', reference_period: '2026-07', cost_center_id: cc, plano_de_contas_id: pc, percent };
}

describe('resolvePayrollShares · a escada de 4 degraus', () => {
    it('sem rateio e sem colaborador: uma fatia de 100% com a classificação do CICLO', () => {
        const fatias = resolvePayrollShares(CICLO, null, []);
        expect(fatias).toEqual([{ cost_center_id: 'cc-ciclo', plano_de_contas_id: 'pc-ciclo', share: 1 }]);
    });

    it('sem rateio, com colaborador classificado: o COLABORADOR vence o ciclo', () => {
        const fatias = resolvePayrollShares(CICLO, COLAB, []);
        expect(fatias).toEqual([{ cost_center_id: 'cc-colab', plano_de_contas_id: 'pc-colab', share: 1 }]);
    });

    it('override parcial do colaborador: cada dimensão herda por conta própria', () => {
        const fatias = resolvePayrollShares(CICLO, { cost_center_id: 'cc-colab', plano_de_contas_id: null }, []);
        expect(fatias).toEqual([{ cost_center_id: 'cc-colab', plano_de_contas_id: 'pc-ciclo', share: 1 }]);
    });

    it('com rateio: o RATEIO vence os dois degraus abaixo', () => {
        const fatias = resolvePayrollShares(CICLO, COLAB, [split('cc-a', 'pc-a', 60), split('cc-b', 'pc-b', 40)]);
        expect(fatias).toEqual([
            { cost_center_id: 'cc-a', plano_de_contas_id: 'pc-a', share: 0.6 },
            { cost_center_id: 'cc-b', plano_de_contas_id: 'pc-b', share: 0.4 },
        ]);
    });
});

describe('resatePayrollShares · rateio que não fecha 100%', () => {
    it('soma parcial: o RESTO herda, o custo não some da contabilidade', () => {
        const fatias = resolvePayrollShares(CICLO, COLAB, [split('cc-a', 'pc-a', 95)]);
        expect(fatias).toHaveLength(2);
        expect(fatias[0]).toEqual({ cost_center_id: 'cc-a', plano_de_contas_id: 'pc-a', share: 0.95 });
        // o resto cai para o colaborador (degrau seguinte), não para "sem classificação"
        expect(fatias[1].cost_center_id).toBe('cc-colab');
        expect(fatias[1].share).toBeCloseTo(0.05, 10);
        expect(fatias.reduce((s, f) => s + f.share, 0)).toBeCloseTo(1, 10);
    });

    it('soma acima de 100: normaliza em vez de lançar valor a mais', () => {
        const fatias = resolvePayrollShares(CICLO, COLAB, [split('cc-a', null, 80), split('cc-b', null, 40)]);
        expect(fatias.reduce((s, f) => s + f.share, 0)).toBeCloseTo(1, 10);
        expect(fatias[0].share).toBeCloseTo(80 / 120, 10);
    });

    it('linha sem nenhuma dimensão ou com percentual zero é ignorada', () => {
        const fatias = resolvePayrollShares(CICLO, null, [split(null, null, 30), split('cc-a', null, 0)]);
        expect(fatias).toEqual([{ cost_center_id: 'cc-ciclo', plano_de_contas_id: 'pc-ciclo', share: 1 }]);
    });
});

describe('classificationKey', () => {
    it('distingue as combinações e é estável para a mesma', () => {
        expect(classificationKey({ cost_center_id: 'a', plano_de_contas_id: 'b' })).toBe('a-b');
        expect(classificationKey({ cost_center_id: null, plano_de_contas_id: null })).toBe('none-none');
        expect(classificationKey({ cost_center_id: 'a', plano_de_contas_id: null }))
            .not.toBe(classificationKey({ cost_center_id: null, plano_de_contas_id: 'a' }));
    });
});

describe('dividirValor · o total lançado tem de bater com a folha', () => {
    it('divisão exata', () => {
        const fatias = resolvePayrollShares(CICLO, null, [split('a', null, 60), split('b', null, 40)]);
        expect(dividirValor(1000, fatias)).toEqual([600, 400]);
    });

    it('três fatias de 33,33%: a sobra de centavos vai para a maior, sem perder nada', () => {
        const fatias = resolvePayrollShares(CICLO, null, [
            split('a', null, 33.34), split('b', null, 33.33), split('c', null, 33.33),
        ]);
        const valores = dividirValor(100, fatias);
        expect(valores.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('valor quebrado não some nem sobra centavo', () => {
        const fatias = resolvePayrollShares(CICLO, null, [
            split('a', null, 70), split('b', null, 30),
        ]);
        const valores = dividirValor(3405.07, fatias);
        expect(valores.reduce((a, b) => a + b, 0)).toBeCloseTo(3405.07, 10);
    });

    it('fatia única devolve o valor inteiro', () => {
        expect(dividirValor(2751.4, resolvePayrollShares(CICLO, null, []))).toEqual([2751.4]);
    });
});
