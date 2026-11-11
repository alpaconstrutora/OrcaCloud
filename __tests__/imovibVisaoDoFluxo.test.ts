import { describe, it, expect } from 'vitest';
import { computeImovibMath } from '../utils/imovibMotor';
import { montarVisaoDoFluxo, LINHAS_DA_DIVIDA } from '../utils/imovibVisaoDoFluxo';
import { ESTUDOS_DE_REGRESSAO, baseStudy } from './fixtures/imovibEstudos';

/** Visões do fluxo de caixa (item 2.4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('2.4 — montarVisaoDoFluxo', () => {
    const r = computeImovibMath(ESTUDOS_DE_REGRESSAO.divida60());

    it('acionista, nominal, mensal: um período por mês, igual ao motor', () => {
        const v = montarVisaoDoFluxo(r, { visao: 'acionista', base: 'nominal', periodo: 'mensal', inflacaoMensalPct: 0.4 });
        expect(v.periodos).toHaveLength(r.duration);
        v.periodos.forEach((p, i) => {
            expect(p.net).toBeCloseTo(r.monthlyFlows[i].net, 6);
            expect(p.acc).toBeCloseTo(r.monthlyFlows[i].acc, 6);
            expect(sum(Object.values(p.linhas))).toBeCloseTo(p.net, 6);
        });
        expect(v.tirAnual).toBeCloseTo(r.annualIrr, 6);
        expect(v.exposicaoMaxima).toBeCloseTo(r.maxExposure, 6);
    });

    it('projeto: sem as linhas da dívida, caixa = netProjeto, TIR do projeto', () => {
        const v = montarVisaoDoFluxo(r, { visao: 'projeto', base: 'nominal', periodo: 'mensal', inflacaoMensalPct: 0.4 });
        v.periodos.forEach((p, i) => {
            for (const l of LINHAS_DA_DIVIDA) expect(p.linhas[l]).toBe(0);
            expect(p.net).toBeCloseTo(r.monthlyFlows[i].netProjeto, 6);
            expect(sum(Object.values(p.linhas))).toBeCloseTo(p.net, 6);
        });
        expect(v.tirAnual).toBeCloseTo(r.annualIrrProjeto, 6);
    });

    it('anual e trimestral: um período por ano / trimestre começado, e o mesmo total', () => {
        const anual = montarVisaoDoFluxo(r, { visao: 'acionista', base: 'nominal', periodo: 'anual', inflacaoMensalPct: 0 });
        const tri = montarVisaoDoFluxo(r, { visao: 'acionista', base: 'nominal', periodo: 'trimestral', inflacaoMensalPct: 0 });
        expect(anual.periodos).toHaveLength(Math.ceil(r.duration / 12));
        expect(tri.periodos).toHaveLength(Math.ceil(r.duration / 3));
        expect(anual.periodos.map(p => p.rotulo)).toEqual(['Ano 1', 'Ano 2', 'Ano 3']);
        const total = sum(r.monthlyFlows.map(f => f.net));
        expect(sum(anual.periodos.map(p => p.net))).toBeCloseTo(total, 4);
        expect(sum(tri.periodos.map(p => p.net))).toBeCloseTo(total, 4);
        expect(anual.periodos[anual.periodos.length - 1].acc).toBeCloseTo(total, 4);
    });

    it('real: cada mês dividido pela inflação acumulada até ele', () => {
        const v = montarVisaoDoFluxo(r, { visao: 'acionista', base: 'real', periodo: 'mensal', inflacaoMensalPct: 1 });
        v.periodos.forEach((p, i) => expect(p.net).toBeCloseTo(r.monthlyFlows[i].net / Math.pow(1.01, i), 6));
        // TIR real < nominal com inflação positiva
        expect(v.tirAnual).toBeLessThan(r.annualIrr);
    });

    it('sem inflação, real = nominal', () => {
        const s = computeImovibMath(baseStudy());
        const n = montarVisaoDoFluxo(s, { visao: 'acionista', base: 'nominal', periodo: 'mensal', inflacaoMensalPct: 0 });
        const re = montarVisaoDoFluxo(s, { visao: 'acionista', base: 'real', periodo: 'mensal', inflacaoMensalPct: 0 });
        expect(re.periodos.map(p => p.net)).toEqual(n.periodos.map(p => p.net));
    });

    it('linhas com valor: só as que aparecem em algum período', () => {
        const v = montarVisaoDoFluxo(r, { visao: 'acionista', base: 'nominal', periodo: 'mensal', inflacaoMensalPct: 0 });
        expect(v.linhasComValor).toContain('receitaSinal');
        expect(v.linhasComValor).toContain('liberacaoDivida');
        expect(v.linhasComValor).not.toContain('receitaPosChaves');
        const p = montarVisaoDoFluxo(r, { visao: 'projeto', base: 'nominal', periodo: 'mensal', inflacaoMensalPct: 0 });
        expect(p.linhasComValor).not.toContain('liberacaoDivida');
    });
});
