import type { ImovibStudy } from '../types';
import { HIPOTESES_TRIBUTARIAS } from '../constants/imovibDefaults';

/**
 * Tributos por regime (item 6.1 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D4). Puro;
 * o motor (utils/imovibMotor.ts) põe o resultado na linha `impostos`.
 * Testes: __tests__/imovibTributos.test.ts.
 *
 * Lucro real é ESTIMATIVA (a tela diz isso): PIS/Cofins sobre a receita menos o
 * crédito sobre o custo, com o crédito que sobra passando para os meses
 * seguintes; IRPJ/CSLL sobre o lucro de cada ano do estudo (blocos de 12 meses:
 * receita − custo − deduções − PIS/Cofins), pago no último mês do ano. O prejuízo
 * acumulado compensa o lucro dos anos seguintes SEM limite (decisão do usuário de
 * 11/11/2026, na revisão da Fase 6: sem compensação, o imposto passava do lucro
 * do projeto, porque na incorporação o custo vem antes da receita).
 */

export type RegimeTributarioDoEstudo = 'manual' | 'ret' | 'ret_his' | 'presumido' | 'real';

export const ROTULO_DO_REGIME: Record<RegimeTributarioDoEstudo, string> = {
    manual: 'Manual (rubricas de imposto ou Dinâmica)',
    ret: 'RET (patrimônio de afetação)',
    ret_his: 'RET de interesse social',
    presumido: 'Lucro presumido',
    real: 'Lucro real (estimativa)',
};

export type HipotesesTributarias = { -readonly [K in keyof typeof HIPOTESES_TRIBUTARIAS]: number };

/** As alíquotas que o estudo informou (`tax_hypotheses`) sobre os padrões. */
export function hipotesesDoEstudo(study: Pick<ImovibStudy, 'tax_hypotheses'>): HipotesesTributarias {
    const h = { ...HIPOTESES_TRIBUTARIAS } as HipotesesTributarias;
    const doEstudo = study.tax_hypotheses ?? {};
    (Object.keys(h) as (keyof HipotesesTributarias)[]).forEach(k => {
        const v = Number(doEstudo[k]);
        if (doEstudo[k] != null && Number.isFinite(v) && v >= 0) h[k] = v;
    });
    return h;
}

/**
 * Imposto de cada mês (≥ 0, índice 0 = mês 1). `custoPorMes` e `deducoesPorMes`
 * (corretagem, outras deduções, devolução de distrato; ≥ 0) só valem no lucro real.
 */
export function impostoPorMes(
    regime: Exclude<RegimeTributarioDoEstudo, 'manual'>,
    receitaPorMes: number[],
    custoPorMes: number[],
    h: HipotesesTributarias,
    deducoesPorMes: number[] = [],
): number[] {
    const n = receitaPorMes.length;
    const pct = (x: number) => x / 100;
    if (regime === 'ret') return receitaPorMes.map(r => Math.max(0, r) * pct(h.retPct));
    if (regime === 'ret_his') return receitaPorMes.map(r => Math.max(0, r) * pct(h.retHisPct));
    if (regime === 'presumido') return receitaPorMes.map(r => Math.max(0, r) * pct(h.presumidoPct));

    // Lucro real (estimativa).
    const imposto = new Array<number>(n).fill(0);
    let credito = 0;
    for (let i = 0; i < n; i++) {
        credito += Math.max(0, custoPorMes[i] ?? 0) * pct(h.realCreditoSobreCustoPct);
        const debito = Math.max(0, receitaPorMes[i]) * pct(h.realPisCofinsPct);
        const usado = Math.min(debito, credito);
        credito -= usado;
        imposto[i] = debito - usado;
    }
    let prejuizo = 0;
    for (let ini = 0; ini < n; ini += 12) {
        const fim = Math.min(n, ini + 12) - 1;
        let lucro = 0;
        for (let i = ini; i <= fim; i++) lucro += (receitaPorMes[i] ?? 0) - (custoPorMes[i] ?? 0) - (deducoesPorMes[i] ?? 0) - imposto[i];
        if (lucro <= 0) { prejuizo -= lucro; continue; }
        const compensado = Math.min(prejuizo, lucro);
        prejuizo -= compensado;
        imposto[fim] += (lucro - compensado) * pct(h.realIrCsPct);
    }
    return imposto;
}
