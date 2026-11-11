import type { ImovibStudy } from '../types';
import { computeImovibMath, ImovibMathResult } from './imovibMotor';
import { aplicarChoques, Choques, VariavelDoEstudo, VARIAVEIS_DO_ESTUDO, ROTULO_DA_VARIAVEL } from './imovibVariacoes';
import { IMOVIB_CHOQUES_PADRAO } from '../constants/imovibDefaults';

/**
 * Tornado e grade cruzada (itens 3.1 e 3.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Cada valor sai de
 * rodar o motor sobre uma cópia do estudo com a premissa variada.
 * Testes: __tests__/imovibSensibilidade.test.ts.
 */

/** Em todas, maior = melhor (a exposição é negativa: menos negativa é melhor). */
export type MetricaDoEstudo = 'tir' | 'vpl' | 'margem' | 'exposicao';

export const CHOQUES_PADRAO: Record<VariavelDoEstudo, number> = IMOVIB_CHOQUES_PADRAO;

export function metricaDoEstudo(r: ImovibMathResult, m: MetricaDoEstudo): number {
    switch (m) {
        case 'tir': return r.annualIrr;
        case 'vpl': return r.vpl;
        case 'exposicao': return r.maxExposure;
        case 'margem': return r.vgvTotal > 0 ? r.monthlyFlows.reduce((a, f) => a + f.net, 0) / r.vgvTotal : NaN;
    }
}

const medir = (study: ImovibStudy, choques: Choques, m: MetricaDoEstudo) => {
    const x = aplicarChoques(study, choques);
    return metricaDoEstudo(computeImovibMath(x.study, x.options), m);
};

export interface BarraDoTornado {
    variavel: VariavelDoEstudo;
    rotulo: string;
    base: number;
    /** Valor com o choque para cima (+d) e para baixo (−d). NaN = a métrica deixa de existir (TIR sem raiz). */
    acima: number;
    abaixo: number;
    /** O pior e o melhor dos dois choques; NaN quando algum lado não tem a métrica. */
    pior: number;
    melhor: number;
    /** Um dos choques faz a métrica sumir (a TIR deixa de existir): vai para o topo do tornado. */
    perdeAMetrica: boolean;
}

/** Uma barra por variável, ordenadas pela amplitude (as sem métrica vão para o fim). */
export function tornado(study: ImovibStudy, metrica: MetricaDoEstudo, choques: Choques = {}): BarraDoTornado[] {
    const base = medir(study, {}, metrica);
    const barras = VARIAVEIS_DO_ESTUDO.map(v => {
        const d = choques[v] ?? CHOQUES_PADRAO[v];
        const acima = medir(study, { [v]: d }, metrica);
        const abaixo = medir(study, { [v]: -d }, metrica);
        const perdeAMetrica = Number.isFinite(base) && (!Number.isFinite(acima) || !Number.isFinite(abaixo)) && (Number.isFinite(acima) || Number.isFinite(abaixo));
        return { variavel: v, rotulo: ROTULO_DA_VARIAVEL[v], base, acima, abaixo, pior: Math.min(acima, abaixo), melhor: Math.max(acima, abaixo), perdeAMetrica };
    });
    // Perder a métrica (a TIR some) é o maior efeito possível: essas barras vêm primeiro.
    const amplitude = (x: BarraDoTornado) => (x.perdeAMetrica ? Infinity : Number.isFinite(x.melhor - x.pior) ? x.melhor - x.pior : -1);
    return barras.sort((x, y) => amplitude(y) - amplitude(x));
}

/** `grade[i][j]` = métrica com o delta i do eixo y e o delta j do eixo x. */
export function gradeCruzada(
    study: ImovibStudy,
    x: { variavel: VariavelDoEstudo; deltas: number[] },
    y: { variavel: VariavelDoEstudo; deltas: number[] },
    metrica: MetricaDoEstudo,
): number[][] {
    return y.deltas.map(dy => x.deltas.map(dx => {
        const choques: Choques = { [y.variavel]: dy };
        choques[x.variavel] = (choques[x.variavel] ?? 0) + dx;
        return medir(study, choques, metrica);
    }));
}
