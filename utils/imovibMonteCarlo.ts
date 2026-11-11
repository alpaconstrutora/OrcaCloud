import type { ImovibStudy } from '../types';
import { computeImovibMath } from './imovibMotor';
import { aplicarChoques, Choques, VariavelDoEstudo } from './imovibVariacoes';
import { prng } from './prng';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Simulação de Monte Carlo do estudo (item 3.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): sorteia um delta
 * por variável numa distribuição triangular, roda o motor e junta os resultados.
 * A semente torna a simulação reproduzível. Testes: __tests__/imovibMonteCarlo.test.ts.
 */

export interface DistribuicaoTriangular { min: number; moda: number; max: number; }

export interface Percentis { p10: number; p50: number; p90: number; }

export interface ResultadoMonteCarlo {
    iteracoes: number;
    /** Sorteios em que o fluxo não tem TIR (ficam fora dos percentis da TIR). */
    semTir: number;
    tir: Percentis | null;
    vpl: Percentis;
    probVplNegativo: number;
    /**
     * Sobre todos os sorteios. Sorteio sem TIR e com VPL negativo (fluxo que
     * nunca se paga) conta como abaixo da TMA; sem TIR e com VPL ≥ 0, não.
     */
    probTirAbaixoDaTma: number | null;
    histogramaVpl: { de: number; ate: number; n: number }[];
}

/** Sorteio triangular pela inversa da distribuição acumulada. */
export function sortearTriangular(d: DistribuicaoTriangular, u: number): number {
    const { min, moda, max } = d;
    if (!(max > min)) return min;
    const c = (moda - min) / (max - min);
    return u < c
        ? min + Math.sqrt(u * (max - min) * (moda - min))
        : max - Math.sqrt((1 - u) * (max - min) * (max - moda));
}

/** Percentil com interpolação linear entre os vizinhos (lista já ordenada). */
const percentil = (ordenados: number[], p: number) => {
    if (ordenados.length === 1) return ordenados[0];
    const pos = (ordenados.length - 1) * p;
    const i = Math.floor(pos);
    const f = pos - i;
    return i + 1 < ordenados.length ? ordenados[i] * (1 - f) + ordenados[i + 1] * f : ordenados[i];
};
const percentis = (xs: number[]): Percentis => {
    const o = [...xs].sort((a, b) => a - b);
    return { p10: percentil(o, 0.1), p50: percentil(o, 0.5), p90: percentil(o, 0.9) };
};

const FAIXAS_DO_HISTOGRAMA = 20;

export function simularMonteCarlo(
    study: ImovibStudy,
    variaveis: Partial<Record<VariavelDoEstudo, DistribuicaoTriangular>>,
    iteracoes: number,
    semente: number,
): ResultadoMonteCarlo {
    const n = Math.max(1, Math.round(iteracoes));
    const aleatorio = prng(semente);
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    // Ordem fixa das variáveis: a mesma semente sorteia os mesmos valores para as mesmas variáveis.
    const ordem = (Object.keys(variaveis) as VariavelDoEstudo[]).sort();
    const vpls: number[] = [];
    const tirs: number[] = [];
    let abaixoDaTma = 0;

    for (let k = 0; k < n; k++) {
        const choques: Choques = {};
        for (const v of ordem) choques[v] = sortearTriangular(variaveis[v]!, aleatorio());
        const x = aplicarChoques(study, choques);
        const r = computeImovibMath(x.study, x.options);
        vpls.push(r.vpl);
        if (Number.isFinite(r.annualIrr)) {
            tirs.push(r.annualIrr);
            if (r.annualIrr < tma) abaixoDaTma++;
        } else if (r.vpl < 0) abaixoDaTma++;
    }

    const menor = Math.min(...vpls);
    const maior = Math.max(...vpls);
    const largura = (maior - menor) / FAIXAS_DO_HISTOGRAMA;
    const histogramaVpl = largura > 0
        ? Array.from({ length: FAIXAS_DO_HISTOGRAMA }, (_, i) => ({ de: menor + i * largura, ate: menor + (i + 1) * largura, n: 0 }))
        : [{ de: menor, ate: maior, n: 0 }];
    for (const v of vpls) {
        const i = largura > 0 ? Math.min(FAIXAS_DO_HISTOGRAMA - 1, Math.floor((v - menor) / largura)) : 0;
        histogramaVpl[i].n++;
    }

    return {
        iteracoes: n,
        semTir: n - tirs.length,
        tir: tirs.length ? percentis(tirs) : null,
        vpl: percentis(vpls),
        probVplNegativo: vpls.filter(v => v < 0).length / n,
        probTirAbaixoDaTma: tirs.length || abaixoDaTma ? abaixoDaTma / n : null,
        histogramaVpl,
    };
}
