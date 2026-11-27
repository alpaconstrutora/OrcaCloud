/**
 * Recebimento de pedido de compra — a REGRA, pura (sem banco, sem React).
 *
 * Uma regra, dois chamadores (docs/planos/2026-11-27-recebimento-mobile.md): a
 * tela usa para a prévia (celular, link `/celular` e o modal do computador) e a
 * Edge `pedido-recebimento` usa como verdade antes de gravar. Sem imports — o
 * Deno, o Vite e o Vitest carregam igual.
 *
 * Regras (decisões do usuário de 27/11/2026):
 *   • CIF pode ser recebido já "Em Trânsito" (antes, só "Entregue"); FOB só
 *     depois da retirada ("Entregue", que a tela chama de "Retirado").
 *   • Parcial: item a menor marcado "o resto vem depois" não é divergência — o
 *     pedido fica "Entregue" e aceita outra conferência com o SALDO. A menor sem
 *     a marca continua sendo divergência "faltando"; problema (quebrado/faltando)
 *     é sempre divergência.
 *   • Descrição, unidade e quantidade vêm do PEDIDO no banco; de quem confere
 *     chegam só, por índice, a quantidade recebida, o problema, a marca e a obs.
 */

export type Problema = 'faltando' | 'quebrado';
export type StatusDoRecebimento = 'Recebido' | 'Divergência' | 'Parcial';

export interface ItemDoPedido { code?: string | null; description?: string | null; unit?: string | null; quantity: number }

/** Item de uma conferência já gravada (`purchase_receipt_items`). */
export interface ItemRecebidoAntes { indice?: number | null; code?: string | null; quantidadeRecebida: number }
export interface RecebimentoAnterior { status: string; itens: ItemRecebidoAntes[] }

/** O que chega de quem confere, por item. */
export interface EntradaDoItem {
    indice: number;
    recebida: number;
    problema?: Problema | null;
    restoDepois?: boolean;
    obs?: string | null;
}

export interface LinhaDoRecebimento {
    indice: number;
    code: string;
    description: string;
    unit: string;
    /** O que se esperava NESTA conferência = saldo do item. */
    pedida: number;
    recebida: number;
    problema: Problema | null;
    restoDepois: boolean;
    obs: string | null;
}

/** Erro de entrada (vira 400 na Edge). */
export class ErroDeRecebimento extends Error {}

const STATUS_CIF_QUE_RECEBE = ['Em Trânsito', 'Entregue'];

/** Pode registrar conferência neste status? */
export function podeReceber(status: string | null | undefined, ehFob: boolean): boolean {
    if (!status) return false;
    return ehFob ? status === 'Entregue' : STATUS_CIF_QUE_RECEBE.includes(status);
}

/** Por que não dá para receber (texto da tela/botão desligado), ou null. */
export function motivoParaNaoReceber(status: string | null | undefined, ehFob: boolean): string | null {
    if (podeReceber(status, ehFob)) return null;
    if (status === 'Recebido' || status === 'Divergência') return 'Este pedido já foi conferido.';
    if (status === 'Cancelado') return 'Pedido cancelado.';
    if (ehFob) return 'Registre a retirada antes de conferir.';
    return 'O fornecedor ainda não despachou este pedido.';
}

const arred = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Saldo a receber de cada item (mesma ordem de `itens`): pedido − o que já
 * chegou em conferências PARCIAIS (só elas deixam o pedido aberto). Item de
 * conferência antiga sem índice casa pelo código, na ordem.
 */
export function saldoPorItem(itens: ItemDoPedido[], anteriores: RecebimentoAnterior[]): number[] {
    const recebido = itens.map(() => 0);
    for (const r of anteriores) {
        if (r.status !== 'Parcial') continue;
        const usados = new Set<number>();
        for (const it of r.itens) {
            let i = typeof it.indice === 'number' && it.indice >= 0 && it.indice < itens.length ? it.indice : -1;
            if (i < 0) i = itens.findIndex((p, k) => !usados.has(k) && (p.code ?? '') === (it.code ?? ''));
            if (i < 0) continue;
            usados.add(i);
            recebido[i] += Number(it.quantidadeRecebida) || 0;
        }
    }
    return itens.map((p, i) => Math.max(0, arred((Number(p.quantity) || 0) - recebido[i])));
}

/**
 * As linhas da conferência: uma por item com saldo > 0, cada uma com a entrada
 * do mesmo índice. Lança `ErroDeRecebimento` em entrada inválida.
 */
export function montarLinhas(itens: ItemDoPedido[], saldo: number[], entradas: EntradaDoItem[]): LinhaDoRecebimento[] {
    if (!Array.isArray(entradas)) throw new ErroDeRecebimento('Conferência sem itens.');
    const porIndice = new Map<number, EntradaDoItem>();
    for (const e of entradas) {
        if (!e || !Number.isInteger(e.indice) || e.indice < 0 || e.indice >= itens.length) {
            throw new ErroDeRecebimento('Item da conferência não existe neste pedido.');
        }
        if (porIndice.has(e.indice)) throw new ErroDeRecebimento('Item conferido duas vezes.');
        if ((saldo[e.indice] ?? 0) <= 0) throw new ErroDeRecebimento(`O item ${e.indice + 1} já foi todo recebido.`);
        porIndice.set(e.indice, e);
    }
    const linhas: LinhaDoRecebimento[] = [];
    itens.forEach((p, i) => {
        const pedida = saldo[i] ?? 0;
        if (pedida <= 0) return;
        const e = porIndice.get(i);
        if (!e) throw new ErroDeRecebimento(`Falta conferir o item ${i + 1} (${p.description || p.code || 'sem descrição'}).`);
        const recebida = Number(e.recebida);
        if (!Number.isFinite(recebida) || recebida < 0) throw new ErroDeRecebimento(`Quantidade inválida no item ${i + 1}.`);
        if (recebida > pedida + 1e-9) throw new ErroDeRecebimento(`O item ${i + 1} recebeu mais do que o saldo (${pedida}).`);
        const falta = recebida < pedida - 1e-9;
        const problema = e.problema === 'faltando' || e.problema === 'quebrado' ? e.problema : null;
        if (e.problema != null && !problema) throw new ErroDeRecebimento(`Problema inválido no item ${i + 1}.`);
        const restoDepois = !!e.restoDepois;
        if (restoDepois && !falta) throw new ErroDeRecebimento(`"O resto vem depois" só vale para item recebido a menor (item ${i + 1}).`);
        if (restoDepois && problema) throw new ErroDeRecebimento(`Item ${i + 1}: marque problema OU "o resto vem depois", não os dois.`);
        const obs = typeof e.obs === 'string' && e.obs.trim() ? e.obs.trim().slice(0, 500) : null;
        linhas.push({
            indice: i, code: p.code ?? '', description: p.description ?? '', unit: p.unit ?? '',
            pedida, recebida, problema, restoDepois, obs,
        });
    });
    if (linhas.length === 0) throw new ErroDeRecebimento('Não há saldo a receber neste pedido.');
    return linhas;
}

const faltaNaLinha = (l: LinhaDoRecebimento) => l.recebida < l.pedida - 1e-9;
const divergeNaLinha = (l: LinhaDoRecebimento) => !!l.problema || (faltaNaLinha(l) && !l.restoDepois);

export function statusDoRecebimento(linhas: LinhaDoRecebimento[]): StatusDoRecebimento {
    if (linhas.some(divergeNaLinha)) return 'Divergência';
    if (linhas.some(l => faltaNaLinha(l) && l.restoDepois)) return 'Parcial';
    return 'Recebido';
}

/** O pedido não tem status "Parcial" (CHECK do banco): fica "Entregue", a receber o resto. */
export function statusDoPedidoApos(st: StatusDoRecebimento): 'Entregue' | 'Recebido' | 'Divergência' {
    return st === 'Parcial' ? 'Entregue' : st;
}

/** Divergências a abrir (`purchase_discrepancies`): só as linhas que divergem. */
export function divergenciasDe(linhas: LinhaDoRecebimento[]) {
    return linhas.filter(divergeNaLinha).map(l => ({
        orderItemCode: l.code,
        description: l.description,
        unit: l.unit,
        issue: (l.problema ?? 'faltando') as Problema,
        quantity: Math.max(0, arred(l.pedida - l.recebida)),
        notes: l.obs,
    }));
}

/** Campo legado `purchase_orders.discrepancy_report` (exibição antiga). */
export function relatorioLegado(linhas: LinhaDoRecebimento[]) {
    const r = linhas.filter(divergeNaLinha).map(l => ({
        code: l.code, description: l.description, issue: (l.problema ?? 'faltando') as Problema,
        quantity: arred(l.pedida - l.recebida),
    }));
    return r.length > 0 ? r : null;
}

/** Caminho fixo da foto do comprovante no bucket `receipts` (pasta = pedido). */
export function caminhoDoComprovante(orderId: string, receiptId: string): string {
    return `${orderId}/receipt_${receiptId}.jpg`;
}

/** Texto do botão de confirmar, pelo status que vai ser gravado. */
export function rotuloDoConfirmar(st: StatusDoRecebimento): string {
    if (st === 'Recebido') return 'Confirmar recebimento total';
    if (st === 'Parcial') return 'Registrar recebimento parcial';
    return 'Registrar com divergências';
}
