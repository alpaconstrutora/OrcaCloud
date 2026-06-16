import { supabase } from '../lib/supabase';

export interface ClientPortalMessage {
    id: string;
    organization_id: string;
    client_id: string;
    sender_name: string;
    type: 'comunicado' | 'status_update' | 'vencimento' | 'sistema';
    title: string;
    body?: string;
    reference_type?: string;
    reference_id?: string;
    is_read: boolean;
    created_at: string;
}

export const clientMessagesService = {
    // ── Admin ─────────────────────────────────────────────────────────────────
    async listMessages(orgId: string, clientId?: string): Promise<ClientPortalMessage[]> {
        let q = supabase
            .from('client_portal_messages')
            .select('id,organization_id,client_id,sender_name,type,title,body,reference_type,reference_id,is_read,created_at')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ClientPortalMessage[];
    },

    async sendMessage(orgId: string, clientId: string, payload: {
        sender_name: string;
        type: ClientPortalMessage['type'];
        title: string;
        body?: string;
        reference_type?: string;
        reference_id?: string;
    }): Promise<ClientPortalMessage> {
        const { data, error } = await supabase
            .from('client_portal_messages')
            .insert({ ...payload, organization_id: orgId, client_id: clientId })
            .select('id,organization_id,client_id,sender_name,type,title,body,reference_type,reference_id,is_read,created_at')
            .single();
        if (error) throw error;
        return data as ClientPortalMessage;
    },

    async deleteMessage(id: string): Promise<void> {
        const { error } = await supabase.from('client_portal_messages').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Portal anon ──────────────────────────────────────────────────────────
    async getMessagesByToken(token: string): Promise<{ messages: ClientPortalMessage[]; unread: number }> {
        const { data, error } = await supabase.rpc('fn_portal_get_messages', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: ClientPortalMessage[] | null; unread: number };
        return { messages: res.valid ? (res.data ?? []) : [], unread: res.valid ? Number(res.unread) : 0 };
    },

    async markReadByToken(token: string, messageId: string): Promise<void> {
        await supabase.rpc('fn_portal_mark_message_read', { p_token: token, p_message_id: messageId });
    },

    async markAllReadByToken(token: string): Promise<void> {
        await supabase.rpc('fn_portal_mark_all_read', { p_token: token });
    },
};
