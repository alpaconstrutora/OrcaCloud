import { round2 } from './financialMath';

/**
 * Valor de um item do pedido de compra — qual dos dois pares de preço vale.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────
 *
 * Até 2026-09-17 o item tinha um único par (`unitPrice`/`total`), que misturava
 * três origens: preço do orçamento/SINAPI, preço digitado no avulso e, quando o
 * pedido nascia do mapa de cotação, o preço cotado do fornecedor vencedor. Não
 * havia como distinguir "quanto eu previa" de "quanto o fornecedor cobra".
 *
 * Agora são dois pares (ver `PurchaseOrderItem` em `types/supplyChain.ts`):
 *   · referência — `unitPrice`/`total`
 *   · cotado     — `quotedUnitPrice`/`quotedTotal` (opcional; vazio = sem cotação)
 *
 * E ~20 lugares somam o total do pedido (lista, Contas a Pagar, alçada, 3 vias,
 * estoque, webhook, portal). Se cada um decidisse sozinho qual par usar, a
 * lista mostraria um valor e o título financeiro outro. Por isso a regra mora
 * aqui, uma vez: **cotado quando houver, senão referência**. A trava
 * `__tests__/pedidoValorCotacaoTrava.test.ts` exige que esses consumidores
 * importem daqui.
 *
 * A mesma regra existe em SQL (`fn_pedido_itens_aplicar_cotado`, migration
 * `aplicar_20270921000025`) para as RPCs do portal e as funções que leem o
 * JSONB por dentro. Os dois têm de concordar — mudou aqui, muda lá.
 */

/** O mínimo que um item precisa ter para ser avaliado — serve tipos locais
 *  (`PublicOrderView`) além de `PurchaseOrderItem`. */
export interface ItemComPrecos {
    quantity?: number | null;
    unitPrice?: number | null;
    total?: number | null;
    quotedUnitPrice?: number | null;
    quotedTotal?: number | null;
}

/** `0` cotado é cotação válida; só `null`/ausente é "sem cotação". */
export function temCotacao(item: ItemComPrecos): boolean {
    return item.quotedTotal !== null && item.quotedTotal !== undefined;
}

export function unitarioEfetivoDoItem(item: ItemComPrecos): number {
    return item.quotedUnitPrice ?? item.unitPrice ?? 0;
}

export function valorEfetivoDoItem(item: ItemComPrecos): number {
    return item.quotedTotal ?? item.total ?? 0;
}

export function totalEfetivoDoPedido(items?: ItemComPrecos[] | null): number {
    return (items ?? []).reduce((soma, item) => soma + valorEfetivoDoItem(item), 0);
}

export function totalReferenciaDoPedido(items?: ItemComPrecos[] | null): number {
    return (items ?? []).reduce((soma, item) => soma + (item.total ?? 0), 0);
}

/**
 * Status em que o fornecedor ainda pode informar/alterar o valor cotado.
 * Depois de entregue o preço é fato consumado; cancelado não tem o que cotar.
 * Rascunho nunca chega ao fornecedor (`supplier_portal_pedido_do_fornecedor`).
 */
const STATUS_SEM_COTACAO = new Set(['Entregue', 'Recebido', 'Divergência', 'Cancelado']);
export function fornecedorPodeCotar(status: string | undefined | null): boolean {
    return !STATUS_SEM_COTACAO.has(status ?? '');
}

/** Uma cotação a aplicar sobre um item já existente do pedido. */
export interface CotadoDoItem {
    /** Posição em `items`. Quando bate com o `code`, ganha de qualquer outra linha. */
    index?: number;
    code: string;
    quotedUnitPrice: number | null;
    quotedTotal: number | null;
}

/**
 * Aplica valores cotados sobre os itens do pedido SEM substituir o array —
 * preserva descrição, referência, `avulso` e o que mais houver no JSON.
 *
 * Casamento: índice + code quando o índice bate; senão o PRIMEIRO item ainda
 * não cotado nesta passada com o mesmo code. Identidade de item é `code` +
 * posição (não há id), e `code` pode se repetir (mesmo insumo vindo do
 * orçamento e como avulso) — o índice é o desempate.
 *
 * Espelho exato de `fn_pedido_itens_aplicar_cotado` (SQL).
 */
export function aplicarCotadoNosItens<T extends ItemComPrecos & { code: string }>(
    items: T[],
    cotados: CotadoDoItem[],
): T[] {
    const resultado = items.map(item => ({ ...item }));
    const usados = new Set<number>();

    for (const cotado of cotados) {
        let alvo = -1;
        if (
            cotado.index !== undefined
            && cotado.index >= 0
            && cotado.index < resultado.length
            && resultado[cotado.index].code === cotado.code
            && !usados.has(cotado.index)
        ) {
            alvo = cotado.index;
        } else {
            alvo = resultado.findIndex((item, i) => item.code === cotado.code && !usados.has(i));
        }
        if (alvo < 0) continue;
        usados.add(alvo);
        resultado[alvo] = {
            ...resultado[alvo],
            quotedUnitPrice: cotado.quotedUnitPrice,
            quotedTotal: cotado.quotedTotal,
        };
    }
    return resultado;
}

/**
 * Converte os itens de uma proposta de negociação em cotações a aplicar.
 * Proposta gravada ANTES desta frente só tem `unitPrice`/`total` — nesse caso
 * eles são o valor negociado, e viram o cotado. Sem o fallback, aceitar uma
 * proposta antiga zeraria a cotação do pedido.
 */
export function cotadosDaProposta(
    itensDaProposta: (ItemComPrecos & { code: string })[],
): CotadoDoItem[] {
    return itensDaProposta.map((item, index) => ({
        index,
        code: item.code,
        quotedUnitPrice: item.quotedUnitPrice !== undefined ? item.quotedUnitPrice : (item.unitPrice ?? null),
        quotedTotal: item.quotedTotal !== undefined ? item.quotedTotal : (item.total ?? null),
    }));
}

export interface ItemDaRfq {
    code: string;
    unitPrice?: number | null;
}

export interface ItemDaResposta {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total?: number | null;
}

export interface ItemDoPedidoDaCotacao {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    total: number;
    quotedUnitPrice: number;
    quotedTotal: number;
}

/**
 * Monta os itens do pedido gerado pelo mapa de cotação (`selectWinner`):
 * referência = preço da RFQ (vem do orçamento; 0 quando o item foi digitado
 * na RFQ sem preço), cotado = preço da resposta vencedora.
 *
 * O casamento RFQ ↔ resposta é por `code`, consumindo a n-ésima ocorrência
 * quando o code se repete — a resposta é montada a partir da RFQ na mesma
 * ordem, então a n-ésima de um lado é a n-ésima do outro.
 */
export function montarItensDoPedidoDaCotacao(
    itensRfq: ItemDaRfq[],
    itensResposta: ItemDaResposta[],
): ItemDoPedidoDaCotacao[] {
    const usadosDaRfq = new Set<number>();
    return itensResposta.map(resp => {
        const idxRfq = itensRfq.findIndex((r, i) => r.code === resp.code && !usadosDaRfq.has(i));
        if (idxRfq >= 0) usadosDaRfq.add(idxRfq);
        const referencia = idxRfq >= 0 ? (itensRfq[idxRfq].unitPrice ?? 0) : 0;
        const qty = Number(resp.quantity) || 0;
        const cotado = Number(resp.unitPrice) || 0;
        return {
            code: resp.code,
            description: resp.description,
            unit: resp.unit,
            quantity: qty,
            unitPrice: referencia,
            total: round2(qty * referencia),
            quotedUnitPrice: cotado,
            quotedTotal: resp.total ?? round2(qty * cotado),
        };
    });
}
