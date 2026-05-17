import { supabase } from '../lib/supabase';

export interface Notification {
    id: string;
    recipientEmail: string;
    title: string;
    message: string;
    link?: string;
    type?: string;
    isRead: boolean;
    createdAt: string;
}

export const notificationService = {
    async listNotifications(email?: string): Promise<Notification[]> {
        let query = supabase
            .from('notifications')
            .select('*');

        if (email) {
            query = query.eq('recipient_email', email);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((n: any) => ({
            id: n.id,
            recipientEmail: n.recipient_email,
            title: n.title,
            message: n.message,
            link: n.link,
            type: n.type,
            isRead: n.is_read,
            createdAt: n.created_at
        }));
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

    async sendNotification(notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) {
        const { error } = await supabase
            .from('notifications')
            .insert({
                recipient_email: notification.recipientEmail,
                title: notification.title,
                message: notification.message,
                link: notification.link,
                type: notification.type
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
