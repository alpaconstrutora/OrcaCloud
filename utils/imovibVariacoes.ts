import type { ImovibStudy } from '../types';
import type { ImovibMathOptions } from './imovibMotor';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Uma premissa do estudo variada de uma vez — base do tornado, dos cenários e
 * dos pontos de equilíbrio. Item 2.2 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md.
 *
 * Unidade do `delta`:
 *   preco, custo_obra, terreno → percentual (10 = +10%);
 *   velocidade_vendas, prazo_obra → meses (duração das vendas / da obra);
 *   juros_financiamento → pontos percentuais ao ano;
 *   indice_obra → pontos percentuais ao mês;
 *   distrato → pontos percentuais.
 */
export type VariavelDoEstudo = 'preco' | 'custo_obra' | 'terreno' | 'velocidade_vendas'
    | 'prazo_obra' | 'juros_financiamento' | 'indice_obra' | 'distrato';

const D = IMOVIB_DEFAULTS;
const num = (x: number | null | undefined, padrao: number) => (x == null || Number.isNaN(x) ? padrao : x);

/** Devolve CÓPIA do estudo e as opções do motor; nunca altera o estudo recebido. */
export function aplicarVariacao(study: ImovibStudy, variavel: VariavelDoEstudo, delta: number): { study: ImovibStudy; options: ImovibMathOptions } {
    const s: ImovibStudy = { ...study };
    switch (variavel) {
        case 'preco':
            return { study: s, options: { vgvDelta: delta } };
        case 'custo_obra':
            return { study: s, options: { costDelta: delta } };
        case 'terreno':
            s.land_cost = (study.land_cost || 0) * (1 + delta / 100);
            break;
        case 'velocidade_vendas':
            s.sales_duration_months = Math.max(1, Math.round(num(study.sales_duration_months, D.sales_duration_months) + delta));
            break;
        case 'prazo_obra':
            s.construction_duration_months = Math.max(1, Math.round(num(study.construction_duration_months, D.construction_duration_months) + delta));
            break;
        case 'juros_financiamento':
            s.financing_rate_annual = num(study.financing_rate_annual, D.financing_rate_annual) + delta;
            break;
        case 'indice_obra':
            s.cost_index_rate_monthly = num(study.cost_index_rate_monthly, num(study.inflation_rate, D.inflation_rate)) + delta;
            break;
        case 'distrato':
            s.cancellation_rate_percent = Math.max(0, num(study.cancellation_rate_percent, D.cancellation_rate_percent) + delta);
            break;
    }
    return { study: s, options: {} };
}

/** Várias premissas variadas juntas (cenário, célula da grade, sorteio do Monte Carlo). */
export type Choques = Partial<Record<VariavelDoEstudo, number>>;

export const VARIAVEIS_DO_ESTUDO: VariavelDoEstudo[] = [
    'preco', 'custo_obra', 'terreno', 'velocidade_vendas', 'prazo_obra', 'juros_financiamento', 'indice_obra', 'distrato',
];

export const ROTULO_DA_VARIAVEL: Record<VariavelDoEstudo, string> = {
    preco: 'Preço de venda',
    custo_obra: 'Custo de obra',
    terreno: 'Custo do terreno',
    velocidade_vendas: 'Prazo das vendas',
    prazo_obra: 'Prazo da obra',
    juros_financiamento: 'Juros do financiamento',
    indice_obra: 'Índice da obra',
    distrato: 'Distrato',
};

export const UNIDADE_DA_VARIAVEL: Record<VariavelDoEstudo, string> = {
    preco: '%', custo_obra: '%', terreno: '%',
    velocidade_vendas: 'meses', prazo_obra: 'meses',
    juros_financiamento: 'p.p. a.a.', indice_obra: 'p.p. a.m.', distrato: 'p.p.',
};

/** Aplica cada choque sobre o resultado do anterior; preço e custo somam nas opções do motor. */
export function aplicarChoques(study: ImovibStudy, choques: Choques): { study: ImovibStudy; options: ImovibMathOptions } {
    let atual = study;
    const options: ImovibMathOptions = {};
    for (const v of VARIAVEIS_DO_ESTUDO) {
        const d = choques[v];
        if (d == null || d === 0 || !Number.isFinite(d)) continue;
        const x = aplicarVariacao(atual, v, d);
        atual = x.study;
        if (x.options.vgvDelta != null) options.vgvDelta = (options.vgvDelta ?? 0) + x.options.vgvDelta;
        if (x.options.costDelta != null) options.costDelta = (options.costDelta ?? 0) + x.options.costDelta;
    }
    return { study: atual === study ? { ...study } : atual, options };
}
