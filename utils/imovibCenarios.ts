import type { ImovibStudy, ImovibScenario } from '../types';
import type { ImovibMathOptions } from './imovibMotor';
import { aplicarChoques, Choques, VariavelDoEstudo, VARIAVEIS_DO_ESTUDO } from './imovibVariacoes';
import type { DistribuicaoTriangular } from './imovibMonteCarlo';

/**
 * Cenários salvos do estudo (item 3.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Testes: __tests__/imovibMonteCarlo.test.ts.
 */

/** O estudo com os choques do cenário aplicados (cópia; o estudo não muda). */
export function aplicarCenario(study: ImovibStudy, choques: Choques): { study: ImovibStudy; options: ImovibMathOptions } {
    return aplicarChoques(study, choques);
}

/**
 * Faixas do Monte Carlo (item 3.4): com cenários Pessimista e Otimista salvos, a
 * faixa de cada variável vai do menor ao maior choque entre os dois (e o zero);
 * sem eles, ± o choque do tornado. A moda é sempre o estudo (delta 0).
 */
export function faixasDoMonteCarlo(
    cenarios: Pick<ImovibScenario, 'kind' | 'choques'>[],
    choquesDoTornado: Record<VariavelDoEstudo, number>,
): Partial<Record<VariavelDoEstudo, DistribuicaoTriangular>> {
    const pess = cenarios.find(c => c.kind === 'pessimista');
    const otim = cenarios.find(c => c.kind === 'otimista');
    const out: Partial<Record<VariavelDoEstudo, DistribuicaoTriangular>> = {};
    for (const v of VARIAVEIS_DO_ESTUDO) {
        if (pess && otim) {
            const valores = [pess.choques[v] ?? 0, otim.choques[v] ?? 0, 0];
            const min = Math.min(...valores);
            const max = Math.max(...valores);
            if (min !== max) out[v] = { min, moda: 0, max };
        } else {
            const d = Math.abs(choquesDoTornado[v] ?? 0);
            if (d > 0) out[v] = { min: -d, moda: 0, max: d };
        }
    }
    return out;
}
