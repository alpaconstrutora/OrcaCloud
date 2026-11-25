import { somarMeses, somarDias, mesesEntre } from './paymentPlan';
import { mesesDoCicloDeReajuste } from './reajusteAniversario';

/**
 * Renovação por aditivo CONTINUA a série de parcelas que já existe (pedido de
 * 25/11/2026, CTL-006-012-0001). Antes a série nova começava no 1º dia do período
 * novo, no `due_day` do contrato: o contrato original cobrava o mês DEPOIS (dia 10,
 * última parcela em 10/04/2019 para a vigência até 22/03/2019) e o aditivo nasceu
 * em 23/03/2019 — março e abril com duas cobranças e o fim um mês e meio cedo.
 *
 * Regra: a 1ª parcela nova é um ciclo depois da ÚLTIMA parcela existente, no dia
 * de vencimento da série; uma parcela por ciclo do período novo.
 */

export interface ContinuacaoDaSerie {
    /** Vencimento da 1ª parcela do período novo. */
    primeiro: string;
    /** Parcelas do período novo (uma por ciclo; ciclo incompleto conta). */
    quantidade: number;
}

/** Meses de um ciclo de cobrança (Mensal = 1 … Anual = 12). Desconhecido = Mensal. */
export function mesesDoCicloDeCobranca(ciclo?: string | null): number {
    return mesesDoCicloDeReajuste(ciclo) ?? 1;
}

/** Quantos ciclos cabem no período [inicio, fim] — o incompleto conta como um. */
export function ciclosNoPeriodo(inicio: string, fim: string, mesesDoCiclo: number): number {
    const fimExclusivo = somarDias(fim, 1);
    // mesesEntre só olha ano/mês: ajusta para meses INTEIROS e soma o incompleto.
    let meses = mesesEntre(inicio, fimExclusivo);
    if (somarMeses(inicio, meses) > fimExclusivo) meses -= 1;
    if (somarMeses(inicio, meses) < fimExclusivo) meses += 1;
    return Math.max(1, Math.ceil(meses / Math.max(1, mesesDoCiclo)));
}

/**
 * `null` = não há série para continuar (sem parcela, ou a última parou mais de
 * um ciclo antes do período novo) — aí vale a geração a partir do início.
 * `dia` = dia de vencimento a usar (o da renovação); vazio = o da última parcela.
 */
export function continuacaoDaSerie(p: {
    ultimoVencimento: string | null | undefined;
    inicio: string;
    fim: string;
    ciclo?: string | null;
    dia?: number | null;
}): ContinuacaoDaSerie | null {
    const ultimo = (p.ultimoVencimento || '').slice(0, 10);
    if (!ultimo) return null;
    const meses = mesesDoCicloDeCobranca(p.ciclo);
    if (ultimo < somarMeses(p.inicio, -meses)) return null;
    const mesSeguinte = somarMeses(`${ultimo.slice(0, 8)}01`, meses);
    const dia = p.dia && p.dia >= 1 && p.dia <= 31 ? Math.floor(p.dia) : Number(ultimo.slice(8, 10));
    const [a, m] = mesSeguinte.split('-').map(Number);
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const primeiro = `${mesSeguinte.slice(0, 8)}${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
    return { primeiro, quantidade: ciclosNoPeriodo(p.inicio, p.fim, meses) };
}
