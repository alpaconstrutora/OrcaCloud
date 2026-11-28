import { supabase } from '../lib/supabase';

export interface PurchaseReceiptItem {
    id: string;
    receiptId: string;
    orderItemCode: string;
    description: string;
    unit: string;
    quantityOrdered: number;
    quantityReceived: number;
    issue?: 'quebrado' | 'faltando';
    notes?: string;
}

export interface PurchaseReceipt {
    id: string;
    orderId: string;
    receivedAt: string;
    status: 'Recebido' | 'Divergência' | 'Parcial';
    notes?: string;
    photoPath?: string;
    version: number;
    createdAt: string;
    items: PurchaseReceiptItem[];
}

export const receiptService = {
    // `createReceipt` saiu em 28/11/2026: o recebimento grava SÓ pela Edge
    // `pedido-recebimento` (núcleo `_recebimento_registrar_core`, atômico com o status
    // do pedido) — docs/planos/2026-11-27-recebimento-mobile.md, Fase 6.

    async listByOrder(orderId: string): Promise<PurchaseReceipt[]> {
        const { data, error } = await supabase
            .from('purchase_receipts')
            .select('*, purchase_receipt_items(*)')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(r => ({
            ...this.mapReceipt(r),
            items: (r.purchase_receipt_items || []).map(this.mapReceiptItem),
        }));
    },

    mapReceipt(r: Record<string, unknown>): PurchaseReceipt {
        return {
            id: r.id as string,
            orderId: r.order_id as string,
            receivedAt: r.received_at as string,
            status: r.status as PurchaseReceipt['status'],
            notes: r.notes as string | undefined,
            photoPath: r.photo_path as string | undefined,
            version: (r.version as number) ?? 1,
            createdAt: r.created_at as string,
            items: [],
        };
    },

    mapReceiptItem(i: Record<string, unknown>): PurchaseReceiptItem {
        return {
            id: i.id as string,
            receiptId: i.receipt_id as string,
            orderItemCode: i.order_item_code as string,
            description: i.description as string,
            unit: i.unit as string,
            quantityOrdered: Number(i.quantity_ordered),
            quantityReceived: Number(i.quantity_received),
            issue: i.issue as PurchaseReceiptItem['issue'] ?? undefined,
            notes: i.notes as string | undefined ?? undefined,
        };
    },
};
