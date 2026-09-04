import { supabase } from '../lib/supabase';

export interface Notification {
    id: string;
    recipientEmail: string;
    title: string;
    message: string;
    link?: string;
    type?: string;
    /** Organização dona da notificação. `null` = notificação pessoal (ver migration 20270919000001). */
    organizationId?: string | null;
    isRead: boolean;
    createdAt: string;
}

const NOTIFICATION_COLS =
    'id, recipient_email, title, message, link, type, organization_id, is_read, created_at';

function mapNotification(n: any): Notification {
    return {
        id: n.id,
        recipientEmail: n.recipient_email,
        title: n.title,
        message: n.message,
        link: n.link,
        type: n.type,
        organizationId: n.organization_id ?? null,
        isRead: n.is_read,
        createdAt: n.created_at,
    };
}

export const notificationService = {
    /**
     * @param email          Recorta por destinatário. `undefined` = todos os que a RLS deixa ver.
     * @param organizationId Organização do seletor do topo (REGRA #5). `null`/`undefined` =
     *                       "Todas" → sem recorte. **Nunca** use como guard de carregamento.
     */
    async listNotifications(email?: string, organizationId?: string | null): Promise<Notification[]> {
        let query = supabase
            .from('notifications')
            .select(NOTIFICATION_COLS);

        if (email) {
            query = query.eq('recipient_email', email);
        }

        if (organizationId) {
            // Notificação sem organização é pessoal (destinatário externo, ou
            // produtor que ainda não sabe a org) — ela acompanha o usuário em
            // qualquer contexto do seletor, senão sumiria da caixa dele ao
            // escolher uma organização.
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(mapNotification);
    },

    async markAsRead(id: string) {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) throw error;
        window.dispatchEvent(new CustomEvent('notifications_updated'));
    },

    async markAllAsRead(email?: string) {
        let query = supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);

        if (email) {
            query = query.eq('recipient_email', email);
        }

        const { error } = await query;
        if (error) throw error;
        window.dispatchEvent(new CustomEvent('notifications_updated'));
    },

    /**
     * `organizationId` é opcional porque nem todo produtor sabe a organização
     * (ver `TaskForm.tsx` e `chatService.ts`). Sem ela a notificação nasce
     * pessoal: só o destinatário a enxerga. Preencha sempre que a org estiver
     * em escopo — é o que dá visibilidade ao resto da equipe.
     */
    async sendNotification(notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) {
        const { error } = await supabase
            .from('notifications')
            .insert({
                recipient_email: notification.recipientEmail,
                title: notification.title,
                message: notification.message,
                link: notification.link,
                type: notification.type,
                organization_id: notification.organizationId ?? null
            });

        if (error) throw error;
        window.dispatchEvent(new CustomEvent('notifications_updated'));
    },

    async deleteNotification(id: string) {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;
        window.dispatchEvent(new CustomEvent('notifications_updated'));
    },

    subscribeToNotifications(onUpdate: (payload?: any) => void, email?: string) {
        const channelId = email ? `notifications-${email}` : 'notifications-all';
        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: email ? `recipient_email=eq.${email}` : undefined
                },
                (payload) => {
                    onUpdate(payload);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
};
