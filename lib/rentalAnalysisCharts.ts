/**
 * Séries dos gráficos da aba Análise de Locações — puras, sem I/O.
 *
 * Três perguntas que os KPIs do topo não respondem sozinhos:
 *
 *   1. **Como a carteira está composta?** — `unitStatusBreakdown`: quantas
 *      unidades alugadas, disponíveis, reservadas, indisponíveis. O KPI de
 *      ocupação dá a taxa; o gráfico dá o "onde está o resto".
 *   2. **Quando o risco de vacância chega?** — `leaseExpirySchedule`: quanto
 *      de receita vence em cada um dos próximos meses. O WALE é a média; um
 *      WALE de 2 anos pode esconder metade da receita vencendo em março.
 *   3. **Quão velho é o que está em aberto?** — `receivablesAging`: o aberto
 *      por faixa de atraso. "Vencido há mais de 90 dias" é a ponta; a faixa
 *      de 1–30 é onde a inadimplência nasce.
 *
 * Regra transversal do módulo: **`null` é "não medido", nunca zero.** Aqui ela
 * vale para quem chama — `groupRentalAnalysis` só invoca estas funções quando o
 * insumo existe; sem contratos, o campo do escopo fica `null`, não `{0,0,…}`.
 *
 * As faixas de atraso são as MESMAS de `collectionSnapshot` (rentalExecutive):
 * `over90` daqui tem que bater com `overdue90` de lá para o mesmo insumo — o
 * gráfico e o KPI vizinho não podem discordar. Há teste para isso.
 */

import { parseDateBR, diffDays, type Receivable } from './rentalExecutive';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Composição da carteira por status da unidade
// ─────────────────────────────────────────────────────────────────────────────

export interface UnitStatusBreakdown {
    rented: number;
    /** Vaga e comercializável (`AVAILABLE`). */
    available: number;
    /** Com negociação em curso (`RESERVED`). */
    reserved: number;
    /** Em reforma/bloqueada (`MAINTENANCE`). */
    maintenance: number;
    /** Qualquer outro status (vendida, permutada, em estudo) que ainda esteja
     *  entre as folhas de locação. Existe para a soma fechar com `total`. */
    other: number;
    total: number;
}

export const unitStatusBreakdown = (units: { status?: string | null }[]): UnitStatusBreakdown => {
    const out: UnitStatusBreakdown = { rented: 0, available: 0, reserved: 0, maintenance: 0, other: 0, total: units.length };
    for (const u of units) {
        switch (u.status) {
            case 'RENTED': out.rented++; break;
            case 'AVAILABLE': out.available++; break;
            case 'RESERVED': out.reserved++; break;
            case 'MAINTENANCE': out.maintenance++; break;
            default: out.other++;
        }
    }
    return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cronograma de vencimento de contratos
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaseExpiryContract {
    end_date?: string | null;
    /** Aluguel mensal vigente — é o que "vence" com o contrato. */
    value?: number | null;
    active: boolean;
}

export interface LeaseExpiryBucket {
    count: number;
    /** Soma do aluguel mensal dos contratos do balde. */
    value: number;
}

export interface LeaseExpiryMonth extends LeaseExpiryBucket {
    /** `YYYY-MM` — chave estável para teste e ordenação. */
    month: string;
    /** Rótulo curto do eixo: `set/26` no primeiro mês e em todo janeiro
     *  (onde o ano muda), só `out` nos demais — 12 rótulos com ano colidem
     *  num card de meia largura. */
    label: string;
}

export interface LeaseExpirySchedule {
    /** Um balde por mês, do mês corrente até `horizonMonths − 1` meses à frente,
     *  sempre com todos os meses presentes (mês sem vencimento = 0), senão o
     *  eixo do gráfico pula meses e a leitura de "quando" se perde. */
    months: LeaseExpiryMonth[];
    /** Acumulados por prazo, a partir de HOJE (não do início do mês). */
    within30: LeaseExpiryBucket;
    within90: LeaseExpiryBucket;
    within180: LeaseExpiryBucket;
    within365: LeaseExpiryBucket;
    /** Vigentes cujo término cai depois do horizonte dos meses. */
    beyondHorizon: LeaseExpiryBucket;
    /** Vigentes com término já passado — problema de cadastro, reportado à
     *  parte (mesmo critério de `wale().expiredStillActive`). */
    expired: LeaseExpiryBucket;
    /** Vigentes sem data de término: não entram em balde nenhum. */
    noEndDate: number;
    /** Todos os vigentes considerados (soma de tudo acima + `noEndDate`). */
    activeCount: number;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date, comAno: boolean): string =>
    comAno ? `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : MESES_CURTOS[d.getMonth()];

const bucket = (): LeaseExpiryBucket => ({ count: 0, value: 0 });
const add = (b: LeaseExpiryBucket, v: number) => { b.count++; b.value += v; };

/**
 * Quanto de receita mensal vence em cada mês dos próximos `horizonMonths`.
 *
 * Só contratos VIGENTES entram — os encerrados já venceram e os em minuta
 * ainda não geram receita. O valor é o aluguel mensal (não o total do
 * contrato): a pergunta é "quanto da receita mensal de hoje está em risco em
 * cada mês", e é o que se compara com a Receita mensal do topo.
 */
export const leaseExpirySchedule = (
    contracts: LeaseExpiryContract[],
    now: Date = new Date(),
    horizonMonths = 12,
): LeaseExpirySchedule => {
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const months: LeaseExpiryMonth[] = [];
    const idxByMonth = new Map<string, number>();
    for (let i = 0; i < horizonMonths; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        idxByMonth.set(monthKey(d), months.length);
        months.push({ month: monthKey(d), label: monthLabel(d, i === 0 || d.getMonth() === 0), count: 0, value: 0 });
    }

    const out: LeaseExpirySchedule = {
        months,
        within30: bucket(), within90: bucket(), within180: bucket(), within365: bucket(),
        beyondHorizon: bucket(), expired: bucket(),
        noEndDate: 0, activeCount: 0,
    };

    for (const c of contracts) {
        if (!c.active) continue;
        out.activeCount++;
        if (!c.end_date) { out.noEndDate++; continue; }

        const fim = parseDateBR(c.end_date);
        const valor = Number(c.value ?? 0) || 0;
        const dias = diffDays(hoje, fim);

        if (dias < 0) { add(out.expired, valor); continue; }
        if (dias <= 30) add(out.within30, valor);
        if (dias <= 90) add(out.within90, valor);
        if (dias <= 180) add(out.within180, valor);
        if (dias <= 365) add(out.within365, valor);

        const idx = idxByMonth.get(monthKey(fim));
        if (idx == null) add(out.beyondHorizon, valor);
        else add(months[idx], valor);
    }

    return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Aging dos recebíveis em aberto
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceivablesAging {
    /** Em aberto, com vencimento hoje ou no futuro — ou sem vencimento. */
    notDue: number;
    late1_30: number;
    late31_60: number;
    late61_90: number;
    /** Tem que bater com `collectionSnapshot().overdue90` para o mesmo insumo. */
    over90: number;
    /** Tudo o que está em aberto (soma das cinco faixas). */
    totalOpen: number;
    /** Em aberto E vencido (as quatro faixas de atraso). */
    totalOverdue: number;
    /** Já baixado. */
    received: number;
    /** Lançado no período (aberto + recebido). */
    billed: number;
    /** Em aberto sem `due_date` — vai para `notDue`, mas quem exibe pode avisar. */
    withoutDueDate: number;
}

/**
 * Aberto por faixa de atraso. As bordas são as de `collectionSnapshot`:
 * atraso > 90 → `over90`; > 60 → `late61_90`; > 30 → `late31_60`; > 0 →
 * `late1_30`; senão `notDue`. Parcela sem `due_date` não tem atraso mensurável
 * e fica em `notDue` (contada em `withoutDueDate`).
 */
export const receivablesAging = (rows: Receivable[], now: Date = new Date()): ReceivablesAging => {
    const out: ReceivablesAging = {
        notDue: 0, late1_30: 0, late31_60: 0, late61_90: 0, over90: 0,
        totalOpen: 0, totalOverdue: 0, received: 0, billed: 0, withoutDueDate: 0,
    };

    for (const r of rows) {
        const v = Number(r.amount) || 0;
        out.billed += v;
        if (r.settled) { out.received += v; continue; }
        out.totalOpen += v;
        if (!r.due_date) { out.notDue += v; out.withoutDueDate++; continue; }

        const atraso = diffDays(parseDateBR(r.due_date), now);
        if (atraso > 90) out.over90 += v;
        else if (atraso > 60) out.late61_90 += v;
        else if (atraso > 30) out.late31_60 += v;
        else if (atraso > 0) out.late1_30 += v;
        else { out.notDue += v; continue; }
        out.totalOverdue += v;
    }

    return out;
};
