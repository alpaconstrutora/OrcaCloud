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
    /**
     * Resposta do fornecedor. Note que ela NÃO muda o `status`: quem resolve a
     * divergência é o comprador. Se o fornecedor pudesse mexer no status, ele
     * fecharia a própria divergência — por isso a escrita passa por RPC, e não
     * por UPDATE direto (RLS não restringe coluna).
     */
    supplierResponse?: string;
    supplierRespondedAt?: string;
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
            .select('id, order_id, receipt_id, order_item_code, description, unit, issue, quantity, notes, status, resolution_notes, resolved_at, supplier_response, supplier_responded_at, created_at')
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

    /**
     * Resposta do fornecedor LOGADO (o que entra pelo link público usa
     * `supplierPortalTokenService.respondDiscrepancy`). Passa por RPC porque a
     * RLS não sabe restringir COLUNA: liberar UPDATE na tabela abriria `status`
     * junto, e aí o fornecedor fecharia a própria divergência.
     */
    async respondAsSupplier(id: string, response: string): Promise<PurchaseDiscrepancy> {
        const { data, error } = await supabase.rpc('discrepancy_supplier_respond', {
            p_discrepancy_id: id,
            p_response: response,
        });
        if (error) throw error;
        const res = data as { valid?: boolean; error?: string; data?: unknown } | null;
        if (!res?.valid) {
            throw new Error(
                res?.error === 'ja_resolvida'
                    ? 'Esta divergência já foi resolvida pelo comprador.'
                    : res?.error === 'resposta_vazia'
                        ? 'Escreva uma resposta antes de enviar.'
                        : 'Não foi possível registrar a resposta.',
            );
        }
        return discrepancyService.map(res.data);
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
            supplierResponse: d.supplier_response ?? undefined,
            supplierRespondedAt: d.supplier_responded_at ?? undefined,
            createdAt: d.created_at,
        };
    },
};
