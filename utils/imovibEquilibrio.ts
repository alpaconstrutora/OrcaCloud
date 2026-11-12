import type { ImovibStudy } from '../types';
import { computeImovibMath, ImovibMathOptions } from './imovibMotor';

/**
 * Pontos de equilíbrio do estudo, achados rodando o motor de novo sobre cópias
 * do estudo (nunca alteram o estudo recebido). Item 2.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md.
 * Testes: __tests__/imovibEquilibrio.test.ts.
 *
 * Cada busca confere antes que o alvo troca de sinal no intervalo; se não troca,
 * devolve `sem_raiz` — nunca o limite da busca como se fosse resposta.
 */
export interface PontoDeEquilibrio {
    valor: number | null;
    /** `acima_do_vgv`: só para vendas mínimas — mesmo vendendo tudo o VPL fica negativo. */
    motivo?: 'sem_raiz' | 'sem_vgv' | 'acima_do_vgv';
}

export type AlvoDoTerreno =
    | { tipo: 'vpl_zero' }
    | { tipo: 'margem'; pct: number }
    | { tipo: 'tir'; pctAnual: number };

const SEM_RAIZ: PontoDeEquilibrio = { valor: null, motivo: 'sem_raiz' };
const SEM_VGV: PontoDeEquilibrio = { valor: null, motivo: 'sem_vgv' };

/** Raiz de `f` entre `a` e `b` (f(a) e f(b) com sinais opostos), por bissecção. */
const bissectar = (f: (x: number) => number, a: number, b: number, tolerancia: number): number => {
    let lo = a, hi = b;
    let fLo = f(lo);
    for (let i = 0; i < 200 && Math.abs(hi - lo) > tolerancia; i++) {
        const mid = (lo + hi) / 2;
        const fMid = f(mid);
        if (fMid === 0) return mid;
        if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else hi = mid;
    }
    return (lo + hi) / 2;
};

/**
 * Raiz de uma função DECRESCENTE a partir de `x0`, procurando para o lado em
 * que ela troca de sinal: dobra o passo até achar a troca (no máximo `passos`
 * vezes), sem passar de `limiteBaixo`.
 */
const raizDecrescente = (f: (x: number) => number, x0: number, passoInicial: number, limiteBaixo: number, tolerancia: number): number | null => {
    const f0 = f(x0);
    if (f0 === 0) return x0;
    if (f0 > 0) {
        let passo = passoInicial;
        for (let i = 0; i < 30; i++, passo *= 2) {
            const x = x0 + passo;
            if (f(x) < 0) return bissectar(f, x0, x, tolerancia);
        }
        return null;
    }
    if (f(limiteBaixo) <= 0) return null;
    return bissectar(f, limiteBaixo, x0, tolerancia);
};

// As buscas só olham VPL, lucro ou margem: sem TIR, cada chamada do motor sai
// muito mais barata (pendência da Fase 2 do plano: ~325 ms no Resumo de 108 meses).
const vplCom = (study: ImovibStudy, options?: ImovibMathOptions) => computeImovibMath(study, { ...options, semTir: true }).vpl;
const temVgv = (study: ImovibStudy) => computeImovibMath(study, { semTir: true }).vgvTotal > 0;

/** Maior custo de terreno (R$) que ainda atinge o alvo. */
export function terrenoMaximo(study: ImovibStudy, alvo: AlvoDoTerreno): PontoDeEquilibrio {
    const base = computeImovibMath(study, { semTir: true });
    if (!(base.vgvTotal > 0)) return SEM_VGV;
    const metrica = (terreno: number): number => {
        const r = computeImovibMath({ ...study, land_cost: terreno }, { semTir: alvo.tipo !== 'tir' });
        switch (alvo.tipo) {
            case 'vpl_zero': return r.vpl;
            case 'margem': return r.monthlyFlows.reduce((a, f) => a + f.net, 0) / r.vgvTotal - alvo.pct / 100;
            case 'tir': return Number.isFinite(r.annualIrr) ? r.annualIrr - alvo.pctAnual : -Infinity;
        }
    };
    if (!(metrica(0) > 0)) return SEM_RAIZ;
    const valor = raizDecrescente(metrica, 0, Math.max(1, base.vgvTotal), 0, 0.01);
    return valor == null ? SEM_RAIZ : { valor };
}

/** Variação do preço (%, sobre o VGV) que leva o VPL a zero. Negativa = queda suportada. */
export function precoMinimo(study: ImovibStudy): PontoDeEquilibrio {
    if (!temVgv(study)) return SEM_VGV;
    // O VPL CRESCE com o preço: procura a raiz de −VPL, que é decrescente.
    const f = (d: number) => -vplCom(study, { vgvDelta: d });
    const valor = raizDecrescente(f, 0, 10, -100, 1e-7);
    return valor == null ? SEM_RAIZ : { valor };
}

/** Variação do custo de obra (%) que leva o VPL a zero. Positiva = alta suportada. */
export function custoMaximoDeObra(study: ImovibStudy): PontoDeEquilibrio {
    if (!temVgv(study)) return SEM_VGV;
    const f = (d: number) => vplCom(study, { costDelta: d });
    const valor = raizDecrescente(f, 0, 10, -100, 1e-7);
    return valor == null ? SEM_RAIZ : { valor };
}

/**
 * Percentual do VGV VENDÁVEL (depois das permutas) que precisa ser vendido, no
 * mesmo ritmo da curva, para o VPL chegar a zero. A receita do motor é linear no
 * VGV, então vender uma fração a mais ou a menos equivale a mudar o preço: é a
 * fração que a curva vende × (100% + a variação de `precoMinimo`). Acima de 100%
 * do VGV vendável não existe — mesmo vendendo tudo o VPL fica negativo.
 */
export function vendasMinimas(study: ImovibStudy, precoJaCalculado?: PontoDeEquilibrio): PontoDeEquilibrio {
    // A tela já calculou o preço mínimo: repetir a busca dobrava o tempo desta.
    const p = precoJaCalculado ?? precoMinimo(study);
    if (p.valor == null) return p;
    const fracaoVendida = 1 - computeImovibMath(study, { semTir: true }).estoqueNaoVendidoPct;
    const valor = (100 + p.valor) * fracaoVendida;
    return valor > 100 + 1e-9 ? { valor: null, motivo: 'acima_do_vgv' } : { valor };
}
