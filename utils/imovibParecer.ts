/**
 * Parecer e critérios (item 10.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Quatro critérios com
 * o valor do estudo, o mínimo (editável no estudo; vazio = padrão) e se atende.
 * Valor que não existe (TIR sem troca de sinal, margem sem VGV) e critério sem
 * mínimo (exposição) dão `atende` nulo — "não dá para dizer", nunca "não atende".
 * O parecer em si é de uma pessoa: o sistema não o escolhe.
 * Testes: __tests__/imovibParecer.test.ts.
 */
import type { ImovibStudy } from '../types';
import type { ImovibMathResult } from './imovibMotor';
import type { IndicadoresDoEstudo } from './imovibIndicadores';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

export interface CriterioDoParecer {
    id: 'tir_acima_da_tma' | 'margem_minima' | 'exposicao_maxima' | 'vpl_positivo';
    rotulo: string;
    valor: number | null;
    minimo: number | null;
    unidade: '% a.a.' | '%' | 'R$';
    atende: boolean | null;
}

export type Parecer = NonNullable<ImovibStudy['recommendation']>;

export const ROTULO_DO_PARECER: Record<Parecer, string> = {
    aprovar: 'Aprovar',
    aprovar_com_condicoes: 'Aprovar com condições',
    renegociar: 'Renegociar',
    reprovar: 'Reprovar',
};

const finito = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : x);
const compara = (valor: number | null, minimo: number | null, ok: (v: number, m: number) => boolean) =>
    valor == null || minimo == null ? null : ok(valor, minimo);

export function criteriosDoParecer(study: ImovibStudy, r: ImovibMathResult, ind: IndicadoresDoEstudo): CriterioDoParecer[] {
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    const tir = finito(r.annualIrr);
    const minimoTir = tma + (study.hurdle_irr_spread ?? IMOVIB_DEFAULTS.hurdle_irr_spread);
    const margem = ind.margemLiquidaSobreVgv == null ? null : ind.margemLiquidaSobreVgv * 100;
    const minimoMargem = study.hurdle_margin_percent ?? IMOVIB_DEFAULTS.hurdle_margin_percent;
    const exposicao = Math.max(0, -r.maxExposure);
    const limiteExposicao = study.hurdle_max_exposure ?? null;
    return [
        { id: 'tir_acima_da_tma', rotulo: 'TIR acima da TMA', valor: tir, minimo: minimoTir, unidade: '% a.a.', atende: compara(tir, minimoTir, (v, m) => v >= m) },
        { id: 'margem_minima', rotulo: 'Margem líquida sobre o VGV', valor: margem, minimo: minimoMargem, unidade: '%', atende: compara(margem, minimoMargem, (v, m) => v >= m) },
        { id: 'exposicao_maxima', rotulo: 'Exposição máxima de caixa', valor: exposicao, minimo: limiteExposicao, unidade: 'R$', atende: compara(exposicao, limiteExposicao, (v, m) => v <= m) },
        { id: 'vpl_positivo', rotulo: 'VPL positivo', valor: finito(r.vpl), minimo: 0, unidade: 'R$', atende: compara(finito(r.vpl), 0, (v) => v > 0) },
    ];
}
