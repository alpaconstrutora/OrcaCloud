import { supabase } from '../lib/supabase';
import type { ParcelaDoPedido, ParcelaStatus, PedidoComFinanceiro, PedidoFinanceiro, PurchaseOrder } from '../types';

/**
 * O financeiro de um pedido como o FORNECEDOR o vê: condições (Suprimentos ›
 * Pedidos › Financeiro) + parcelas reais do Contas a Pagar.
 *
 * O fornecedor não passa em nenhuma policy de `internal_transactions` — nem
 * logado, nem pelo link — e a linha carrega dimensões internas do comprador.
 * Então o recorte vem por função (`purchase_order_financeiro_json`): embutido
 * no detalhe e em `supplier_portal_get_financials` para o token, e pela RPC
 * `purchase_orders_financeiro` (lote) para o logado.
 * Migration: aplicar_20270921000026_portal_fornecedor_financeiro.
 */

type FinanceiroRow = {
    condicoes?: {
        payment_method?: string | null;
        payment_term_type?: string | null;
        payment_days?: number | null;
        payment_installments?: number | null;
        notes?: string | null;
    } | null;
    parcelas?: {
        id: string; numero: number; total_parcelas: number; due_date: string | null;
        amount: number | string; payment_date?: string | null; effective_status: string;
    }[] | null;
};

/** `purchase_order_financeiro_json` → camelCase. `amount` vem como numeric (string no JSON). */
export const mapFinanceiroRow = (raw: unknown): PedidoFinanceiro => {
    const r = (raw ?? {}) as FinanceiroRow;
    const c = r.condicoes ?? {};
    return {
        condicoes: {
            paymentMethod: c.payment_method || undefined,
            paymentTermType: c.payment_term_type === 'Parcelado' ? 'Parcelado' : (c.payment_term_type === 'Vista' ? 'Vista' : undefined),
            paymentDays: c.payment_days ?? undefined,
            paymentInstallments: c.payment_installments ?? undefined,
            notes: c.notes || undefined,
        },
        parcelas: (r.parcelas ?? []).map((p): ParcelaDoPedido => ({
            id: p.id,
            numero: Number(p.numero),
            totalParcelas: Number(p.total_parcelas),
            dueDate: p.due_date ?? '',
            amount: Number(p.amount),
            paymentDate: p.payment_date ?? undefined,
            status: p.effective_status as ParcelaStatus,
        })),
    };
};

/** Linha de `supplier_portal_get_financials` → `PedidoComFinanceiro`. */
export const mapPedidoComFinanceiroRow = (raw: unknown): PedidoComFinanceiro => {
    const r = raw as {
        order_id: string; number?: string | null; project_name?: string | null;
        status: PurchaseOrder['status']; total?: number | string | null; financeiro?: unknown;
    };
    return {
        orderId: r.order_id,
        number: r.number || undefined,
        projectName: r.project_name || '-',
        status: r.status,
        total: Number(r.total ?? 0),
        financeiro: mapFinanceiroRow(r.financeiro),
    };
};

export const pedidoFinanceiroService = {
    /**
     * Sessão logada (comprador ou fornecedor), em lote. Pedido fora da
     * permissão simplesmente não vem na resposta — a tela trata como "sem
     * financeiro", que é o mesmo que ele veria.
     */
    async getForOrders(orderIds: string[]): Promise<Record<string, PedidoFinanceiro>> {
        if (orderIds.length === 0) return {};
        const { data, error } = await supabase.rpc('purchase_orders_financeiro', { p_order_ids: orderIds });
        if (error) throw error;
        const porPedido = (data ?? {}) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(porPedido).map(([id, f]) => [id, mapFinanceiroRow(f)]));
    },

    async get(orderId: string): Promise<PedidoFinanceiro | undefined> {
        const tudo = await this.getForOrders([orderId]);
        return tudo[orderId];
    },
};

// ── Regras puras (testáveis sem banco) ──────────────────────────────────

/** Ainda não pago e não cancelado — o que o fornecedor tem A RECEBER. */
export const STATUS_EM_ABERTO: ReadonlySet<ParcelaStatus> = new Set([
    'PREVISTO', 'APROVADO', 'EMITIDO', 'ENVIADO', 'PARCIAL', 'RENEGOCIADO', 'VENCIDO',
]);

export interface ResumoParcelas {
    /** Tudo que ainda não foi pago (inclui vencido). */
    emAberto: number;
    /** Subconjunto de `emAberto` já vencido. */
    vencido: number;
    recebido: number;
    /** A parcela em aberto com o menor vencimento, se houver. */
    proximoVencimento?: ParcelaDoPedido & { pedidoNumber?: string };
}

/** KPIs da aba Financeiro. Soma PARCELAS, nunca o total do pedido. */
export function resumirParcelas(pedidos: PedidoComFinanceiro[]): ResumoParcelas {
    const resumo: ResumoParcelas = { emAberto: 0, vencido: 0, recebido: 0 };
    for (const pedido of pedidos) {
        for (const p of pedido.financeiro.parcelas) {
            if (p.status === 'PAGO') { resumo.recebido += p.amount; continue; }
            if (!STATUS_EM_ABERTO.has(p.status)) continue;
            resumo.emAberto += p.amount;
            if (p.status === 'VENCIDO') resumo.vencido += p.amount;
            if (p.dueDate && (!resumo.proximoVencimento || p.dueDate < resumo.proximoVencimento.dueDate)) {
                resumo.proximoVencimento = { ...p, pedidoNumber: pedido.number };
            }
        }
    }
    return resumo;
}

/** Uma linha da tabela: parcela real, ou o pedido sozinho quando ainda não gerou parcela. */
export interface LinhaFinanceiro {
    pedido: PedidoComFinanceiro;
    parcela?: ParcelaDoPedido;
}

/**
 * Achata pedidos em linhas de tabela, ordenadas por vencimento. Pedido sem
 * parcela entra UMA vez, sem `parcela` — a tela mostra as condições e "A
 * gerar", para o fornecedor ver que o dado deveria estar ali.
 */
export function linhasDaAbaFinanceiro(pedidos: PedidoComFinanceiro[]): LinhaFinanceiro[] {
    const comParcela: LinhaFinanceiro[] = [];
    const semParcela: LinhaFinanceiro[] = [];
    for (const pedido of pedidos) {
        if (pedido.financeiro.parcelas.length === 0) { semParcela.push({ pedido }); continue; }
        for (const parcela of pedido.financeiro.parcelas) comParcela.push({ pedido, parcela });
    }
    comParcela.sort((a, b) => (a.parcela!.dueDate || '9999').localeCompare(b.parcela!.dueDate || '9999'));
    return [...comParcela, ...semParcela];
}

/** "Parcelado 3x · 30 dias" / "À vista · 30 dias" — as condições em uma linha. */
export function descreverCondicoes(c: PedidoFinanceiro['condicoes']): string {
    const termo = c.paymentTermType === 'Parcelado'
        ? `Parcelado ${c.paymentInstallments || 1}x`
        : 'À vista';
    const prazo = c.paymentDays != null ? `${c.paymentDays} dias` : null;
    return [termo, prazo].filter(Boolean).join(' · ');
}
