import { supabase } from '../lib/supabase';

export type DiscrepancyStatus = 'Pendente' | 'Resolvida' | 'Aceita' | 'Devolvida';
export type DiscrepancyIssue = 'quebrado' | 'faltando';

export interface PurchaseDiscrepancy {
    id: string;
    orderId: string;
    receiptId?: string;
    orderItemCode: string;
    description: string;
    unit: string;
    issue: DiscrepancyIssue;
    quantity: number;
    notes?: string;
    status: DiscrepancyStatus;
    resolutionNotes?: string;
    resolvedAt?: string;
    createdAt: string;
}

export interface CreateDiscrepancyInput {
    orderItemCode: string;
    description: string;
    unit: string;
    issue: DiscrepancyIssue;
    quantity: number;
    notes?: string;
}

export const discrepancyService = {
    async createFromReceiptItems(
        orderId: string,
        receiptId: string,
        items: CreateDiscrepancyInput[]
    ): Promise<void> {
        if (items.length === 0) return;
        const { error } = await supabase
            .from('purchase_discrepancies')
            .insert(
                items.map(item => ({
                    order_id: orderId,
                    receipt_id: receiptId,
                    order_item_code: item.orderItemCode,
                    description: item.description,
                    unit: item.unit,
                    issue: item.issue,
                    quantity: item.quantity,
                    notes: item.notes ?? null,
                    status: 'Pendente',
                }))
            );
        if (error) throw error;
    },

    async listByOrder(orderId: string): Promise<PurchaseDiscrepancy[]> {
        const { data, error } = await supabase
            .from('purchase_discrepancies')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(this.map);
    },

    async updateStatus(
        id: string,
        status: DiscrepancyStatus,
        resolutionNotes?: string
    ): Promise<PurchaseDiscrepancy> {
        const { data, error } = await supabase
            .from('purchase_discrepancies')
            .update({
                status,
                resolution_notes: resolutionNotes ?? null,
                resolved_at: status !== 'Pendente' ? new Date().toISOString() : null,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return this.map(data);
    },

    map(d: any): PurchaseDiscrepancy {
        return {
            id: d.id,
            orderId: d.order_id,
            receiptId: d.receipt_id ?? undefined,
            orderItemCode: d.order_item_code,
            description: d.description,
            unit: d.unit,
            issue: d.issue,
            quantity: Number(d.quantity),
            notes: d.notes ?? undefined,
            status: d.status,
            resolutionNotes: d.resolution_notes ?? undefined,
            resolvedAt: d.resolved_at ?? undefined,
            createdAt: d.created_at,
        };
    },
};
