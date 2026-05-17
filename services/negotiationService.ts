import { supabase } from '../lib/supabase';
import { PurchaseOrder, PurchaseOrderItem } from '../types';
import { orderService } from './orderService';

export interface NegotiationProposal {
    id: string;
    orderId: string;
    senderEmail: string;
    senderRole: 'buyer' | 'supplier';
    deliveryDate: string;
    items: PurchaseOrderItem[];
    paymentMethod?: string;
    paymentTermType?: 'Vista' | 'Parcelado';
    paymentDays?: number;
    paymentInstallments?: number;
    message?: string;
    status: 'pending' | 'accepted' | 'countered' | 'rejected';
    createdAt: string;
}

export const negotiationService = {
    async createProposal(proposal: Omit<NegotiationProposal, 'id' | 'status' | 'createdAt'>) {
        // 1. Insert the proposal
        const { data, error } = await supabase
            .from('purchase_order_negotiations')
            .insert({
                order_id: proposal.orderId,
                sender_email: proposal.senderEmail,
                sender_role: proposal.senderRole,
                delivery_date: proposal.deliveryDate,
                items: proposal.items,
                payment_method: proposal.paymentMethod,
                payment_term_type: proposal.paymentTermType,
                payment_days: proposal.paymentDays,
                payment_installments: proposal.paymentInstallments,
                message: proposal.message,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;

        // 2. Update the order status to 'Em Negociação'
        await orderService.updateOrder(proposal.orderId, {
            status: 'Em Negociação'
        });

        return data;
    },

    async listProposals(orderId: string): Promise<NegotiationProposal[]> {
        const { data, error } = await supabase
            .from('purchase_order_negotiations')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            orderId: item.order_id,
            senderEmail: item.sender_email,
            senderRole: item.sender_role,
            deliveryDate: item.delivery_date,
            items: item.items,
            paymentMethod: item.payment_method,
            paymentTermType: item.payment_term_type,
            paymentDays: item.payment_days,
            paymentInstallments: item.payment_installments,
            message: item.message,
            status: item.status,
            createdAt: item.created_at
        }));
    },

    async acceptProposal(proposalId: string, orderId: string) {
        // 1. Get the proposal details
        const { data: proposal, error: fetchError } = await supabase
            .from('purchase_order_negotiations')
            .select('*')
            .eq('id', proposalId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Mark proposal as accepted
        const { error: updatePropError } = await supabase
            .from('purchase_order_negotiations')
            .update({ status: 'accepted' })
            .eq('id', proposalId);

        if (updatePropError) throw updatePropError;

        // 3. Mark all other pending proposals for this order as countered/stale
        await supabase
            .from('purchase_order_negotiations')
            .update({ status: 'countered' })
            .eq('order_id', orderId)
            .eq('status', 'pending')
            .neq('id', proposalId);

        // 4. Update the main order with the agreed values
        await orderService.updateOrder(orderId, {
            status: 'Confirmado',
            deliveryDate: proposal.delivery_date,
            items: proposal.items,
            paymentMethod: proposal.payment_method,
            paymentTermType: proposal.payment_term_type,
            paymentDays: proposal.payment_days,
            paymentInstallments: proposal.payment_installments
        });

        return proposal;
    }
};
