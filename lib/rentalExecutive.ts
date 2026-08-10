/**
 * Painel executivo de Locações — puro, sem I/O.
 *
 * Fase 3 do plano docs/planos/2026-08-06-kpis-locacao-primitivas.md. Diferente
 * das Fases 1 e 2, nenhum indicador aqui exigiu primitiva nova: o dado já
 * existe (`contracts.end_date`/`current_value`, `vw_receivables.due_date`,
 * `commercial_properties.rental_price`). O que faltava era a conta.
 *
 * Regra que atravessa o arquivo: **`null` é "não medido", e nunca zero.** Uma
 * carteira sem contrato vencido não tem taxa de renovação 0% — ela não tem taxa
 * de renovação. Zero é uma afirmação sobre o negócio; `null` é a ausência de
 * base para afirmar. Confundir os dois foi o que produziu o "patrimônio
 * R$ 0,00" da Fase 0.
 */

/** Data 'YYYY-MM-DD' → Date local, com hora fixa.
 *  `new Date('2026-08-10')` é interpretado como UTC e volta um dia em fusos
 *  negativos — o bug de fuso que já mordeu o Gantt deste projeto. */
export const parseDateBR = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00`);

const DIAS_ANO = 365.25;

export const diffDays = (from: Date, to: Date): number =>
    Math.floor((to.getTime() - from.getTime()) / 86400000);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ocupação financeira
// ─────────────────────────────────────────────────────────────────────────────

export interface RentableUnit {
    id: string;
    /** Aluguel de tabela/potencial da unidade. */
    rental_price?: number | null;
    /** Aluguel efetivamente contratado hoje; ausente/0 = unidade não gera receita. */
    contracted?: number | null;
}

export interface FinancialOccupancy {
    /** Receita que a carteira geraria com tudo alugado ao preço de tabela. */
    potential: number;
    /** Receita contratada hoje. */
    contracted: number;
    /** contratada ÷ potencial. `null` quando não há potencial — sem base, sem taxa. */
    rate: number | null;
}

/**
 * Ocupação FINANCEIRA — quanto da receita possível está contratada.
 *
 * É diferente da ocupação física, e a diferença é o que interessa: 90% das
 * unidades alugadas com as caras vazias pode ser 60% de ocupação financeira.
 * Uma esconde o problema que a outra mostra.
 *
 * Unidade sem `rental_price` não entra no potencial — não dá para supor preço
 * de quem não tem preço. Mas se ela está contratada, o valor contratado entra
 * no potencial também, senão a taxa passaria de 100%.
 */
export const financialOccupancy = (units: RentableUnit[]): FinancialOccupancy => {
    let potential = 0;
    let contracted = 0;

    for (const u of units) {
        const tabela = Number(u.rental_price ?? 0) || 0;
        const atual = Number(u.contracted ?? 0) || 0;
        contracted += atual;
        potential += Math.max(tabela, atual);
    }

    return { potential, contracted, rate: potential > 0 ? contracted / potential : null };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4 e 5. Arrecadação e inadimplência por faixa
// ─────────────────────────────────────────────────────────────────────────────

export interface Receivable {
    amount: number;
    due_date?: string | null;
    /** `true` quando o recebimento foi de fato baixado (conciliado). */
    settled: boolean;
}

export interface CollectionSnapshot {
    /** Total lançado no período (contratado). */
    billed: number;
    /** Total efetivamente recebido. */
    received: number;
    /** recebido ÷ lançado. `null` sem lançamento no período. */
    collectionRate: number | null;
    /** Vencido e não recebido, por faixa de atraso (valores acumulados). */
    overdue30: number;
    overdue60: number;
    overdue90: number;
    /** Vencido há mais de 90 dias — o indicador do painel executivo. */
    overdue90Rate: number | null;
}

/**
 * Arrecadação e atraso.
 *
 * ⚠️ `received` mede **baixa no sistema**, não saúde do inquilino. Numa base
 * onde ninguém concilia recebimento, isto devolve ~0% e parece inadimplência
 * total — quando é falta de uso. Quem exibir precisa rotular como
 * "recebimentos baixados", nunca como "inadimplência".
 *
 * Parcela sem `due_date` não entra em faixa de atraso: não dá para dizer há
 * quantos dias venceu o que não tem vencimento. Ela conta no lançado.
 */
export const collectionSnapshot = (
    rows: Receivable[],
    now: Date = new Date(),
): CollectionSnapshot => {
    let billed = 0, received = 0, overdue30 = 0, overdue60 = 0, overdue90 = 0;

    for (const r of rows) {
        const v = Number(r.amount) || 0;
        billed += v;
        if (r.settled) { received += v; continue; }
        if (!r.due_date) continue;

        const atraso = diffDays(parseDateBR(r.due_date), now);
        if (atraso > 90) overdue90 += v;
        else if (atraso > 60) overdue60 += v;
        else if (atraso > 30) overdue30 += v;
    }

    return {
        billed,
        received,
        collectionRate: billed > 0 ? received / billed : null,
        overdue30, overdue60, overdue90,
        overdue90Rate: billed > 0 ? overdue90 / billed : null,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. WALE — Weighted Average Lease Expiry
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaseContract {
    id: string;
    end_date?: string | null;
    /** Valor que pondera o prazo (aluguel contratado). */
    value?: number | null;
    active: boolean;
}

export interface WaleResult {
    /** Prazo médio ponderado por receita, em ANOS. `null` sem contrato elegível. */
    years: number | null;
    /** Média simples, em anos — WALT sem ponderação, para comparação. */
    simpleYears: number | null;
    /** Contratos que entraram na conta. */
    counted: number;
    /**
     * Contratos ATIVOS cuja data de término já passou. Ficam FORA do WALE —
     * prazo negativo distorce a média — e são reportados à parte porque
     * significam problema de cadastro (vencido sem renovar nem encerrar), não
     * característica da carteira.
     */
    expiredStillActive: number;
    /** Sem `end_date`: não dá para medir prazo de contrato sem fim declarado. */
    missingEndDate: number;
}

/**
 * WALE — quanto tempo, em média ponderada por receita, a carteira está
 * contratada. Responde "quando o risco de vacância chega", que é a pergunta que
 * ocupação nenhuma responde: 100% ocupado com tudo vencendo em 3 meses é uma
 * carteira em risco.
 *
 * A ponderação é por valor porque um galpão de R$ 50 mil vencendo importa mais
 * que uma sala de R$ 800 — média simples trataria os dois igual.
 */
export const wale = (contracts: LeaseContract[], now: Date = new Date()): WaleResult => {
    let somaPonderada = 0, somaPesos = 0, somaSimples = 0;
    let counted = 0, expiredStillActive = 0, missingEndDate = 0;

    for (const c of contracts) {
        if (!c.active) continue;
        if (!c.end_date) { missingEndDate++; continue; }

        const anos = diffDays(now, parseDateBR(c.end_date)) / DIAS_ANO;
        if (anos <= 0) { expiredStillActive++; continue; }

        const peso = Number(c.value ?? 0) || 0;
        somaPonderada += anos * peso;
        somaPesos += peso;
        somaSimples += anos;
        counted++;
    }

    return {
        // Sem valor em contrato nenhum, a ponderação é impossível — cai para a
        // média simples em vez de devolver 0, que seria uma mentira precisa.
        years: counted === 0 ? null : (somaPesos > 0 ? somaPonderada / somaPesos : somaSimples / counted),
        simpleYears: counted === 0 ? null : somaSimples / counted,
        counted,
        expiredStillActive,
        missingEndDate,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Taxa de renovação
// ─────────────────────────────────────────────────────────────────────────────

export interface RenewalContract {
    id: string;
    end_date?: string | null;
    /** Aponta para o contrato de origem quando ESTE é a renovação. */
    parent_contract_id?: string | null;
    renewal_seq?: number | null;
}

export interface RenewalResult {
    /** Contratos cujo término caiu na janela. */
    expired: number;
    /** Desses, quantos geraram renovação. */
    renewed: number;
    /** renovados ÷ vencidos. `null` quando nada venceu — não é 0%. */
    rate: number | null;
}

/**
 * Taxa de renovação na janela [from, to].
 *
 * Um contrato conta como renovado quando existe OUTRO contrato apontando para
 * ele por `parent_contract_id` — é o elo que o módulo de Renovações grava. O
 * `renewal_seq` do próprio contrato não serve para isso: ele diz que o contrato
 * É uma renovação, não que FOI renovado.
 *
 * ⚠️ Nada vencido na janela devolve `null`, não `0`. "Nenhum contrato venceu"
 * e "todos venceram e nenhum renovou" são realidades opostas.
 */
export const renewalRate = (
    contracts: RenewalContract[],
    from: Date,
    to: Date,
): RenewalResult => {
    const renovadosPorPai = new Set(
        contracts
            .map(c => c.parent_contract_id)
            .filter((id): id is string => !!id),
    );

    let expired = 0, renewed = 0;
    for (const c of contracts) {
        if (!c.end_date) continue;
        const fim = parseDateBR(c.end_date);
        if (fim < from || fim > to) continue;
        expired++;
        if (renovadosPorPai.has(c.id)) renewed++;
    }

    return { expired, renewed, rate: expired > 0 ? renewed / expired : null };
};
