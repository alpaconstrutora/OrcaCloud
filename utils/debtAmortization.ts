/**
 * Motor de amortização — Gestão de Dívidas e Financiamentos.
 *
 * Puro e determinístico: mesma entrada, mesma saída, sem I/O, sem `Date.now()`.
 * É o que permite gravar `debt_schedules.params_snapshot` e reproduzir o
 * cronograma meses depois, mesmo com o contrato já editado.
 *
 * Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
 *
 * Datas: strings 'YYYY-MM-DD' o tempo todo, com aritmética própria. NUNCA
 * `new Date('2026-01-31')` + `getMonth()` — isso parseia em UTC e devolve o dia
 * anterior em fuso negativo, que é o bug de data que já mordeu o cronograma da
 * obra (Gantt). Aqui o dia é dado, não instante.
 */

import { calculatePMT, calculateXIRR, round2 } from './financialMath';

export type AmortizationSystem =
    | 'SAC' | 'PRICE' | 'SACRE' | 'AMERICANO' | 'BULLET' | 'MANUAL' | 'IRREGULAR';

export type InstallmentPeriod =
    | 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICA' | 'IRREGULAR';

export type RatePeriod = 'MENSAL' | 'ANUAL';

/**
 * Como converter taxa anual em mensal. Não tem default silencioso porque a
 * escolha muda o valor da parcela: um contrato a 12% a.a. dá 1% a.m. no
 * critério LINEAR (nominal) e 0,9489% a.m. no GEOMETRICA (efetiva).
 */
export type AnnualConversion = 'GEOMETRICA' | 'LINEAR';

export interface ManualInstallmentInput {
    dueDate: string;
    /** Parcela total. Se vier sem `amortization`, os juros do período são
     *  calculados sobre o saldo e a amortização é o resto. */
    total?: number;
    amortization?: number;
    interest?: number;
}

export interface DebtScheduleParams {
    /** Principal LIBERADO — não o contratado. Conta garantida e financiamento
     *  à produção liberam aos poucos, e o cronograma segue o liberado. */
    principal: number;
    /** Taxa em PERCENTUAL (5.5 = 5,5%), na periodicidade de `ratePeriod`. */
    nominalRate: number;
    ratePeriod: RatePeriod;
    annualConversion?: AnnualConversion;
    system: AmortizationSystem;
    installmentCount: number;
    installmentPeriod: InstallmentPeriod;
    /** 'YYYY-MM-DD' — vencimento da primeira parcela. */
    firstDueDate: string;
    /** Períodos (não meses) sem amortizar o principal. */
    gracePrincipalPeriods?: number;
    /** Períodos sem pagar juros. */
    graceInterestPeriods?: number;
    /** Na carência de juros: `true` incorpora ao saldo; `false` acumula e
     *  cobra tudo na primeira parcela após a carência. */
    capitalizeInterest?: boolean;
    /** Série do indexador: { 'YYYY-MM': fator mensal acumulado }. Ex.: CDI de
     *  0,92% no mês → 1.0092. Mês ausente = sem correção naquele mês. */
    indexSeries?: Record<string, number>;
    /** Percentual do indexador (110 = 110% do CDI). */
    indexPct?: number;
    /** Spread em PERCENTUAL ao mês, somado à taxa. */
    spreadMonthly?: number;
    iofPerInstallment?: number;
    insurancePerInstallment?: number;
    feesPerInstallment?: number;
    /** Só para MANUAL / IRREGULAR. */
    manualRows?: ManualInstallmentInput[];
}

export interface DebtInstallmentRow {
    seq: number;
    dueDate: string;
    competenciaDate: string;
    openingBalance: number;
    amortization: number;
    interest: number;
    monetaryCorrection: number;
    iof: number;
    insurance: number;
    fees: number;
    lateFine: number;
    lateInterest: number;
    total: number;
    closingBalance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────────────

const MESES_POR_PERIODO: Record<Exclude<InstallmentPeriod, 'UNICA' | 'IRREGULAR'>, number> = {
    MENSAL: 1,
    BIMESTRAL: 2,
    TRIMESTRAL: 3,
    SEMESTRAL: 6,
    ANUAL: 12,
};

const diasNoMes = (ano: number, mes1a12: number): number =>
    new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

/**
 * Soma meses a uma data 'YYYY-MM-DD' preservando o dia sempre que ele existir
 * no mês de destino. 31/01 + 1 mês = 28/02 (ou 29 em bissexto) — é assim que
 * banco monta carnê, e é o que evita "vencimento 31/02".
 */
export const addMonthsISO = (iso: string, meses: number): string => {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const totalMeses = (ano * 12 + (mes - 1)) + meses;
    const novoAno = Math.floor(totalMeses / 12);
    const novoMes = (totalMeses % 12) + 1;
    const diaFinal = Math.min(dia, diasNoMes(novoAno, novoMes));
    return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;
};

const mesDe = (iso: string): string => iso.slice(0, 7);

// ─────────────────────────────────────────────────────────────────────────────
// Taxas
// ─────────────────────────────────────────────────────────────────────────────

/** Taxa mensal em DECIMAL a partir dos parâmetros do contrato. */
export const monthlyRateFrom = (params: DebtScheduleParams): number => {
    const nominal = params.nominalRate / 100;
    const base =
        params.ratePeriod === 'MENSAL'
            ? nominal
            : (params.annualConversion ?? 'GEOMETRICA') === 'LINEAR'
              ? nominal / 12
              : Math.pow(1 + nominal, 1 / 12) - 1;
    return base + (params.spreadMonthly ?? 0) / 100;
};

const mesesPorParcela = (params: DebtScheduleParams): number => {
    if (params.installmentPeriod === 'UNICA') return Math.max(1, params.installmentCount);
    if (params.installmentPeriod === 'IRREGULAR') return 1;
    return MESES_POR_PERIODO[params.installmentPeriod];
};

/** Taxa do PERÍODO da parcela: mensal capitalizada pelos meses do período. */
const taxaDoPeriodo = (mensal: number, meses: number): number =>
    Math.pow(1 + mensal, meses) - 1;

/**
 * Fator de correção do período, aplicando o percentual do indexador.
 * Um fator 1.0092 a 110% do índice vira 1 + 0,0092 × 1,10 = 1.01012.
 */
const fatorCorrecao = (params: DebtScheduleParams, deISO: string, ateISO: string): number => {
    if (!params.indexSeries) return 1;
    const pct = (params.indexPct ?? 100) / 100;
    let fator = 1;
    let cursor = mesDe(deISO);
    const fim = mesDe(ateISO);
    // Guarda de laço: uma série corrompida não pode travar a tela.
    for (let i = 0; i < 1200 && cursor < fim; i++) {
        cursor = addMonthsISO(`${cursor}-01`, 1).slice(0, 7);
        const bruto = params.indexSeries[cursor];
        if (bruto && bruto > 0) fator *= 1 + (bruto - 1) * pct;
    }
    return fator;
};

// ─────────────────────────────────────────────────────────────────────────────
// Motor
// ─────────────────────────────────────────────────────────────────────────────

const linhaVazia = (seq: number, dueDate: string, openingBalance: number): DebtInstallmentRow => ({
    seq,
    dueDate,
    competenciaDate: dueDate,
    openingBalance,
    amortization: 0,
    interest: 0,
    monetaryCorrection: 0,
    iof: 0,
    insurance: 0,
    fees: 0,
    lateFine: 0,
    lateInterest: 0,
    total: 0,
    closingBalance: openingBalance,
});

/**
 * Amortização do período por sistema, dado o saldo e quantas parcelas faltam.
 * `parcelaFixa` é recalculada fora para PRICE e SACRE.
 */
const amortizacaoDoPeriodo = (
    system: AmortizationSystem,
    saldo: number,
    juros: number,
    parcelasRestantes: number,
    principalOriginal: number,
    totalAmortizantes: number,
    parcelaFixa: number,
    ehUltima: boolean,
): number => {
    switch (system) {
        case 'SAC':
            return principalOriginal / totalAmortizantes;
        case 'PRICE':
        case 'SACRE':
            return parcelaFixa - juros;
        case 'AMERICANO':
            return ehUltima ? saldo : 0;
        case 'BULLET':
            return ehUltima ? saldo : 0;
        default:
            return parcelasRestantes > 0 ? saldo / parcelasRestantes : saldo;
    }
};

/**
 * Gera a memória de cálculo completa (PRD item 4).
 *
 * Invariantes garantidas na saída:
 *   · `Σ amortization === principal` (a última parcela absorve o resíduo de
 *     arredondamento — é por isso que ela pode diferir das demais em centavos);
 *   · `closingBalance` da última parcela === 0;
 *   · `total` === amortização + juros + correção + IOF + seguro + tarifas.
 */
export const buildSchedule = (params: DebtScheduleParams): DebtInstallmentRow[] => {
    const principal = round2(params.principal);
    if (principal <= 0 || params.installmentCount <= 0) return [];

    if (params.system === 'MANUAL' || params.system === 'IRREGULAR') {
        return buildManualSchedule(params);
    }

    const mensal = monthlyRateFrom(params);
    const passo = mesesPorParcela(params);
    const jurosPeriodo = taxaDoPeriodo(mensal, passo);
    const n = params.installmentCount;
    const carenciaPrincipal = Math.min(params.gracePrincipalPeriods ?? 0, n);
    const carenciaJuros = Math.min(params.graceInterestPeriods ?? 0, n);

    // BULLET não amortiza nada até o fim, então carência de principal nele é
    // redundante — mas não é erro; só não muda nada.
    const amortizantes = params.system === 'AMERICANO' || params.system === 'BULLET'
        ? 1
        : Math.max(1, n - carenciaPrincipal);

    const rows: DebtInstallmentRow[] = [];
    let saldo = principal;
    let jurosAcumuladoNaCarencia = 0;
    let parcelaFixa = 0;
    let dataAnterior = params.firstDueDate;

    for (let i = 0; i < n; i++) {
        const seq = i + 1;
        const dueDate = i === 0 ? params.firstDueDate : addMonthsISO(params.firstDueDate, passo * i);
        const ehUltima = seq === n;
        const emCarenciaPrincipal = seq <= carenciaPrincipal;
        const emCarenciaJuros = seq <= carenciaJuros;

        const row = linhaVazia(seq, dueDate, round2(saldo));

        // 1. Correção monetária sobre o saldo, antes dos juros — é assim que o
        //    contrato indexado funciona: corrige, depois remunera o corrigido.
        const fator = fatorCorrecao(params, dataAnterior, dueDate);
        const correcao = fator > 1 ? round2(saldo * (fator - 1)) : 0;
        saldo = round2(saldo + correcao);
        row.monetaryCorrection = correcao;

        // 2. Juros do período.
        const jurosBruto = round2(saldo * jurosPeriodo);

        if (emCarenciaJuros) {
            if (params.capitalizeInterest) {
                saldo = round2(saldo + jurosBruto); // incorpora ao principal
            } else {
                jurosAcumuladoNaCarencia = round2(jurosAcumuladoNaCarencia + jurosBruto);
            }
            row.interest = 0;
        } else {
            row.interest = round2(jurosBruto + jurosAcumuladoNaCarencia);
            jurosAcumuladoNaCarencia = 0;
        }

        // 3. BULLET capitaliza os juros o tempo todo, não só na carência.
        if (params.system === 'BULLET' && !ehUltima) {
            saldo = round2(saldo + row.interest);
            row.interest = 0;
        }

        // 4. Parcela fixa de PRICE / SACRE, recalculada quando precisa.
        //    SACRE = prestação de SAC recalculada a cada bloco de 12 períodos e
        //    mantida fixa dentro do bloco (convenção CEF).
        const restantes = n - i;
        // PRICE recalcula a prestação quando há correção monetária no período:
        // num contrato indexado o saldo cresce, e manter a prestação congelada
        // faria os juros comerem a amortização inteira — o contrato nunca
        // amortizaria. É o "recálculo da prestação" que o próprio banco faz.
        const precisaRecalcularPrice =
            seq === carenciaPrincipal + 1 || (correcao > 0 && !emCarenciaPrincipal);
        if (params.system === 'PRICE' && precisaRecalcularPrice) {
            parcelaFixa = round2(calculatePMT(jurosPeriodo, restantes, saldo));
        } else if (params.system === 'SACRE' && !emCarenciaPrincipal && (parcelaFixa === 0 || (seq - carenciaPrincipal - 1) % 12 === 0)) {
            parcelaFixa = round2(saldo / restantes + saldo * jurosPeriodo);
        }

        // 5. Amortização.
        let amort = emCarenciaPrincipal
            ? 0
            : amortizacaoDoPeriodo(
                  params.system, saldo, row.interest, restantes,
                  principal, amortizantes, parcelaFixa, ehUltima,
              );

        // A última parcela absorve o resíduo: sem isto o saldo final fecha em
        // R$ 0,03 e o contrato "nunca acaba".
        if (ehUltima) amort = saldo;
        amort = round2(Math.max(0, Math.min(amort, saldo)));

        row.amortization = amort;
        row.iof = round2(params.iofPerInstallment ?? 0);
        row.insurance = round2(params.insurancePerInstallment ?? 0);
        row.fees = round2(params.feesPerInstallment ?? 0);

        saldo = round2(saldo - amort);
        row.closingBalance = saldo;
        row.total = round2(
            row.amortization + row.interest + row.monetaryCorrection +
            row.iof + row.insurance + row.fees,
        );

        rows.push(row);
        dataAnterior = dueDate;
    }

    return rows;
};

const buildManualSchedule = (params: DebtScheduleParams): DebtInstallmentRow[] => {
    const linhas = params.manualRows ?? [];
    if (linhas.length === 0) return [];

    const mensal = monthlyRateFrom(params);
    const rows: DebtInstallmentRow[] = [];
    let saldo = round2(params.principal);
    let dataAnterior = params.firstDueDate;

    linhas.forEach((entrada, i) => {
        const row = linhaVazia(i + 1, entrada.dueDate, saldo);

        const fator = fatorCorrecao(params, dataAnterior, entrada.dueDate);
        const correcao = fator > 1 ? round2(saldo * (fator - 1)) : 0;
        saldo = round2(saldo + correcao);
        row.monetaryCorrection = correcao;

        // Meses decorridos desde a linha anterior — fluxo irregular tem passo
        // variável por definição, então a taxa acompanha o intervalo real.
        const [ay, am] = dataAnterior.split('-').map(Number);
        const [by, bm] = entrada.dueDate.split('-').map(Number);
        const meses = Math.max(1, (by * 12 + bm) - (ay * 12 + am));
        const jurosCalculado = round2(saldo * taxaDoPeriodo(mensal, i === 0 ? Math.max(1, meses) : meses));

        row.interest = round2(entrada.interest ?? jurosCalculado);
        row.amortization = round2(
            entrada.amortization ?? Math.max(0, (entrada.total ?? 0) - row.interest - correcao),
        );

        const ehUltima = i === linhas.length - 1;
        if (ehUltima) row.amortization = saldo;
        row.amortization = round2(Math.max(0, Math.min(row.amortization, saldo)));

        row.iof = round2(params.iofPerInstallment ?? 0);
        row.insurance = round2(params.insurancePerInstallment ?? 0);
        row.fees = round2(params.feesPerInstallment ?? 0);

        saldo = round2(saldo - row.amortization);
        row.closingBalance = saldo;
        row.total = round2(
            row.amortization + row.interest + row.monetaryCorrection +
            row.iof + row.insurance + row.fees,
        );

        rows.push(row);
        dataAnterior = entrada.dueDate;
    });

    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// Consultas sobre o cronograma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saldo devedor (principal) numa data qualquer: o `closingBalance` da última
 * parcela vencida até a data. Antes da primeira parcela, o principal cheio.
 */
export const outstandingBalanceAt = (rows: DebtInstallmentRow[], dateISO: string): number => {
    if (rows.length === 0) return 0;
    const vencidas = rows.filter((r) => r.dueDate <= dateISO);
    if (vencidas.length === 0) return rows[0].openingBalance;
    return vencidas[vencidas.length - 1].closingBalance;
};

/**
 * Valor para liquidação antecipada na data: o principal remanescente.
 *
 * Não inclui multa de liquidação antecipada — é parâmetro contratual, e o
 * Art. 52 §2º do CDC garante redução proporcional dos juros futuros. Quem
 * cobra a multa é a tela, com o percentual do contrato, para o número aqui não
 * virar uma promessa que o banco não faz.
 */
export const earlySettlementValue = (rows: DebtInstallmentRow[], dateISO: string): number =>
    outstandingBalanceAt(rows, dateISO);

/**
 * Economia estimada com a liquidação antecipada: tudo o que seria pago de
 * juros, correção e encargos nas parcelas ainda não vencidas.
 */
export const earlySettlementSavings = (rows: DebtInstallmentRow[], dateISO: string): number =>
    round2(
        rows
            .filter((r) => r.dueDate > dateISO)
            .reduce((acc, r) => acc + r.interest + r.monetaryCorrection + r.iof + r.insurance + r.fees, 0),
    );

/**
 * Juros apropriados por competência num intervalo ['YYYY-MM-DD', 'YYYY-MM-DD'].
 * Inclui correção monetária: as duas são custo financeiro do período, e a DRE
 * as trata no mesmo grupo.
 */
export const accruedInterestByCompetence = (
    rows: DebtInstallmentRow[],
    fromISO: string,
    toISO: string,
): number =>
    round2(
        rows
            .filter((r) => r.competenciaDate >= fromISO && r.competenciaDate <= toISO)
            .reduce((acc, r) => acc + r.interest + r.monetaryCorrection, 0),
    );

/** Serviço da dívida (caixa) num intervalo: soma das parcelas que vencem nele. */
export const debtServiceBetween = (
    rows: DebtInstallmentRow[],
    fromISO: string,
    toISO: string,
): number =>
    round2(
        rows
            .filter((r) => r.dueDate >= fromISO && r.dueDate <= toISO)
            .reduce((acc, r) => acc + r.total, 0),
    );

/**
 * CET anual efetivo, pelo fluxo de caixa REAL da operação (PRD item 4).
 *
 * `netReleased` é o líquido que entrou na conta — já descontados IOF, tarifas,
 * seguro e retenções. É essa diferença entre contratado e recebido que faz o
 * CET ser maior que a taxa nominal; calcular sobre o valor contratado
 * devolveria a taxa do contrato de volta e não serviria para nada.
 *
 * Retorna a taxa em PERCENTUAL ao ano, ou `null` se não convergir.
 */
export const cet = (
    rows: DebtInstallmentRow[],
    netReleased: number,
    releaseDateISO: string,
): number | null => {
    if (rows.length === 0 || netReleased <= 0) return null;
    const fluxo = [
        { date: releaseDateISO, amount: netReleased },
        ...rows.map((r) => ({ date: r.dueDate, amount: -r.total })),
    ];
    const taxa = calculateXIRR(fluxo);
    return taxa === null ? null : round2(taxa * 100);
};

/** Totais do cronograma, para KPI e conferência. */
export const scheduleTotals = (rows: DebtInstallmentRow[]) => ({
    amortization: round2(rows.reduce((a, r) => a + r.amortization, 0)),
    interest: round2(rows.reduce((a, r) => a + r.interest, 0)),
    monetaryCorrection: round2(rows.reduce((a, r) => a + r.monetaryCorrection, 0)),
    charges: round2(rows.reduce((a, r) => a + r.iof + r.insurance + r.fees, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)),
});
