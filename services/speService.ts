import { supabase } from '../lib/supabase';

export interface SpeEntity {
    id?: string;
    organization_id: string;
    project_id?: string | null;
    name: string;
    cnpj?: string;
    capital_social: number;
    created_at?: string;
    // joined (not persisted)
    partners?: SpePartner[];
}

export interface SpePartner {
    id?: string;
    spe_entity_id: string;
    investor_id: string;
    quota_count: number;
    ownership_pct: number;
    capital_calls_total: number;
    capital_paid: number;
    created_at?: string;
    // joined fields for display
    investor_name?: string;
    investor_email?: string;
}

const SPE_COLS = 'id, organization_id, project_id, name, cnpj, capital_social, created_at';
const PARTNER_COLS = 'id, spe_entity_id, investor_id, quota_count, ownership_pct, capital_calls_total, capital_paid, created_at';

export const speService = {
    // ─── SPE Entities ─────────────────────────────────────────────────────────

    async list(organizationId: string): Promise<SpeEntity[]> {
        const { data, error } = await supabase
            .from('spe_entities')
            .select(SPE_COLS)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as SpeEntity[];
    },

    async save(e: SpeEntity): Promise<SpeEntity> {
        if (e.id) {
            const { data, error } = await supabase
                .from('spe_entities')
                .update(e)
                .eq('id', e.id)
                .select(SPE_COLS)
                .single();
            if (error) throw error;
            return data as SpeEntity;
        }
        const { data, error } = await supabase
            .from('spe_entities')
            .insert(e)
            .select(SPE_COLS)
            .single();
        if (error) throw error;
        return data as SpeEntity;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('spe_entities').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── SPE Partners ─────────────────────────────────────────────────────────

    async listPartners(speEntityId: string): Promise<SpePartner[]> {
        const { data, error } = await supabase
            .from('spe_partners')
            .select(`${PARTNER_COLS}, investors(name, email)`)
            .eq('spe_entity_id', speEntityId)
            .order('ownership_pct', { ascending: false });
        if (error) throw error;
        return ((data ?? []) as any[]).map(p => ({
            ...p,
            investor_name: p.investors?.name,
            investor_email: p.investors?.email,
        })) as SpePartner[];
    },

    async savePartner(p: SpePartner): Promise<SpePartner> {
        if (p.id) {
            const { data, error } = await supabase
                .from('spe_partners')
                .update(p)
                .eq('id', p.id)
                .select(PARTNER_COLS)
                .single();
            if (error) throw error;
            return data as SpePartner;
        }
        const { data, error } = await supabase
            .from('spe_partners')
            .insert(p)
            .select(PARTNER_COLS)
            .single();
        if (error) throw error;
        return data as SpePartner;
    },

    async removePartner(id: string): Promise<void> {
        const { error } = await supabase.from('spe_partners').delete().eq('id', id);
        if (error) throw error;
    },

    /** Registra chamada de capital — incrementa capital_calls_total */
    async addCapitalCall(partnerId: string, amount: number): Promise<void> {
        const { error } = await supabase.rpc('increment_spe_capital_call', {
            p_partner_id: partnerId,
            p_amount: amount,
        });
        // Fallback se o RPC não existir: update direto
        if (error) {
            const { data: current } = await supabase
                .from('spe_partners').select('capital_calls_total').eq('id', partnerId).single();
            await supabase.from('spe_partners')
                .update({ capital_calls_total: (current?.capital_calls_total ?? 0) + amount })
                .eq('id', partnerId);
        }
    },

    /** Registra pagamento de chamada — incrementa capital_paid */
    async addCapitalPayment(partnerId: string, amount: number): Promise<void> {
        const { data: current } = await supabase
            .from('spe_partners').select('capital_paid').eq('id', partnerId).single();
        const { error } = await supabase.from('spe_partners')
            .update({ capital_paid: (current?.capital_paid ?? 0) + amount })
            .eq('id', partnerId);
        if (error) throw error;
    },
};
