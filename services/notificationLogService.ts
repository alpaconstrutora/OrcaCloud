import { supabase } from '../lib/supabase';

export type NotificationChannel = 'email' | 'webhook' | 'whatsapp';
export type NotificationStatus = 'sent' | 'failed' | 'pending';

export interface NotificationLogEntry {
    id: string;
    orderId?: string;
    channel: NotificationChannel;
    recipient?: string;
    subject?: string;
    body?: string;
    status: NotificationStatus;
    error?: string;
    metadata?: Record<string, any>;
    createdAt: string;
}

export interface CreateLogInput {
    orderId?: string;
    channel: NotificationChannel;
    recipient?: string;
    subject?: string;
    body?: string;
    status: NotificationStatus;
    error?: string;
    metadata?: Record<string, any>;
}

export const notificationLogService = {
    // Fire-and-forget — never throws so it never blocks the caller
    async log(entry: CreateLogInput): Promise<void> {
        try {
            await supabase.from('notification_log').insert({
                order_id: entry.orderId ?? null,
                channel: entry.channel,
                recipient: entry.recipient ?? null,
                subject: entry.subject ?? null,
                body: entry.body ?? null,
                status: entry.status,
                error: entry.error ?? null,
                metadata: entry.metadata ?? null,
            });
        } catch (err) {
            console.error('[NOTIFICATION LOG] Failed to write log entry:', err);
        }
    },

    /**
     * Últimos envios, para a aba "Logs de envio" da Central de Notificações.
     * Select estreito (nunca `*`) e teto explícito — `notification_log` cresce
     * a cada disparo e a tela é um histórico de diagnóstico, não um relatório.
     */
    async list(limit = 200): Promise<NotificationLogEntry[]> {
        const { data, error } = await supabase
            .from('notification_log')
            .select('id, order_id, channel, recipient, subject, body, status, error, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []).map(notificationLogService.map);
    },

    async listByOrder(orderId: string): Promise<NotificationLogEntry[]> {
        const { data, error } = await supabase
            .from('notification_log')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(this.map);
    },

    map(n: any): NotificationLogEntry {
        return {
            id: n.id,
            orderId: n.order_id ?? undefined,
            channel: n.channel,
            recipient: n.recipient ?? undefined,
            subject: n.subject ?? undefined,
            body: n.body ?? undefined,
            status: n.status,
            error: n.error ?? undefined,
            metadata: n.metadata ?? undefined,
            createdAt: n.created_at,
        };
    },
};
