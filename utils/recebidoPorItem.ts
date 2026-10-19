/**
 * Quanto foi recebido de cada item do pedido — base do 3-Way Match
 * (services/matchService.ts).
 *
 * O recebimento (`purchase_receipt_items`) não guarda o índice nem um id do
 * item: só `order_item_code`, descrição e unidade. Até 19/10/2026 o casamento
 * era SÓ pelo código — e item avulso nasce sem código (`code: ''`). Com vários
 * itens sem código, todos caíam na mesma chave vazia e cada linha mostrava a
 * SOMA do pedido inteiro (PCO-011-017-0002: 7+1+1+3+2 = 14 em todas as linhas,
 * tudo "excesso").
 *
 * Chave: o código quando há; senão descrição + unidade (normalizadas). Itens
 * com a MESMA chave (ex.: dois avulsos iguais) dividem o recebido na ordem do
 * pedido — cada um até a sua quantidade, a sobra fica no último.
 */

interface ItemDoPedido { code?: string | null; description?: string | null; unit?: string | null; quantity: number }
interface ItemRecebido { code?: string | null; description?: string | null; unit?: string | null; quantityReceived: number }

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function chaveDoItem(i: { code?: string | null; description?: string | null; unit?: string | null }): string {
    const code = (i.code ?? '').trim();
    return code ? `c:${code}` : `d:${norm(i.description)}|${norm(i.unit)}`;
}

/** Recebido por item, na MESMA ordem de `itensDoPedido`. */
export function recebidoPorItem(itensDoPedido: ItemDoPedido[], recebidos: ItemRecebido[]): number[] {
    const totalPorChave = new Map<string, number>();
    for (const r of recebidos) {
        const k = chaveDoItem(r);
        totalPorChave.set(k, (totalPorChave.get(k) ?? 0) + (Number(r.quantityReceived) || 0));
    }

    // Índices dos itens do pedido por chave, na ordem do pedido.
    const indicesPorChave = new Map<string, number[]>();
    itensDoPedido.forEach((item, idx) => {
        const k = chaveDoItem(item);
        indicesPorChave.set(k, [...(indicesPorChave.get(k) ?? []), idx]);
    });

    const resultado = itensDoPedido.map(() => 0);
    for (const [k, indices] of indicesPorChave) {
        let restante = totalPorChave.get(k) ?? 0;
        indices.forEach((idx, pos) => {
            const ultimo = pos === indices.length - 1;
            const parte = ultimo ? restante : Math.min(restante, Number(itensDoPedido[idx].quantity) || 0);
            resultado[idx] = parte;
            restante -= parte;
        });
    }
    return resultado;
}
