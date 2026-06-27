import { supabase } from '../lib/supabase';

export interface BrokerPortalToken {
    id: string;
    org_id: string;
    broker_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export const brokerPortalService = {
    /** Gera ou regenera token de acesso para um corretor (admin autenticado). */
    async generateToken(brokerId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('broker_portal_generate_token', {
            p_broker_id: brokerId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    /** Busca token ativo existente de um corretor (admin autenticado). */
    async getTokenForBroker(brokerId: string): Promise<BrokerPortalToken | null> {
        const { data, error } = await supabase
            .from('broker_portal_tokens')
            .select('*')
            .eq('broker_id', brokerId)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return data as BrokerPortalToken | null;
    },

    /** Revoga acesso de um corretor ao portal. */
    async revokeToken(brokerId: string): Promise<void> {
        const { error } = await supabase
            .from('broker_portal_tokens')
            .update({ is_active: false })
            .eq('broker_id', brokerId);
        if (error) throw error;
    },

    /** Valida token e retorna dados do corretor (anon — usado pela rota pública). */
    async getPortalData(token: string): Promise<{ valid: boolean; broker?: any; org_id?: string }> {
        const { data, error } = await supabase.rpc('broker_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; broker?: any; org_id?: string };
    },

    /** URL pública do portal do corretor para compartilhamento. */
    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-corretor?token=${token}`;
    },

    // ── RPCs de dados via token (anon) ────────────────────────────────────────

    async getUnitsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_units', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; units?: any[] };
        return res?.units ?? [];
    },

    async getProposalsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_proposals', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; proposals?: any[] };
        return res?.proposals ?? [];
    },

    async getCommissionsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_broker_portal_get_commissions', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; commissions?: any[] };
        return res?.commissions ?? [];
    },
};
