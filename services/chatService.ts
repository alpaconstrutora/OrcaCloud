import { supabase } from '../lib/supabase';
import { notificationService } from './notificationService';
import { supplierService } from './supplierService';
import { orderService } from './orderService';

/**
 * De que lado do pedido a mensagem veio. Existe como coluna própria (e não
 * inferida do e-mail) porque o fornecedor que entra pelo link público pode não
 * ter e-mail cadastrado — e comparar string de e-mail para decidir de que lado
 * desenhar a bolha erra silenciosamente quando o cadastro está vazio.
 */
export type OrderChatRole = 'buyer' | 'supplier' | 'system';

export interface OrderChatMessage {
    id: string;
    orderId: string;
    senderEmail: string;
    senderName: string;
    senderRole: OrderChatRole;
    message: string;
    isSystem: boolean;
    createdAt: string;
}

/** Linha de `order_chats` como ela volta do banco (ou da RPC de token). */
export function mapChatRow(m: any): OrderChatMessage {
    return {
        id: m.id,
        orderId: m.order_id,
        senderEmail: m.sender_email,
        senderName: m.sender_name,
        // Linha gravada antes da coluna existir cai no default do banco.
        senderRole: (m.sender_role ?? 'buyer') as OrderChatRole,
        message: m.message,
        isSystem: m.is_system,
        createdAt: m.created_at,
    };
}

const CHAT_COLUMNS = 'id, order_id, sender_email, sender_name, sender_role, message, is_system, created_at';

export const chatService = {
    async listMessages(orderId: string): Promise<OrderChatMessage[]> {
        const { data, error } = await supabase
            .from('order_chats')
            .select(CHAT_COLUMNS)
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return (data || []).map(mapChatRow);
    },

    async sendMessage(
        orderId: string,
        senderEmail: string,
        senderName: string,
        message: string,
        senderRole: OrderChatRole = 'buyer',
        isSystem = false,
    ) {
        const { data, error } = await supabase
            .from('order_chats')
            .insert({
                order_id: orderId,
                sender_email: senderEmail,
                sender_name: senderName,
                sender_role: isSystem ? 'system' : senderRole,
                message: message,
                is_system: isSystem
            })
            .select(CHAT_COLUMNS)
            .single();

        if (error) throw error;

        // Trigger notifications — só quando quem escreveu foi o COMPRADOR. Se o
        // fornecedor escreveu, avisar o fornecedor seria devolver a mensagem a
        // quem acabou de mandá-la.
        if (!isSystem && senderRole === 'buyer') {
            try {
                const { data: order } = await supabase
                    .from('purchase_orders')
                    .select('*, projects(name)')
                    .eq('id', orderId)
                    .single();

                if (order) {
                    // 1. If sender is NOT the supplier, notify the supplier
                    if (order.supplier_id) {
                        const supplier = await supplierService.getById(order.supplier_id);
                        if (supplier?.email && senderEmail !== supplier.email) {
                            await notificationService.sendNotification({
                                recipientEmail: supplier.email,
                                title: `Nova mensagem - Pedido ${order.number || ''}`,
                                message: `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
                                link: `/supplier-portal?tab=orders&order=${orderId}`,
                                type: 'chat_message'
                            });
                        }
                    }

                    // 2. If sender IS the supplier, notify the buyer (for now, notify a generic admin or the person linked to the project)
                    // Since we don't have a direct 'buyer_email' in PO, we might need to assume an admin/manager email.
                    // For this demo, let's assume we can notify "altair@example.com" or similar if they are the "buyer".
                    // Or better: notify all users who are NOT the sender and have access? 
                    // Let's just notify the supplier if the buyer talks, and we'll see about the other way.
                }
            } catch (notifyError) {
                console.error("Error sending chat notification:", notifyError);
            }
        }

        return mapChatRow(data);
    },

    /**
     * Subscribe to real-time chat messages for a specific order.
     */
    subscribeToOrder(orderId: string, onNewMessage: (message: OrderChatMessage) => void) {
        return supabase
            .channel(`order-chat-${orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'order_chats',
                    filter: `order_id=eq.${orderId}`
                },
                (payload) => onNewMessage(mapChatRow(payload.new))
            )
            .subscribe();
    }
};
