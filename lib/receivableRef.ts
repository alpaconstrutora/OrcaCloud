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
 * O sistema tem DUAS grafias para o mesmo conceito, ambas vivas:
 *   `<id>-p<vencimento>`  — séries de locação/recebível
 *   `<id>:p<n>`           — séries de contrato (`contractService`)
 * Nenhuma das duas pode ocorrer DENTRO de um UUID (que só tem hex e `-`), então
 * cortar no que vier primeiro é seguro. Antes desta função tratar `:`,
 * `originIdFromRef` devolvia a string inteira para a grafia de contrato e cada
 * chamador remendava por fora (ver `BankReconciliation.tsx`).
 */
const SEPARADORES = [SUFIXO, ':'];

/**
 * Extrai o id de origem de um `reference_id`.
 * Sem sufixo, o valor inteiro já é o id (parcela avulsa, boleto, etc.).
 */
export const originIdFromRef = (ref: string | null | undefined): string => {
    const v = String(ref ?? '');
    const cortes = SEPARADORES.map(s => v.indexOf(s)).filter(i => i !== -1);
    return cortes.length === 0 ? v : v.slice(0, Math.min(...cortes));
};

/**
 * `reference_id` de parcela gerada por MEDIÇÃO de contrato.
 *
 *     <contract_id>:m<measurement_id>:p<n>
 *     └── prefixo ──┘
 *
 * Três exigências, e o formato atende as três:
 *
 * 1. **Única por parcela.** Existe `UNIQUE (organization_id, reference_id,
 *    entry_type)`. Gravar o id da medição cru — que era o que o RPC
 *    `partner_ws_financials` procurava até 09/09/2026 — só comportaria UMA
 *    parcela por medição; a segunda quebrava no índice. Era um contrato
 *    impossível de honrar, não apenas um que ninguém honrava.
 * 2. **Casa pelo CONTRATO.** O prefixo é o contrato, então as consultas que já
 *    existem (`LIKE contract_id || '%'`) pegam a parcela de medição sem ramo
 *    novo — e `split(':')[0]` no Extrato continua achando o contrato para o
 *    botão "ir para a origem".
 * 3. **Determinística.** Reprocessar a mesma medição reencontra a mesma linha em
 *    vez de duplicar — a propriedade que as séries de contrato ganharam em
 *    09/2026 depois de 61 títulos duplicados em produção.
 */
export const measurementRef = (contractId: string, measurementId: string, n: number): string =>
    `${contractId}:m${measurementId}:p${n}`;

/** Id da medição dentro de um `reference_id`, ou `null` se não for de medição. */
export const measurementIdFromRef = (ref: string | null | undefined): string | null => {
    const m = String(ref ?? '').match(/:m([0-9a-fA-F-]{36}):p\d+$/);
    return m ? m[1] : null;
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
