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
    return t.status === 'CONCILIATED' || t.status === 'PAID'
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
 * Parcela já existente, como o sync a lê do banco antes de refazer a série.
 * `valor_manual*`: migration aplicar_20271019610000 — plano
 * docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md.
 */
export interface ParcelaExistente {
    id?: string | null;
    reference_id: string | null;
    status?: string | null;
    business_status?: string | null;
    amount?: number | null;
    original_amount?: number | null;
    discount_type?: string | null;
    discount_amount?: number | null;
    valor_manual?: boolean | null;
    valor_manual_anterior?: number | null;
    valor_manual_em?: string | null;
    valor_manual_por?: string | null;
}

/** Colunas que o sync precisa ler para decidir (select de `internal_transactions`). */
export const COLUNAS_PARCELA_EXISTENTE =
    'id, reference_id, status, business_status, amount, original_amount, discount_type, discount_amount, '
    + 'valor_manual, valor_manual_anterior, valor_manual_em, valor_manual_por';

/** Campos de valor que a parcela alterada à mão leva intactos para o sync. */
export interface CamposValorManual {
    amount: number;
    original_amount: number | null;
    discount_type: string | null;
    discount_amount: number | null;
    valor_manual: true;
    valor_manual_anterior: number | null;
    valor_manual_em: string | null;
    valor_manual_por: string | null;
}

/** Parcela ainda em aberto cujo valor o usuário alterou à mão. */
export function parcelaComValorManual(t: ParcelaExistente): boolean {
    return !!t.valor_manual && !parcelaBaixada(t);
}

/**
 * O que um sync de contrato pode fazer com a série que já existe.
 *
 * Os syncs (Parcelado, À Vista, Recorrente) refazem as parcelas a partir do valor e do
 * cronograma do contrato. Até 19/10/2026 o Parcelado e o À Vista APAGAVAM todas as
 * linhas do contrato — inclusive pagas e conciliadas, que voltavam como PENDING e
 * perdiam o vínculo da conciliação (CASCADE) — e qualquer valor digitado à mão voltava
 * ao do contrato no próximo "Salvar" dos Dados Gerais.
 *
 * - `normais`: parcelas do lote que seguem o contrato (gravar como vieram);
 * - `manuais`: parcelas do lote cuja linha existente tem valor alterado à mão — vão com
 *   o valor e o desconto DA LINHA (data, descrição e classificação seguem o contrato).
 *   Gravar num upsert separado: as chaves diferem das `normais`;
 * - `idsApagar`: linhas existentes que o sync pode remover — nunca baixada, e nunca
 *   a manual que continua no lote (ela é atualizada, não recriada).
 *
 * Parcela baixada fica fora das três listas: nada a regrava nem a apaga.
 */
export function planejarSyncParcelas<T extends { reference_id: string; amount: number }>(
    lote: T[],
    existentes: ParcelaExistente[],
): { normais: T[]; manuais: Array<T & CamposValorManual>; idsApagar: string[] } {
    const semBaixadas = semParcelasBaixadas(lote, existentes);
    const manualPorRef = new Map<string, ParcelaExistente>();
    for (const e of existentes) {
        if (e.reference_id && parcelaComValorManual(e)) manualPorRef.set(e.reference_id, e);
    }

    const normais: T[] = [];
    const manuais: Array<T & CamposValorManual> = [];
    for (const l of semBaixadas) {
        const m = manualPorRef.get(l.reference_id);
        if (!m) { normais.push(l); continue; }
        manuais.push({
            ...l,
            amount: Number(m.amount ?? l.amount),
            original_amount: m.original_amount ?? null,
            discount_type: m.discount_type ?? null,
            discount_amount: m.discount_amount ?? null,
            valor_manual: true,
            valor_manual_anterior: m.valor_manual_anterior ?? null,
            valor_manual_em: m.valor_manual_em ?? null,
            valor_manual_por: m.valor_manual_por ?? null,
        });
    }

    const refsDoLote = new Set(lote.map(l => l.reference_id));
    const idsApagar = existentes
        .filter(e => !parcelaBaixada(e))
        .filter(e => !(parcelaComValorManual(e) && e.reference_id && refsDoLote.has(e.reference_id)))
        .map(e => e.id)
        .filter((id): id is string => !!id);

    return { normais, manuais, idsApagar };
}

/**
 * Campos a gravar quando o usuário altera o valor da parcela à mão.
 * `valor_manual_anterior` guarda o valor que o CONTRATO gerou: só a primeira
 * alteração o preenche — as seguintes não o trocam pelo valor manual anterior.
 */
export function marcaDeValorManual(
    atual: { amount?: number | null; valor_manual?: boolean | null; valor_manual_anterior?: number | null },
    usuarioId: string | null,
    agora: Date = new Date(),
): { valor_manual: true; valor_manual_anterior: number | null; valor_manual_em: string; valor_manual_por: string | null } {
    return {
        valor_manual: true,
        valor_manual_anterior: atual.valor_manual
            ? (atual.valor_manual_anterior ?? null)
            : (atual.amount ?? null),
        valor_manual_em: agora.toISOString(),
        valor_manual_por: usuarioId,
    };
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
