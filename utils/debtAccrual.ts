/**
 * Apropriação de juros por competência (PRD item 4, "juros apropriados por
 * competência").
 *
 * O cronograma diz quanto vence e quando. Isto diz quanto **já foi incorrido**
 * numa data de fechamento, mesmo que a parcela só venha a vencer depois — que é
 * o que o regime de competência exige e o de caixa ignora.
 *
 * ⚠️ A convenção de contagem MUDA O NÚMERO, e não existe uma certa: cada
 * contrato traz a sua. Por isso são cinco, escolhidas pelo usuário (decisão de
 * 2026-08-30), e nenhuma é imposta como default silencioso.
 *
 * Puro: nada aqui toca banco nem relógio — a data de fechamento é sempre
 * parâmetro.
 *
 * Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
 */

import { getBrazilianHolidays } from './brazilianHolidays';
import { round2 } from './financialMath';
import type { DebtInstallmentRow } from './debtAmortization';

/**
 * As cinco convenções de contagem de dias.
 *
 * - `BUS/252`  — dias úteis / 252. É a convenção dos títulos e operações
 *                indexadas a CDI/Selic no Brasil; para essas, é a única certa.
 * - `ACT/365`  — dias corridos / 365 fixo.
 * - `ACT/360`  — dias corridos / 360. Comum em operações em moeda estrangeira.
 * - `ACT/ACT`  — dias corridos / dias reais do ano (365 ou 366).
 * - `30/360`   — mês comercial de 30 dias, ano de 360 (regra US/NASD).
 */
export type DayCountConvention = 'BUS/252' | 'ACT/365' | 'ACT/360' | 'ACT/ACT' | '30/360';

export const DAY_COUNT_PT: Record<DayCountConvention, string> = {
    'BUS/252': 'Dias úteis / 252 (padrão CDI/Selic)',
    'ACT/365': 'Dias corridos / 365',
    'ACT/360': 'Dias corridos / 360',
    'ACT/ACT': 'Dias corridos / dias do ano',
    '30/360': 'Mês comercial 30 / 360',
};

/** Base anual de cada convenção. `ACT/ACT` depende do ano, resolvido à parte. */
const BASE: Record<DayCountConvention, number> = {
    'BUS/252': 252, 'ACT/365': 365, 'ACT/360': 360, 'ACT/ACT': 365, '30/360': 360,
};

// ─────────────────────────────────────────────────────────────────────────────
// Datas — string 'YYYY-MM-DD', sem `new Date(iso)` solto (parseia em UTC e
// desloca o dia em fuso negativo, que é o bug de data já registrado no projeto)
// ─────────────────────────────────────────────────────────────────────────────

const partes = (iso: string): [number, number, number] => {
    const [y, m, d] = iso.split('-').map(Number);
    return [y, m, d];
};

const utc = (iso: string): number => {
    const [y, m, d] = partes(iso);
    return Date.UTC(y, m - 1, d);
};

const DIA = 86_400_000;

/** Dias corridos entre duas datas (exclusivo no início, inclusivo no fim). */
export const diasCorridos = (de: string, ate: string): number =>
    Math.round((utc(ate) - utc(de)) / DIA);

const bissexto = (ano: number): boolean =>
    (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

/** Contagem 30/360 na regra US/NASD. */
function dias30360(de: string, ate: string): number {
    const [y1, m1, d1r] = partes(de);
    const [y2, m2, d2r] = partes(ate);
    let d1 = Math.min(d1r, 30);
    let d2 = d2r;
    // Se o início foi ajustado para 30, o fim também é — senão fevereiro
    // produziria período negativo contra 31 de janeiro.
    if (d2 === 31 && d1 === 30) d2 = 30;
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

// ── Dias úteis ───────────────────────────────────────────────────────────────

const cacheFeriados = new Map<number, Set<string>>();

/** Feriados nacionais do ano, em cache — `getBrazilianHolidays` recalcula Páscoa. */
function feriadosDoAno(ano: number): Set<string> {
    let s = cacheFeriados.get(ano);
    if (!s) {
        s = new Set(getBrazilianHolidays(ano).map(h => h.date));
        cacheFeriados.set(ano, s);
    }
    return s;
}

/**
 * `true` se a data é dia útil bancário: não é fim de semana nem feriado
 * NACIONAL.
 *
 * ⚠️ Feriado municipal e estadual não entra — o calendário de
 * `brazilianHolidays.ts` é o nacional. Para a maioria dos contratos isso basta
 * (é o que a ANBIMA usa), mas uma operação com calendário de praça específica
 * contaria diferente.
 */
export function ehDiaUtil(iso: string): boolean {
    const [ano] = partes(iso);
    const dow = new Date(utc(iso)).getUTCDay();
    if (dow === 0 || dow === 6) return false;
    return !feriadosDoAno(ano).has(iso);
}

/** Dias úteis no intervalo (de, ate] — exclusivo no início, inclusivo no fim. */
export function diasUteis(de: string, ate: string): number {
    const inicio = utc(de);
    const fim = utc(ate);
    if (fim <= inicio) return 0;
    let n = 0;
    // Guarda de laço: intervalo absurdo não pode travar a tela.
    const maxDias = Math.min(Math.round((fim - inicio) / DIA), 40_000);
    for (let i = 1; i <= maxDias; i++) {
        const iso = new Date(inicio + i * DIA).toISOString().slice(0, 10);
        if (ehDiaUtil(iso)) n++;
    }
    return n;
}

/** Dias entre duas datas, na convenção escolhida. */
export function contarDias(de: string, ate: string, convencao: DayCountConvention): number {
    switch (convencao) {
        case 'BUS/252': return diasUteis(de, ate);
        case '30/360': return dias30360(de, ate);
        default: return diasCorridos(de, ate);
    }
}

/** Base anual, resolvendo `ACT/ACT` pelo ano da data final. */
export function baseAnual(convencao: DayCountConvention, refISO?: string): number {
    if (convencao !== 'ACT/ACT') return BASE[convencao];
    const [ano] = partes(refISO ?? '2026-01-01');
    return bissexto(ano) ? 366 : 365;
}

/** Fração de ano entre duas datas, na convenção. Útil para taxa equivalente. */
export const fracaoDeAno = (de: string, ate: string, convencao: DayCountConvention): number =>
    contarDias(de, ate, convencao) / baseAnual(convencao, ate);

// ─────────────────────────────────────────────────────────────────────────────
// Apropriação
// ─────────────────────────────────────────────────────────────────────────────

export interface AccrualNaData {
    convencao: DayCountConvention;
    dataFechamento: string;
    /** Parcela cujo período contém a data de fechamento. */
    parcelaEmCurso?: number;
    inicioDoPeriodo?: string;
    fimDoPeriodo?: string;
    diasDecorridos: number;
    diasDoPeriodo: number;
    /** 0..1 — quanto do período já correu. */
    fracaoDecorrida: number;
    /** Juros da parcela em curso (o total dela). */
    jurosDaParcela: number;
    /** Juros já INCORRIDOS e ainda não vencidos. */
    jurosIncorridos: number;
    /** Juros de parcelas já vencidas no período consultado. */
    jurosVencidos: number;
}

/**
 * Início do período de apropriação da parcela `i`: o vencimento anterior, ou —
 * na primeira — a data informada (liberação). Sem uma âncora antes do 1º
 * vencimento, a primeira parcela não teria período e os juros dela apareceriam
 * inteiros no dia do vencimento.
 */
function inicioDoPeriodo(rows: DebtInstallmentRow[], i: number, ancora: string): string {
    return i === 0 ? ancora : rows[i - 1].dueDate;
}

/**
 * Juros incorridos e ainda não vencidos numa data de fechamento.
 *
 * `ancoraInicial` é a data em que o dinheiro entrou. Sem ela, a apropriação da
 * primeira parcela não tem de onde partir.
 */
export function accrueAt(
    rows: DebtInstallmentRow[],
    dataFechamento: string,
    convencao: DayCountConvention,
    ancoraInicial: string,
): AccrualNaData {
    const vazio: AccrualNaData = {
        convencao, dataFechamento, diasDecorridos: 0, diasDoPeriodo: 0,
        fracaoDecorrida: 0, jurosDaParcela: 0, jurosIncorridos: 0, jurosVencidos: 0,
    };
    if (rows.length === 0) return vazio;

    const jurosVencidos = round2(
        rows.filter(r => r.dueDate <= dataFechamento).reduce((a, r) => a + r.interest, 0),
    );

    const i = rows.findIndex(r => r.dueDate > dataFechamento);
    if (i === -1) {
        // Tudo já venceu: não há juros a incorrer.
        return { ...vazio, jurosVencidos };
    }

    const inicio = inicioDoPeriodo(rows, i, ancoraInicial);
    const fim = rows[i].dueDate;

    // Fechamento antes do início do 1º período: nada correu ainda.
    if (dataFechamento <= inicio) {
        return {
            ...vazio, jurosVencidos, parcelaEmCurso: rows[i].seq,
            inicioDoPeriodo: inicio, fimDoPeriodo: fim,
            diasDoPeriodo: contarDias(inicio, fim, convencao),
            jurosDaParcela: rows[i].interest,
        };
    }

    const diasDoPeriodo = contarDias(inicio, fim, convencao);
    const diasDecorridos = Math.min(contarDias(inicio, dataFechamento, convencao), diasDoPeriodo);
    // Período sem dias na convenção (ex.: DU/252 num intervalo só de feriados)
    // não pode virar divisão por zero.
    const fracao = diasDoPeriodo > 0 ? diasDecorridos / diasDoPeriodo : 0;

    return {
        convencao,
        dataFechamento,
        parcelaEmCurso: rows[i].seq,
        inicioDoPeriodo: inicio,
        fimDoPeriodo: fim,
        diasDecorridos,
        diasDoPeriodo,
        fracaoDecorrida: Number(fracao.toFixed(6)),
        jurosDaParcela: rows[i].interest,
        jurosIncorridos: round2(rows[i].interest * fracao),
        jurosVencidos,
    };
}

export interface CompetenciaMensal {
    mes: string;
    /** Juros apropriados NO MÊS, rateados pela convenção. */
    juros: number;
    /** Correção monetária apropriada no mês, pelo mesmo rateio. */
    correcao: number;
    /** Amortização — não é rateada: acontece no vencimento. */
    amortizacao: number;
    encargos: number;
}

const mesDe = (iso: string) => iso.slice(0, 7);
const proximoMes = (mes: string): string => {
    const [y, m] = mes.split('-').map(Number);
    const t = y * 12 + (m - 1) + 1;
    return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const primeiroDia = (mes: string) => `${mes}-01`;

/**
 * Juros e correção apropriados MÊS A MÊS, rateando cada período de parcela
 * entre os meses que ele atravessa.
 *
 * É a diferença que o regime de competência faz: uma parcela que vence dia 10
 * tem 2/3 dos juros pertencendo ao mês anterior. O cronograma por vencimento
 * joga tudo no mês do vencimento — para a DRE por competência, isso está errado.
 *
 * Amortização e encargos NÃO são rateados: acontecem no vencimento, não ao
 * longo do período.
 */
export function accrualByCompetence(
    rows: DebtInstallmentRow[],
    convencao: DayCountConvention,
    ancoraInicial: string,
): CompetenciaMensal[] {
    if (rows.length === 0) return [];

    const acc = new Map<string, CompetenciaMensal>();
    const garante = (mes: string): CompetenciaMensal => {
        let c = acc.get(mes);
        if (!c) { c = { mes, juros: 0, correcao: 0, amortizacao: 0, encargos: 0 }; acc.set(mes, c); }
        return c;
    };

    rows.forEach((r, i) => {
        const inicio = inicioDoPeriodo(rows, i, ancoraInicial);
        const fim = r.dueDate;

        // Amortização e encargos caem inteiros no mês do vencimento.
        const noVencimento = garante(mesDe(fim));
        noVencimento.amortizacao += r.amortization;
        noVencimento.encargos += r.iof + r.insurance + r.fees;

        const totalDias = contarDias(inicio, fim, convencao);
        if (totalDias <= 0) {
            // Período degenerado: joga tudo no vencimento em vez de sumir.
            noVencimento.juros += r.interest;
            noVencimento.correcao += r.monetaryCorrection;
            return;
        }

        // Fatia o período nos meses que ele atravessa.
        let cursor = inicio;
        let guarda = 0;
        while (cursor < fim && guarda++ < 600) {
            const proximoInicio = primeiroDia(proximoMes(mesDe(cursor)));
            const trechoFim = proximoInicio < fim ? proximoInicio : fim;
            const dias = contarDias(cursor, trechoFim, convencao);
            if (dias > 0) {
                // O mês do TRECHO é o do cursor, não o do fim: um trecho que
                // termina no dia 1º do mês seguinte pertence ao mês anterior.
                const alvo = garante(mesDe(cursor));
                alvo.juros += r.interest * (dias / totalDias);
                alvo.correcao += r.monetaryCorrection * (dias / totalDias);
            }
            cursor = trechoFim;
        }
    });

    return [...acc.values()]
        .map(c => ({
            mes: c.mes,
            juros: round2(c.juros),
            correcao: round2(c.correcao),
            amortizacao: round2(c.amortizacao),
            encargos: round2(c.encargos),
        }))
        .sort((a, b) => a.mes.localeCompare(b.mes));
}
