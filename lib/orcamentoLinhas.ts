import { SinapiType, type BudgetEntry } from '../types/budget';

/**
 * Linhas do orçamento da obra para os seletores de Suprimentos.
 *
 * Composição aparece ela mesma E desdobrada nos seus insumos logo abaixo —
 * qtd sugerida = coeficiente × quantidade orçada. Desdobra na própria lista em
 * vez de abrir uma janela de insumos por cima do painel (UI_PATTERNS §4).
 *
 * Preço: o do mapa `preco` (SINAPI atual da UF da obra) quando houver, senão o
 * gravado no orçamento.
 */
export interface LinhaDoOrcamento {
    key: string;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    price: number;
    origem: string;
    type: SinapiType;
    budgetItemId: string;
    budgetItemCode: string;
    budgetItemDescription: string;
    compositionCode?: string;
}

const TIPO: Record<string, string> = {
    [SinapiType.COMPOSITION]: 'Composição',
    [SinapiType.INPUT]: 'Insumo',
    [SinapiType.SERVICE]: 'Serviço',
};

const quatroCasas = (n: number) => Math.round(n * 10000) / 10000;

export function montarLinhas(budget: BudgetEntry[], preco: Map<string, number>): LinhaDoOrcamento[] {
    const linhas: LinhaDoOrcamento[] = [];
    for (const e of budget) {
        const s = e.sinapiItem;
        if (!s) continue;
        const base = { budgetItemId: e.id, budgetItemCode: s.code, budgetItemDescription: s.description };
        linhas.push({
            key: e.id, code: s.code, description: s.description, unit: s.unit,
            quantity: Number(e.quantity) || 0,
            price: preco.get(s.code) ?? (Number(s.price) || 0),
            origem: `${TIPO[s.type] ?? 'Item'} do orçamento`,
            type: s.type,
            ...base,
        });
        if (s.type === SinapiType.COMPOSITION) {
            for (const c of s.composition ?? []) {
                linhas.push({
                    key: `${e.id}:${c.code}`, code: c.code, description: c.description, unit: c.unit,
                    quantity: quatroCasas((Number(c.quantity) || 0) * (Number(e.quantity) || 0)),
                    price: preco.get(c.code) ?? (Number(c.price) || 0),
                    origem: `Insumo de ${s.code}`,
                    type: c.type,
                    compositionCode: s.code,
                    ...base,
                });
            }
        }
    }
    return linhas;
}

/**
 * Pedido de Compra › "+ Item do orçamento" (10/11/2026): as linhas acima, sem
 * SERVIÇO de topo (pedido de compra não compra serviço — mesma regra da antiga
 * "Seleção de materiais da obra"), com o quanto já foi comprado na obra.
 *
 * - `titulo`: a linha da própria composição — guia os insumos abaixo, não se
 *   marca (o pedido compra o insumo, como na janela de insumos de antes).
 * - `jaNoPedido`: o código já está neste pedido — editar a quantidade é na
 *   tabela "Itens do pedido", não incluir de novo.
 * - `aComprar`: orçada − comprada, nunca negativa.
 */
export interface LinhaDoOrcamentoNoPedido extends LinhaDoOrcamento {
    comprada: number;
    aComprar: number;
    titulo: boolean;
    jaNoPedido: boolean;
}

export function linhasDoOrcamentoParaPedido(
    budget: BudgetEntry[],
    preco: Map<string, number>,
    compradas: Map<string, number>,
    noPedido: Set<string>,
): LinhaDoOrcamentoNoPedido[] {
    return montarLinhas(budget, preco)
        .filter(l => l.compositionCode || l.type !== SinapiType.SERVICE)
        .map(l => {
            const titulo = !l.compositionCode && l.type === SinapiType.COMPOSITION;
            const comprada = titulo ? 0 : (compradas.get(l.code) ?? 0);
            return {
                ...l,
                comprada,
                aComprar: titulo ? 0 : Math.max(quatroCasas(l.quantity - comprada), 0),
                titulo,
                jaNoPedido: !titulo && noPedido.has(l.code),
            };
        });
}
