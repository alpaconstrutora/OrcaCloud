/**
 * Parcela de contrato com valor FIXO ou VARIÁVEL (por medição) — regras puras.
 * Plano: docs/planos/2026-10-17-contrato-valor-fixo-ou-por-medicao.md.
 *
 * VARIÁVEL: o valor do contrato é ESTIMATIVA. O valor real de cada parcela é o que
 * saiu do banco — informado na baixa ou trazido pela conciliação. Caso real: faxina
 * paga por diária (R$ 150), R$ 600 num mês de 4 semanas e R$ 750 num de 5.
 *
 * No banco: `contracts.installment_value_mode` e o campo computado
 * `valor_variavel(internal_transactions)` (migration aplicar_20271018050000).
 */

export type ModoValorParcela = 'FIXO' | 'VARIAVEL';

export const MODOS_VALOR_PARCELA: ReadonlyArray<{ value: ModoValorParcela; label: string; ajuda: string }> = [
    { value: 'FIXO', label: 'Fixo', ajuda: 'Toda parcela vale o valor do contrato.' },
    {
        value: 'VARIAVEL',
        label: 'Variável (por medição)',
        ajuda: 'O valor do contrato é uma estimativa. O valor real de cada parcela é informado na baixa ou vem do extrato na conciliação.',
    },
];

/** Contrato sem a coluna (registro antigo, ou banco antes da migration) é FIXO. */
export function modoValorParcela(c: { installment_value_mode?: string | null } | null | undefined): ModoValorParcela {
    return c?.installment_value_mode === 'VARIAVEL' ? 'VARIAVEL' : 'FIXO';
}

/** Parcela já baixada: paga/recebida, conciliada ou com pagamento parcial registrado. */
export function parcelaBaixada(t: { status?: string | null; business_status?: string | null }): boolean {
    return t.status === 'CONCILIATED'
        || t.business_status === 'PAGO' || t.business_status === 'RECEBIDO' || t.business_status === 'PARCIAL';
}

/**
 * Tira do lote do sync as parcelas que já existem BAIXADAS. O `upsert` de
 * `syncRecurringToFinance` regravava `amount`, `status` e `business_status` de toda a
 * série: "Lançar Financeiro" de novo devolvia parcela paga e conciliada para PENDING
 * com o valor do contrato — e, na parcela variável, apagava o valor real.
 */
export function semParcelasBaixadas<T extends { reference_id: string }>(
    lote: T[],
    existentes: Array<{ reference_id: string | null; status?: string | null; business_status?: string | null }>,
): T[] {
    const baixadas = new Set(existentes.filter(parcelaBaixada).map(e => e.reference_id).filter(Boolean) as string[]);
    return lote.filter(l => !baixadas.has(l.reference_id));
}

/**
 * Valor a gravar na baixa manual: parcela variável aceita o valor pago informado
 * (positivo, com centavos); a fixa nunca muda. `null` = não mexe no valor.
 */
export function valorDaBaixa(
    titulo: { valorVariavel?: boolean | null; valor: number },
    valorPago: number | null | undefined,
): number | null {
    if (!titulo.valorVariavel) return null;
    if (valorPago === null || valorPago === undefined || !Number.isFinite(valorPago) || valorPago <= 0) return null;
    const v = Math.round(valorPago * 100) / 100;
    return Math.abs(v - Math.abs(titulo.valor)) < 0.005 ? null : v;
}

/** A conciliação deve trocar o valor da parcela pelo do extrato? */
export function conciliarAjustandoValor(
    titulo: { valor_variavel?: boolean | null; amount: number },
    valorExtrato: number,
): boolean {
    return !!titulo.valor_variavel && Math.abs(Math.abs(valorExtrato) - Math.abs(titulo.amount)) >= 0.01;
}
