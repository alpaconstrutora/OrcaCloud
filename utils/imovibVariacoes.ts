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
