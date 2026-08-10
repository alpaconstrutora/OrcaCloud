/**
 * `internal_transactions.reference_id` (e portanto `vw_receivables.reference_id`)
 * NÃO é a chave estrangeira que o nome sugere.
 *
 * Para parcela originada de contrato, o valor é COMPOSTO:
 *
 *     dbb274e7-59e2-494a-bb5f-aba877c4330f-p2020-11-15
 *     └────────────── contract_id ──────────────┘└ p+vencimento ┘
 *
 * O sufixo é o que dá idempotência à geração de parcelas: reprocessar o
 * contrato reencontra a mesma linha em vez de duplicar.
 *
 * ⚠️ A consequência é que **`.eq()` e `.in()` com o UUID do contrato nunca
 * casam** — devolvem vazio sem erro, que é o pior tipo de falha. Foi assim que
 * `rentalsDashboardService` passou a reportar inadimplência 0 e "próximos
 * vencimentos" vazio em Locações: o filtro estava certo na intenção e mudo no
 * resultado. Descoberto em 2026-08-10 na Fase 3 do plano de KPIs.
 *
 * Use sempre os helpers abaixo para filtrar por contrato.
 */

/** Separador entre o id de origem e o discriminador da parcela. */
const SUFIXO = '-p';

/**
 * Extrai o id de origem de um `reference_id`.
 * Sem sufixo, o valor inteiro já é o id (parcela avulsa, boleto, etc.).
 */
export const originIdFromRef = (ref: string | null | undefined): string => {
    const v = String(ref ?? '');
    const i = v.indexOf(SUFIXO);
    return i === -1 ? v : v.slice(0, i);
};

/** `true` se o `reference_id` pertence a esse contrato — prefixo exato, não
 *  `startsWith` solto: um id não pode casar com outro que o tenha por prefixo. */
export const refBelongsTo = (ref: string | null | undefined, originId: string): boolean =>
    originIdFromRef(ref) === originId;

/**
 * Filtro `or` do PostgREST para pegar todas as parcelas de vários contratos.
 * O curinga do `like` no PostgREST é `*`, não `%`.
 *
 * Devolve `null` para lista vazia — passar string vazia ao `.or()` traria a
 * tabela inteira, que é exatamente o erro oposto ao que estamos consertando.
 */
export const refPrefixOrFilter = (originIds: string[]): string | null => {
    const ids = originIds.filter(Boolean);
    if (ids.length === 0) return null;
    return ids.map(id => `reference_id.like.${id}*`).join(',');
};
