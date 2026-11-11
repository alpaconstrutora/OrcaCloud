import type { ImovibFundingSource } from '../types';
import { buildSchedule } from './debtAmortization';

/**
 * Outras fontes de capital do estudo (item 4.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, decisão D3). Função
 * pura; o motor (utils/imovibMotor.ts) põe `aporte` em `aporteDeTerceiros`,
 * `remuneracao` em `remuneracaoDeTerceiros` e aplica `participacao` sobre cada
 * distribuição de utils/imovibAportes.ts. Testes: __tests__/imovibFontes.test.ts.
 *
 * Fonte a juros: o cronograma é o de `buildSchedule` (utils/debtAmortization.ts),
 * em parcelas mensais a partir do mês seguinte à entrada; a taxa anual é
 * convertida de forma efetiva (12% a.a. = 0,9489% a.m.).
 */

export interface FluxoDasFontes {
    /** Dinheiro que entra no mês (≥ 0, índice 0 = mês 1). */
    aporte: number[];
    /** Parcelas das fontes a juros (≤ 0). */
    remuneracao: number[];
    /** Fração de cada distribuição que vai para as fontes por participação (0,3 = 30%). */
    participacao: number;
    /** Premissas que não cabem no estudo; o cálculo segue e a tela avisa. */
    avisos: string[];
}

// Data qualquer: o cronograma só precisa da sequência de meses, e a parcela k
// cai no mês `entrada + k` do estudo.
const DATA_DA_ENTRADA = '2001-01-15';
const MESES = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

export function fluxoDasFontes(fontes: ImovibFundingSource[], duracao: number): FluxoDasFontes {
    const n = Math.max(0, duracao);
    const aporte = new Array<number>(n).fill(0);
    const remuneracao = new Array<number>(n).fill(0);
    const avisos: string[] = [];
    let participacao = 0;

    for (const f of fontes) {
        const valor = Number(f.amount) || 0;
        if (!(valor > 0)) continue;
        const entrada = Math.max(1, Math.round(f.entry_month || 1));
        if (entrada > n) {
            avisos.push(`"${f.name}" entra no mês ${entrada}, depois do fim do estudo (mês ${n}), e ficou fora do cálculo.`);
            continue;
        }
        aporte[entrada - 1] += valor;

        if (f.remuneration === 'participacao') {
            participacao += (Number(f.profit_share_percent) || 0) / 100;
            continue;
        }

        const parcelas = buildSchedule({
            principal: valor,
            nominalRate: Number(f.rate_annual) || 0,
            ratePeriod: 'ANUAL',
            annualConversion: 'GEOMETRICA',
            system: f.amortization,
            installmentCount: Math.max(1, Math.round(f.term_months || 1)),
            installmentPeriod: 'MENSAL',
            firstDueDate: DATA_DA_ENTRADA,
            gracePrincipalPeriods: Math.max(0, Math.round(f.grace_months || 0)),
        });
        for (const p of parcelas) {
            const mes = entrada + p.seq;
            if (mes <= n) {
                remuneracao[mes - 1] -= p.total;
                continue;
            }
            // Vence depois do horizonte: o saldo devedor é quitado no último mês.
            remuneracao[n - 1] -= p.openingBalance;
            avisos.push(`"${f.name}" vence depois do fim do estudo: ${MESES(parcelas.length - p.seq + 1)} de parcelas viraram a quitação do saldo no mês ${n}.`);
            break;
        }
    }

    if (participacao > 1 + 1e-9) {
        avisos.push(`As fontes por participação somam ${(participacao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% das distribuições: passam de 100%, e o incorporador entrega mais do que distribui.`);
    }
    return { aporte, remuneracao, participacao, avisos };
}
