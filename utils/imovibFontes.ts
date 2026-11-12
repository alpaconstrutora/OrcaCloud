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
    /** A parte de `aporte` que vem das fontes por participação. */
    aporteParticipacao: number[];
    /** Parcelas das fontes a juros (≤ 0). */
    remuneracao: number[];
    /** Fração de cada distribuição que vai para as fontes por participação (0,3 = 30%). */
    participacao: number;
    /** Premissas que não cabem no estudo; o cálculo segue e a tela avisa. */
    avisos: string[];
}

export const ROTULO_DO_TIPO_DE_FONTE: Record<ImovibFundingSource['kind'], string> = {
    mutuo: 'Mútuo', cri: 'CRI', scp: 'SCP', investidor: 'Investidor', outro: 'Outro',
};

export const ROTULO_DO_SISTEMA: Record<ImovibFundingSource['amortization'], string> = {
    BULLET: 'Tudo no vencimento', PRICE: 'Price', SAC: 'SAC',
};

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** "12% a.a., tudo no vencimento em 24 meses" ou "30% de cada distribuição" — coluna da tabela. */
export function comoEPaga(f: ImovibFundingSource): string {
    if (f.remuneration === 'participacao') return `${num(Number(f.profit_share_percent) || 0)}% de cada distribuição`;
    const prazo = Math.max(1, Math.round(f.term_months || 1));
    const carencia = (f.grace_months ?? 0) > 0 && f.amortization !== 'BULLET' ? `, carência de ${MESES(f.grace_months!)}` : '';
    const sistema = f.amortization === 'BULLET' ? 'tudo no vencimento' : ROTULO_DO_SISTEMA[f.amortization];
    return `${num(Number(f.rate_annual) || 0)}% a.a., ${sistema} em ${MESES(prazo)}${carencia}`;
}

/** "Mútuo, entra no mês 3, 12% a.a., tudo no vencimento em 24 meses" — Excel. */
export const descreverFonte = (f: ImovibFundingSource): string =>
    `${ROTULO_DO_TIPO_DE_FONTE[f.kind]}, entra no mês ${f.entry_month}, ${comoEPaga(f)}`;

// Data qualquer: o cronograma só precisa da sequência de meses, e a parcela k
// cai no mês `entrada + k` do estudo.
const DATA_DA_ENTRADA = '2001-01-15';
const MESES = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

/**
 * `duracao` é o horizonte das fontes (o fim das receitas): vencimento depois dele
 * é quitado nele. `tamanho` é o tamanho das séries (o fluxo inteiro, que o
 * pós-obra pode estender); padrão = `duracao`.
 */
export function fluxoDasFontes(fontes: ImovibFundingSource[], duracao: number, tamanho: number = duracao): FluxoDasFontes {
    const n = Math.max(0, duracao);
    const aporte = new Array<number>(Math.max(n, tamanho)).fill(0);
    const aporteParticipacao = new Array<number>(Math.max(n, tamanho)).fill(0);
    const remuneracao = new Array<number>(Math.max(n, tamanho)).fill(0);
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
            aporteParticipacao[entrada - 1] += valor;
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
    return { aporte, aporteParticipacao, remuneracao, participacao, avisos };
}

/**
 * Quanto de cada distribuição vai para as fontes por participação (≥ 0, um valor
 * por mês). As distribuições devolvem primeiro o capital ainda não devolvido — o
 * que o incorporador aportou e o que as fontes trouxeram, na proporção do que
 * falta a cada um; só o que passa disso é lucro, e as fontes ficam com
 * `participacao` dele. Assim a parte delas não depende do caixa mínimo (reserva é
 * liquidez, não lucro). Retorno preferencial e taxa de performance ficam fora
 * (plano, "Fora do escopo").
 */
export function partilhaDasDistribuicoes(
    aportes: { aporte: number; distribuicao: number }[],
    aporteParticipacao: number[],
    participacao: number,
): number[] {
    let capitalDoIncorporador = 0;
    let capitalDasFontes = 0;
    return aportes.map((l, i) => {
        capitalDoIncorporador += l.aporte;
        capitalDasFontes += aporteParticipacao[i] ?? 0;
        const emAberto = capitalDoIncorporador + capitalDasFontes;
        const devolvido = Math.min(l.distribuicao, emAberto);
        const dasFontes = emAberto > 0 ? devolvido * (capitalDasFontes / emAberto) : 0;
        capitalDasFontes -= dasFontes;
        capitalDoIncorporador -= devolvido - dasFontes;
        return dasFontes + (l.distribuicao - devolvido) * participacao;
    });
}
