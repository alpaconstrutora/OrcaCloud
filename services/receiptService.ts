import { supabase } from '../lib/supabase';
import { sanitizeFileName } from '../utils/storageUtils';

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

export interface CreateReceiptItemInput {
    code: string;
    description: string;
    unit: string;
    quantityOrdered: number;
    quantityReceived: number;
    issue?: 'quebrado' | 'faltando';
    notes?: string;
}

export const receiptService = {
    async createReceipt(
        orderId: string,
        data: {
            status: 'Recebido' | 'Divergência' | 'Parcial';
            notes?: string;
            photo?: File;
            items: CreateReceiptItemInput[];
        }
    ): Promise<PurchaseReceipt> {
        let photoPath: string | undefined;

        if (data.photo) {
            const fileName = `${orderId}/receipt_${Date.now()}_${sanitizeFileName(data.photo.name)}`;
            const { data: uploaded, error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(fileName, data.photo);
            if (uploadError) throw uploadError;
            photoPath = uploaded.path;
        }

        const { data: receipt, error } = await supabase
            .from('purchase_receipts')
            .insert({
                order_id: orderId,
                status: data.status,
                notes: data.notes ?? null,
                photo_path: photoPath ?? null,
            })
            .select()
            .single();

        if (error) throw error;

        if (data.items.length > 0) {
            const { error: itemsError } = await supabase
                .from('purchase_receipt_items')
                .insert(
                    data.items.map(item => ({
                        receipt_id: receipt.id,
                        order_item_code: item.code,
                        description: item.description,
                        unit: item.unit,
                        quantity_ordered: item.quantityOrdered,
                        quantity_received: item.quantityReceived,
                        issue: item.issue ?? null,
                        notes: item.notes ?? null,
                    }))
                );
            if (itemsError) throw itemsError;
        }

        return { ...this.mapReceipt(receipt), items: data.items.map((item, i) => ({
            id: '',
            receiptId: receipt.id,
            orderItemCode: item.code,
            description: item.description,
            unit: item.unit,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: item.quantityReceived,
            issue: item.issue,
            notes: item.notes,
        })) };
    },

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
