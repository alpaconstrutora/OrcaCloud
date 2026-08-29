/**
 * `reference_id` das parcelas de dívida em `internal_transactions`.
 *
 * A decisão do usuário (2026-08-29) foi decompor a parcela: cada componente
 * vira UMA LINHA no Contas a Pagar, com sua própria categoria. Então o
 * `reference_id` precisa identificar três níveis ao mesmo tempo:
 *
 *     debt-3f9c1e2a-...-b7d4-p007-JUROS
 *     │    └──── debt_contract_id ────┘ └seq┘ └comp┘
 *     └ prefixo fixo, para não colidir com o `{contractId}-p{data}` que
 *       `contractService` já grava para contrato de obra/locação
 *
 * ⚠️ Como em `lib/receivableRef.ts`: **`.eq()`/`.in()` com o UUID puro nunca
 * casam** — devolvem `[]` sem erro. Foi assim que a inadimplência de Locações
 * ficou zerada por meses sem ninguém notar. Use sempre os helpers daqui.
 *
 * Por que `seq` e não a data de vencimento (como o contrato faz): renegociar
 * muda as datas, e o mesmo número de parcela precisa continuar sendo o mesmo
 * título. A data no `reference_id` faria a parcela 7 renegociada virar uma
 * linha nova, deixando a antiga órfã e em aberto no Contas a Pagar.
 */

/** Componentes da parcela — a mesma lista do CHECK de `debt_component_accounts`. */
export const DEBT_COMPONENTS = ['AMORT', 'JUROS', 'CORRECAO', 'IOF', 'SEGURO', 'TARIFA', 'MORA'] as const;
export type DebtComponent = (typeof DEBT_COMPONENTS)[number];

/** `source_system` das linhas geradas por este módulo. */
export const DEBT_SOURCE_SYSTEM = 'DEBT_INSTALLMENT';

const PREFIXO = 'debt-';

/** Sequência com 3 dígitos: `p007` ordena junto de `p070` num ORDER BY textual. */
const seqToken = (seq: number): string => `p${String(seq).padStart(3, '0')}`;

/** `reference_id` completo de um componente de uma parcela. */
export const debtRefFor = (debtContractId: string, seq: number, component: DebtComponent): string =>
    `${PREFIXO}${debtContractId}-${seqToken(seq)}-${component}`;

/**
 * Prefixo comum às N linhas de UMA parcela.
 *
 * É o que permite liquidar a parcela inteira de uma vez: as 6 linhas de
 * componente compartilham este prefixo e só ele.
 */
export const installmentPrefix = (debtContractId: string, seq: number): string =>
    `${PREFIXO}${debtContractId}-${seqToken(seq)}-`;

/** Prefixo comum a TODAS as parcelas de um contrato. */
export const contractPrefix = (debtContractId: string): string => `${PREFIXO}${debtContractId}-`;

/** `true` se o `reference_id` foi gerado por este módulo. */
export const isDebtRef = (ref: string | null | undefined): boolean =>
    String(ref ?? '').startsWith(PREFIXO);

/**
 * Desmonta um `reference_id` de dívida. Devolve `null` para qualquer coisa que
 * não tenha o formato exato — degradar em silêncio aqui esconderia justamente
 * o bug que este módulo existe para evitar.
 */
export const parseDebtRef = (
    ref: string | null | undefined,
): { debtContractId: string; seq: number; component: DebtComponent } | null => {
    const v = String(ref ?? '');
    if (!v.startsWith(PREFIXO)) return null;
    // UUID tem hífen, então não dá para fatiar por `split('-')`: ancoramos no
    // formato do token de sequência, que é o único `-pNNN-` da string.
    const m = /^debt-(.+)-p(\d{3})-([A-Z]+)$/.exec(v);
    if (!m) return null;
    const component = m[3] as DebtComponent;
    if (!DEBT_COMPONENTS.includes(component)) return null;
    return { debtContractId: m[1], seq: Number(m[2]), component };
};

/** Id do contrato de origem, ou string vazia se não for referência de dívida. */
export const debtContractIdFromRef = (ref: string | null | undefined): string =>
    parseDebtRef(ref)?.debtContractId ?? '';

/**
 * `true` se o `reference_id` pertence a este contrato.
 *
 * Comparação exata do id extraído, **não** `startsWith` solto: um contrato cujo
 * id seja prefixo de outro casaria os dois.
 */
export const refBelongsToDebt = (ref: string | null | undefined, debtContractId: string): boolean =>
    debtContractIdFromRef(ref) === debtContractId;

/**
 * Filtro `or` do PostgREST para pegar as linhas de vários prefixos.
 *
 * O curinga do `like` no PostgREST é `*`, não `%`.
 *
 * Devolve `null` para lista vazia — string vazia no `.or()` traz a tabela
 * INTEIRA, que é o erro oposto ao que estes helpers existem para evitar.
 */
export const debtRefPrefixOrFilter = (prefixes: string[]): string | null => {
    const ps = prefixes.filter(Boolean);
    if (ps.length === 0) return null;
    return ps.map(p => `reference_id.like.${p}*`).join(',');
};
