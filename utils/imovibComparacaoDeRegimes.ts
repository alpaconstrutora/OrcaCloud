import type { ImovibStudy } from '../types';
import { computeImovibMath } from './imovibMotor';
import { calcularIndicadores } from './imovibIndicadores';
import { RegimeTributarioDoEstudo, ROTULO_DO_REGIME } from './imovibTributos';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';

/**
 * Comparação dos regimes tributários (item 6.3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o mesmo estudo
 * calculado em cada regime. Arquivo próprio porque o motor importa
 * utils/imovibTributos.ts. Testes: __tests__/imovibTributos.test.ts.
 */
export interface LinhaDaComparacao {
    regime: RegimeTributarioDoEstudo;
    impostoTotal: number;
    /** Imposto ÷ receita bruta (0,04 = 4%); null sem receita. */
    aliquotaEfetiva: number | null;
    vpl: number;
    tir: number;
    /** Margem líquida sobre o VGV (fração); null sem VGV. */
    margem: number | null;
}

export function compararRegimes(study: ImovibStudy): LinhaDaComparacao[] {
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    return (Object.keys(ROTULO_DO_REGIME) as RegimeTributarioDoEstudo[]).map(regime => {
        const r = computeImovibMath({ ...study, tax_regime: regime });
        const receita = r.monthlyFlows.reduce((a, f) => a + f.rev, 0);
        const impostoTotal = -r.monthlyFlows.reduce((a, f) => a + f.linhas.impostos, 0);
        return {
            regime,
            impostoTotal,
            aliquotaEfetiva: receita > 0 ? impostoTotal / receita : null,
            vpl: r.vpl,
            tir: r.annualIrr,
            margem: calcularIndicadores(r, tma).margemLiquidaSobreVgv,
        };
    });
}
