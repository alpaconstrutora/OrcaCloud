import { supabase } from '../lib/supabase';
import type { PurchaseOrderItem } from '../types/supplyChain';

// ── Tipos do 3-Way Match ──────────────────────────────────────────────────────

export type MatchStatus = 'ok' | 'partial' | 'excess' | 'missing' | 'pending';

export interface MatchLine {
  code: string;
  description: string;
  unit: string;
  orderedQty: number;
  orderedValue: number;
  receivedQty: number;
  invoicedValue: number;   // proporcional da NF pelo peso do item no pedido
  qtyStatus: MatchStatus;
  valueStatus: MatchStatus;
}

export interface ThreeWayMatchData {
  orderId: string;
  orderNumber: string;
  supplierName: string;
  orderTotal: number;
  receiptTotal: number;    // soma dos quantitativos recebidos * preço do pedido
  invoiceTotal: number;    // soma das NF-es vinculadas
  lines: MatchLine[];
  invoices: { id: string; issuerName: string; total: number; approvedAt: string | null }[];
  overallStatus: MatchStatus;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function qtyStatus(ordered: number, received: number): MatchStatus {
  if (received === 0)             return 'missing';
  if (received === ordered)       return 'ok';
  if (received < ordered)         return 'partial';
  return 'excess';
}

function valueStatus(ordered: number, invoiced: number): MatchStatus {
  if (invoiced === 0)                          return 'pending';
  const pct = Math.abs(invoiced - ordered) / ordered;
  if (pct <= 0.005)                            return 'ok';      // tolerância 0,5%
  if (invoiced < ordered)                      return 'partial';
  return 'excess';
}

function worstStatus(statuses: MatchStatus[]): MatchStatus {
  const rank: Record<MatchStatus, number> = { ok: 0, pending: 1, partial: 2, missing: 3, excess: 3 };
  return statuses.sort((a, b) => rank[b] - rank[a])[0] ?? 'ok';
}

// ── Service ──────────────────────────────────────────────────────────────────

export const matchService = {
  async getThreeWayMatch(orderId: string): Promise<ThreeWayMatchData | null> {
    // 1. Pedido
    const { data: order, error: orderErr } = await supabase
      .from('purchase_orders')
      .select('id, number, supplier_id, items, suppliers(name)')
      .eq('id', orderId)
      .single<{
        id: string; number: string; supplier_id: string;
        items: PurchaseOrderItem[];
        suppliers: { name: string } | null;
      }>();
    if (orderErr || !order) return null;

    // 2. Recebimentos
    const { data: receipts } = await supabase
      .from('purchase_receipts')
      .select('id, status, purchase_receipt_items(order_item_code, quantity_received)')
      .eq('order_id', orderId);

    // 3. NF-es vinculadas a este pedido
    const { data: invoices } = await supabase
      .from('nfe_invoices')
      .select('id, issuer_name, total_value, approved_at')
      .eq('purchase_order_id', orderId);

    // ── Agregar recebimentos por código ────────────────────────────────────
    const receivedByCode: Record<string, number> = {};
    for (const r of receipts ?? []) {
      for (const item of (r.purchase_receipt_items as { order_item_code: string; quantity_received: number }[] | null) ?? []) {
        receivedByCode[item.order_item_code] =
          (receivedByCode[item.order_item_code] ?? 0) + Number(item.quantity_received);
      }
    }

    const orderItems: PurchaseOrderItem[] = order.items ?? [];
    const orderTotal  = orderItems.reduce((s, i) => s + (i.total ?? i.quantity * i.unitPrice), 0);
    const invoiceTotal = (invoices ?? []).reduce((s, i) => s + Number(i.total_value), 0);

    // ── Construir linhas ───────────────────────────────────────────────────
    const lines: MatchLine[] = orderItems.map(item => {
      const rcvd    = receivedByCode[item.code] ?? 0;
      const weight  = orderTotal > 0 ? (item.total ?? 0) / orderTotal : 0;
      const invPart = invoiceTotal * weight;

      return {
        code:          item.code,
        description:   item.description,
        unit:          item.unit,
        orderedQty:    item.quantity,
        orderedValue:  item.total ?? item.quantity * item.unitPrice,
        receivedQty:   rcvd,
        invoicedValue: invPart,
        qtyStatus:     qtyStatus(item.quantity, rcvd),
        valueStatus:   valueStatus(item.total ?? item.quantity * item.unitPrice, invPart),
      };
    });

    const receiptTotal = lines.reduce((s, l) => {
      const unitPrice = orderTotal > 0 ? l.orderedValue / (l.orderedQty || 1) : 0;
      return s + l.receivedQty * unitPrice;
    }, 0);

    const overallStatus = worstStatus([
      ...lines.map(l => l.qtyStatus),
      valueStatus(orderTotal, invoiceTotal),
    ]);

    return {
      orderId,
      orderNumber: order.number,
      supplierName: order.suppliers?.name ?? '—',
      orderTotal,
      receiptTotal,
      invoiceTotal,
      lines,
      invoices: (invoices ?? []).map(i => ({
        id: i.id,
        issuerName: i.issuer_name,
        total: Number(i.total_value),
        approvedAt: i.approved_at,
      })),
      overallStatus,
    };
  },
};
