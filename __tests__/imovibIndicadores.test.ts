import { describe, it, expect } from 'vitest';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import { computeImovibMath } from '../utils/imovibMotor';
import type { ImovibMathResult } from '../utils/imovibMotor';
import { baseStudy } from './fixtures/imovibEstudos';

/** Indicadores de decisão (item 2.1 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). */

/** Resultado mínimo do motor a partir de um fluxo do acionista. */
const resultado = (net: number[], extra: Partial<ImovibMathResult> = {}): ImovibMathResult => {
    let acc = 0;
    const monthlyFlows = net.map((n, i) => {
        acc += n;
        return { month: i + 1, name: `Mês ${i + 1}`, rev: Math.max(0, n), cost: Math.max(0, -n), net: n, acc, netProjeto: n, accProjeto: acc, jurosDoMes: 0, linhas: {} as never };
    });
    return { ...computeImovibMath(null), monthlyFlows, maxExposure: Math.min(0, ...monthlyFlows.map(f => f.acc)), vgvTotal: 1000, ...extra };
};

describe('2.1 — calcularIndicadores', () => {
    it('fluxo [−100, −50, 80, 120]', () => {
        const i = calcularIndicadores(resultado([-100, -50, 80, 120]), 12);
        expect(i.lucroLiquido).toBe(50);
        expect(i.paybackSimplesMes).toBe(4);
        expect(i.multiploDoCapital).toBeCloseTo(200 / 150, 12);
        expect(i.mesDaExposicaoMaxima).toBe(2);
        expect(i.retornoSobreCapital).toBeCloseTo(50 / 150, 12);
        expect(i.margemLiquidaSobreVgv).toBeCloseTo(50 / 1000, 12);
        expect(i.margemSobreCusto).toBeCloseTo(50 / 150, 12);
    });

    it('payback descontado nunca vem antes do simples', () => {
        const i = calcularIndicadores(resultado([-100, -50, 80, 60, 60, 60]), 12);
        expect(i.paybackSimplesMes).toBe(5);
        expect(i.paybackDescontadoMes).not.toBeNull();
        expect(i.paybackDescontadoMes!).toBeGreaterThanOrEqual(i.paybackSimplesMes!);
    });

    it('acumulado que volta a ficar negativo: o payback é o último retorno ao positivo', () => {
        const i = calcularIndicadores(resultado([-100, 150, -80, 100]), 12);
        expect(i.paybackSimplesMes).toBe(4);
    });

    it('fluxo que termina negativo: sem payback', () => {
        const i = calcularIndicadores(resultado([-100, 50, 30]), 12);
        expect(i.paybackSimplesMes).toBeNull();
        expect(i.paybackDescontadoMes).toBeNull();
    });

    it('fluxo sem saída: múltiplo, retorno sobre o capital e mês da exposição ficam vazios', () => {
        const i = calcularIndicadores(resultado([10, 20]), 12);
        expect(i.multiploDoCapital).toBeNull();
        expect(i.retornoSobreCapital).toBeNull();
        expect(i.mesDaExposicaoMaxima).toBeNull();
        expect(i.paybackSimplesMes).toBe(1);
    });

    it('TIR modificada: uma saída no início e uma entrada no fim dão a própria taxa', () => {
        const i = calcularIndicadores(resultado([-100, 0, 0, 133.1]), 12);
        expect(i.tirModificadaAnual).toBeCloseTo((Math.pow(1.1, 12) - 1) * 100, 6);
    });

    it('TIR modificada sem entrada ou sem saída: vazia', () => {
        expect(calcularIndicadores(resultado([-100, -10]), 12).tirModificadaAnual).toBeNull();
        expect(calcularIndicadores(resultado([10, 20]), 12).tirModificadaAnual).toBeNull();
    });

    it('no estudo-base: terreno e obra sobre o VGV, e lucro = soma do caixa', () => {
        const r = computeImovibMath(baseStudy());
        const i = calcularIndicadores(r, 12);
        expect(i.terrenoSobreVgv).toBeCloseTo(5_000_000 / (40 * 70 * 10_000), 12);
        expect(i.obraSobreVgv).toBeCloseTo((40 * 90 * 4_500) / (40 * 70 * 10_000), 12);
        expect(i.lucroLiquido).toBeCloseTo(r.monthlyFlows[r.monthlyFlows.length - 1].acc, 4);
    });

    it('VGV zero: as razões sobre o VGV ficam vazias, não infinitas', () => {
        const i = calcularIndicadores(resultado([-100, 50], { vgvTotal: 0 }), 12);
        expect(i.margemLiquidaSobreVgv).toBeNull();
        expect(i.terrenoSobreVgv).toBeNull();
    });
});

describe('2.1 (pendência) — a TMA entra nos indicadores que dependem dela', () => {
    const fluxo = [-100, -100, 0, 0, 0, 60, 60, 60, 60];

    it('com TMA 0 o payback descontado é o simples; com TMA alta ele vem depois (ou some)', () => {
        const zero = calcularIndicadores(resultado(fluxo), 0);
        const alta = calcularIndicadores(resultado(fluxo), 60);
        expect(zero.paybackDescontadoMes).toBe(zero.paybackSimplesMes);
        expect(alta.paybackDescontadoMes == null || alta.paybackDescontadoMes > zero.paybackDescontadoMes!).toBe(true);
    });

    it('a TIR modificada muda com a TMA (saídas financiadas e entradas reinvestidas a ela)', () => {
        const a = calcularIndicadores(resultado(fluxo), 0).tirModificadaAnual!;
        const b = calcularIndicadores(resultado(fluxo), 30).tirModificadaAnual!;
        expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
        expect(b).not.toBeCloseTo(a, 2);
    });

    it('o que não depende da TMA não muda com ela', () => {
        const a = calcularIndicadores(resultado(fluxo), 0);
        const b = calcularIndicadores(resultado(fluxo), 30);
        expect(b.paybackSimplesMes).toBe(a.paybackSimplesMes);
        expect(b.multiploDoCapital).toBe(a.multiploDoCapital);
        expect(b.lucroLiquido).toBe(a.lucroLiquido);
    });
});
