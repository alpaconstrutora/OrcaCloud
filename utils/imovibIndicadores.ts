import type { ImovibMathResult } from './imovibMotor';

/**
 * Indicadores de decisão do estudo, calculados sobre o fluxo do ACIONISTA
 * (`monthlyFlows[].net`, depois da dívida). Item 2.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md.
 * Testes: __tests__/imovibIndicadores.test.ts.
 *
 * `null` = não se aplica (sem VGV, sem saída de caixa, fluxo que nunca se paga),
 * nunca 0 nem infinito.
 */
export interface IndicadoresDoEstudo {
    /** Soma do caixa do acionista. */
    lucroLiquido: number;
    margemLiquidaSobreVgv: number | null;
    /** Lucro ÷ soma dos custos (terreno, obra, rubricas). */
    margemSobreCusto: number | null;
    /** Mês em que o acumulado fica ≥ 0 e não volta a ficar negativo. */
    paybackSimplesMes: number | null;
    /** O mesmo, com o caixa descontado à TMA. */
    paybackDescontadoMes: number | null;
    /** Soma das entradas ÷ soma das saídas, em módulo. */
    multiploDoCapital: number | null;
    /** Lucro ÷ exposição máxima (o capital que o projeto chegou a exigir). */
    retornoSobreCapital: number | null;
    /** TIR modificada (saídas financiadas e entradas reinvestidas à TMA), % a.a. */
    tirModificadaAnual: number | null;
    mesDaExposicaoMaxima: number | null;
    /** O caixa acumulado nunca fica negativo: não há o que recuperar, payback não se aplica. */
    semExposicao: boolean;
    terrenoSobreVgv: number | null;
    obraSobreVgv: number | null;
}

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Primeiro mês a partir do qual o acumulado não fica mais negativo. */
const payback = (fluxo: number[]): number | null => {
    let acumulado = 0;
    let desde: number | null = null;
    fluxo.forEach((v, i) => {
        acumulado += v;
        if (acumulado >= 0) { if (desde == null) desde = i + 1; } else desde = null;
    });
    return desde;
};

export function calcularIndicadores(r: ImovibMathResult, tmaAnualPct: number): IndicadoresDoEstudo {
    const net = r.monthlyFlows.map(f => f.net);
    const tmaMensal = Math.pow(1 + tmaAnualPct / 100, 1 / 12) - 1;
    const lucro = soma(net);
    const entradas = soma(net.filter(v => v > 0));
    const saidas = -soma(net.filter(v => v < 0));
    const custo = soma(r.monthlyFlows.map(f => f.cost));
    const porVgv = (x: number) => (r.vgvTotal > 0 ? x / r.vgvTotal : null);

    let mesDaExposicaoMaxima: number | null = null;
    let menor = 0;
    r.monthlyFlows.forEach(f => { if (f.acc < menor) { menor = f.acc; mesDaExposicaoMaxima = f.month; } });

    let tirModificadaAnual: number | null = null;
    const n = net.length;
    if (n > 1 && entradas > 0 && saidas > 0) {
        const vpSaidas = -soma(net.map((v, i) => (v < 0 ? v / Math.pow(1 + tmaMensal, i) : 0)));
        const vfEntradas = soma(net.map((v, i) => (v > 0 ? v * Math.pow(1 + tmaMensal, n - 1 - i) : 0)));
        const mensal = Math.pow(vfEntradas / vpSaidas, 1 / (n - 1)) - 1;
        tirModificadaAnual = (Math.pow(1 + mensal, 12) - 1) * 100;
    }

    // Caixa acumulado nunca negativo: o payback seria "Mês 1" sem nunca ter havido o que
    // recuperar (pendência da Fase 2). Fica vazio, e a tela diz "Sem exposição".
    let acumulado = 0;
    // Fluxo todo zero (estudo vazio) não é "sem exposição": não há o que dizer.
    const temCaixa = net.some(v => v !== 0);
    const semExposicao = temCaixa && net.every(v => (acumulado += v) >= 0);
    return {
        lucroLiquido: lucro,
        margemLiquidaSobreVgv: porVgv(lucro),
        margemSobreCusto: custo > 0 ? lucro / custo : null,
        paybackSimplesMes: semExposicao || !temCaixa ? null : payback(net),
        paybackDescontadoMes: semExposicao || !temCaixa ? null : payback(net.map((v, i) => v / Math.pow(1 + tmaMensal, i))),
        multiploDoCapital: saidas > 0 ? entradas / saidas : null,
        retornoSobreCapital: r.maxExposure < 0 ? lucro / -r.maxExposure : null,
        tirModificadaAnual,
        mesDaExposicaoMaxima,
        semExposicao,
        terrenoSobreVgv: porVgv(r.landCost),
        obraSobreVgv: porVgv(r.constCostTotal),
    };
}

/** O payback como as telas mostram: "Mês N", "Sem exposição" (caixa nunca negativo) ou "—". */
export const textoDoPayback = (ind: Pick<IndicadoresDoEstudo, 'paybackSimplesMes' | 'semExposicao'>, mes: number | null = ind.paybackSimplesMes): string =>
    ind.semExposicao ? 'Sem exposição' : mes == null ? '—' : `Mês ${mes}`;

/** Por que não há payback (Excel, subtítulos). */
export const motivoSemPayback = (ind: Pick<IndicadoresDoEstudo, 'semExposicao'>, descontado = false): string =>
    ind.semExposicao ? 'Sem exposição: o caixa nunca fica negativo' : descontado ? 'O caixa descontado não volta ao positivo' : 'O caixa acumulado não volta ao positivo';
