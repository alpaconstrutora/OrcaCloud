/**
 * Simulador de operações de crédito (PRD item 5).
 *
 * Puro: nada aqui toca banco. É o que permite o usuário girar prazo, sistema e
 * carência vendo o efeito na hora, sem sujar `debt_contracts` com dez rascunhos.
 * As PROPOSTAS de banco, essas sim, são persistidas — como contratos em
 * `EM_NEGOCIACAO` (decisão do usuário, 2026-08-30).
 *
 * Reusa `utils/debtAmortization.ts` inteiro. Não recalcula juros aqui: se a
 * simulação divergisse do cronograma real, o simulador viraria uma segunda
 * verdade — que é exatamente o defeito que o PRD pede para evitar.
 *
 * Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
 */

import {
    buildSchedule,
    cet,
    scheduleTotals,
    type DebtInstallmentRow,
    type DebtScheduleParams,
} from './debtAmortization';
import { round2 } from './financialMath';

export interface SimulationResult {
    /** Rótulo curto da variante, para a coluna da tabela comparativa. */
    label: string;
    params: DebtScheduleParams;
    rows: DebtInstallmentRow[];

    nParcelas: number;
    primeiraParcela: number;
    maiorParcela: number;
    menorParcela: number;
    totalAmortizacao: number;
    totalJuros: number;
    totalEncargos: number;
    totalPago: number;
    /** Tudo que sai menos o líquido que entrou. */
    custoTotal: number;
    /** % ao ano; `null` quando a TIR não converge — nunca 0. */
    cetAnual: number | null;
    /** Média mensal dos 12 primeiros meses: é o ano que aperta o caixa. */
    impactoMensal12m: number;
    primeiroVencimento?: string;
    ultimoVencimento?: string;
}

/** Quanto de fato entra na conta, depois do que o banco retém na liberação. */
export interface CustosDaLiberacao {
    retido?: number;
    tarifas?: number;
    iof?: number;
    seguro?: number;
    cartorio?: number;
    outros?: number;
}

export const liquidoLiberado = (principal: number, c: CustosDaLiberacao = {}): number =>
    round2(Math.max(0,
        principal - (c.retido ?? 0) - (c.tarifas ?? 0) - (c.iof ?? 0)
        - (c.seguro ?? 0) - (c.cartorio ?? 0) - (c.outros ?? 0)));

const somaAte = (rows: DebtInstallmentRow[], meses: number): number => {
    if (rows.length === 0) return 0;
    const [y, m, d] = rows[0].dueDate.split('-').map(Number);
    const limite = new Date(Date.UTC(y, m - 1 + meses, d)).toISOString().slice(0, 10);
    return rows.filter(r => r.dueDate <= limite).reduce((a, r) => a + r.total, 0);
};

/**
 * Roda uma variante e devolve as métricas comparáveis.
 *
 * `releaseDate` é a data em que o dinheiro entrou; sem ela o CET não tem de
 * onde partir. Default: um mês antes do primeiro vencimento — a convenção mais
 * comum, e explícita para ninguém supor outra.
 */
export function simulate(
    label: string,
    params: DebtScheduleParams,
    opts?: { custos?: CustosDaLiberacao; releaseDate?: string },
): SimulationResult {
    const rows = buildSchedule(params);
    const t = scheduleTotals(rows);
    const liquido = liquidoLiberado(params.principal, opts?.custos);

    const [y, m, d] = params.firstDueDate.split('-').map(Number);
    const releaseDate = opts?.releaseDate
        ?? new Date(Date.UTC(y, m - 2, d)).toISOString().slice(0, 10);

    const totais = rows.map(r => r.total).filter(v => v > 0);

    return {
        label,
        params,
        rows,
        nParcelas: rows.length,
        primeiraParcela: rows[0]?.total ?? 0,
        maiorParcela: totais.length ? Math.max(...totais) : 0,
        menorParcela: totais.length ? Math.min(...totais) : 0,
        totalAmortizacao: t.amortization,
        totalJuros: t.interest,
        totalEncargos: round2(t.monetaryCorrection + t.charges),
        totalPago: t.total,
        custoTotal: round2(t.total - liquido),
        cetAnual: cet(rows, liquido, releaseDate),
        impactoMensal12m: round2(somaAte(rows, 12) / 12),
        primeiroVencimento: rows[0]?.dueDate,
        ultimoVencimento: rows[rows.length - 1]?.dueDate,
    };
}

/** Uma variante = um rótulo + o que muda em relação à base. */
export interface Variante {
    label: string;
    overrides: Partial<DebtScheduleParams>;
    custos?: CustosDaLiberacao;
}

export function simulateVariants(
    base: DebtScheduleParams,
    variantes: Variante[],
    opts?: { custos?: CustosDaLiberacao; releaseDate?: string },
): SimulationResult[] {
    return variantes.map(v =>
        simulate(v.label, { ...base, ...v.overrides }, {
            custos: v.custos ?? opts?.custos,
            releaseDate: opts?.releaseDate,
        }),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variantes prontas — as comparações que o PRD item 5 pede
// ─────────────────────────────────────────────────────────────────────────────

/** SAC × Price, o confronto clássico: parcela decrescente contra parcela fixa. */
export const varSistemas = (): Variante[] => [
    { label: 'SAC', overrides: { system: 'SAC' } },
    { label: 'Price', overrides: { system: 'PRICE' } },
];

export const varPrazos = (prazos: number[]): Variante[] =>
    prazos.map(n => ({ label: `${n}×`, overrides: { installmentCount: n } }));

export const varCarencias = (meses: number[]): Variante[] =>
    meses.map(n => ({
        label: n === 0 ? 'Sem carência' : `Carência ${n}`,
        overrides: { gracePrincipalPeriods: n },
    }));

/**
 * Entrada (amortização inicial): reduz o principal financiado.
 * O valor da entrada NÃO entra no custo da operação — é dinheiro que não foi
 * financiado, não juro pago.
 */
export const varEntradas = (principal: number, percentuais: number[]): Variante[] =>
    percentuais.map(pct => ({
        label: pct === 0 ? 'Sem entrada' : `Entrada ${pct}%`,
        overrides: { principal: round2(principal * (1 - pct / 100)) },
    }));

/**
 * Cenários de indexador: aplica um fator mensal CONSTANTE ao longo do prazo.
 *
 * ⚠️ É cenário, não previsão. Um CDI de 0,9% a.m. mantido por 10 anos não é o
 * que vai acontecer — é o que aconteceria SE. A tela precisa dizer isso, senão
 * o número vira promessa.
 *
 * `taxasMensaisPct`: [0.75, 0.9, 1.1] = três cenários de 0,75% / 0,9% / 1,1% ao
 * mês do índice.
 */
export function varCenariosIndexador(
    firstDueDate: string,
    meses: number,
    taxasMensaisPct: number[],
    nomeIndice = 'CDI',
): Variante[] {
    return taxasMensaisPct.map(taxa => ({
        label: `${nomeIndice} ${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.`,
        overrides: { indexSeries: serieConstante(firstDueDate, meses, taxa) },
    }));
}

/** Série sintética { 'YYYY-MM': fator } com a mesma variação todo mês. */
export function serieConstante(
    fromISO: string,
    meses: number,
    taxaMensalPct: number,
): Record<string, number> {
    const serie: Record<string, number> = {};
    const [y, m] = fromISO.split('-').map(Number);
    for (let i = 0; i <= meses; i++) {
        const total = (y * 12 + (m - 1)) + i;
        const ano = Math.floor(total / 12);
        const mes = (total % 12) + 1;
        serie[`${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`] = 1 + taxaMensalPct / 100;
    }
    return serie;
}

/**
 * Refinanciamento: vale a pena trocar a dívida atual por uma nova?
 *
 * Compara o que falta pagar do contrato vigente com o custo da operação nova
 * sobre o mesmo saldo. `saldoDevedor` e `restanteAPagar` vêm do cronograma
 * atual — não são estimados aqui.
 *
 * `custoDeSaida` é a multa/tarifa de liquidação antecipada do contrato atual:
 * é ela que costuma virar o refinanciamento do avesso, e omiti-la faria a
 * troca parecer sempre boa.
 */
export function compararRefinanciamento(args: {
    saldoDevedor: number;
    restanteAPagar: number;
    custoDeSaida?: number;
    nova: DebtScheduleParams;
    custosNova?: CustosDaLiberacao;
    releaseDate?: string;
}): { atual: { restanteAPagar: number; custoDeSaida: number; total: number }; nova: SimulationResult; economia: number } {
    const custoDeSaida = args.custoDeSaida ?? 0;
    const nova = simulate('Refinanciamento', { ...args.nova, principal: args.saldoDevedor }, {
        custos: args.custosNova,
        releaseDate: args.releaseDate,
    });
    const totalAtual = round2(args.restanteAPagar + custoDeSaida);
    return {
        atual: { restanteAPagar: args.restanteAPagar, custoDeSaida, total: totalAtual },
        nova,
        // Positivo = a troca economiza. O custo de saída já está do lado atual.
        economia: round2(totalAtual - nova.totalPago),
    };
}
