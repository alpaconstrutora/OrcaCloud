import { supabase } from '../lib/supabase';

export type AnnouncementType = 'aviso' | 'assembleia' | 'votacao' | 'comunicado';

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
    aviso: 'Aviso',
    assembleia: 'Assembleia',
    votacao: 'Votação',
    comunicado: 'Comunicado',
};

export interface InvestorAnnouncement {
    id?: string;
    organization_id: string;
    project_id?: string | null;
    title: string;
    body: string;
    type: AnnouncementType;
    published_at?: string | null;
    requires_acknowledgment: boolean;
    created_at?: string;
    // joined fields (not persisted)
    ack_count?: number;
    user_acknowledged?: boolean;
    user_vote?: string | null;
}

export interface InvestorAcknowledgment {
    id?: string;
    announcement_id: string;
    investor_id: string;
    acknowledged_at?: string;
    vote_option?: string | null;
}

const ANN_COLS = 'id, organization_id, project_id, title, body, type, published_at, requires_acknowledgment, created_at';
const ACK_COLS = 'id, announcement_id, investor_id, acknowledged_at, vote_option';

export const announcementsService = {
    async list(organizationId: string, investorId?: string): Promise<InvestorAnnouncement[]> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .select(ANN_COLS)
            .eq('organization_id', organizationId)
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false });

        if (error) throw error;
        const items = (data ?? []) as InvestorAnnouncement[];

        // Para cada announcement, verificar se o investidor já aceitou
        if (investorId && items.length > 0) {
            const ids = items.map(a => a.id!);
            const { data: acks } = await supabase
                .from('investor_acknowledgments')
                .select(ACK_COLS)
                .in('announcement_id', ids)
                .eq('investor_id', investorId);

            const ackMap = new Map((acks ?? []).map(a => [a.announcement_id, a]));
            items.forEach(item => {
                const ack = ackMap.get(item.id!);
                item.user_acknowledged = !!ack;
                item.user_vote = ack?.vote_option ?? null;
            });
        }
        return items;
    },

    async listAll(organizationId: string): Promise<InvestorAnnouncement[]> {
        const { data, error } = await supabase
            .from('investor_announcements')
            .select(ANN_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as InvestorAnnouncement[];
    },

    async save(a: Omit<InvestorAnnouncement, 'id' | 'created_at' | 'ack_count' | 'user_acknowledged' | 'user_vote'>): Promise<InvestorAnnouncement> {
        if ((a as any).id) {
            const { data, error } = await supabase
                .from('investor_announcements')
                .update(a)
                .eq('id', (a as any).id)
                .select(ANN_COLS)
                .single();
            if (error) throw error;
            return data as InvestorAnnouncement;
        }
        const { data, error } = await supabase
            .from('investor_announcements')
            .insert(a)
            .select(ANN_COLS)
            .single();
        if (error) throw error;
        return data as InvestorAnnouncement;
    },

    async publish(id: string): Promise<void> {
        const { error } = await supabase
            .from('investor_announcements')
            .update({ published_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('investor_announcements').delete().eq('id', id);
        if (error) throw error;
    },

    async acknowledge(announcementId: string, investorId: string, voteOption?: string): Promise<void> {
        const { error } = await supabase
            .from('investor_acknowledgments')
            .upsert(
                { announcement_id: announcementId, investor_id: investorId, vote_option: voteOption ?? null },
                { onConflict: 'announcement_id,investor_id' }
            );
        if (error) throw error;
    },

    async listAcknowledgments(announcementId: string): Promise<InvestorAcknowledgment[]> {
        const { data, error } = await supabase
            .from('investor_acknowledgments')
            .select(ACK_COLS)
            .eq('announcement_id', announcementId);
        if (error) throw error;
        return (data ?? []) as InvestorAcknowledgment[];
    },
};
