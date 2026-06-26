import { supabase } from '../lib/supabase';

export interface ClientPortalToken {
    id: string;
    org_id: string;
    client_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export interface ClientPortalValidation {
    valid: boolean;
    client_id?: string;
    org_id?: string;
    name?: string;
    email?: string;
    error?: string;
}

export const clientPortalService = {
    async generateToken(clientId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('client_portal_generate_token', {
            p_client_id: clientId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async validateToken(token: string): Promise<ClientPortalValidation> {
        const { data, error } = await supabase.rpc('client_portal_validate_token', { p_token: token });
        if (error) throw error;
        return data as ClientPortalValidation;
    },

    async getPortalData(token: string): Promise<{ valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string }> {
        const { data, error } = await supabase.rpc('client_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; client?: any; project?: any; portal_tabs?: string[] | null; error?: string };
    },

    async getContractsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_portal_get_contracts', { p_token: token });
        if (error) throw error;
        const res = data as { valid: boolean; data: any[] | null };
        return res.valid ? (res.data ?? []) : [];
    },

    async getTokenForClient(clientId: string): Promise<ClientPortalToken | null> {
        const { data, error } = await supabase
            .from('client_portal_tokens')
            .select('id, org_id, client_id, token, expires_at, last_used_at, is_active, created_at')
            .eq('client_id', clientId)
            .maybeSingle();
        if (error) throw error;
        return data as ClientPortalToken | null;
    },

    async revokeToken(clientId: string): Promise<void> {
        const { error } = await supabase
            .from('client_portal_tokens')
            .update({ is_active: false })
            .eq('client_id', clientId);
        if (error) throw error;
    },

    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-cliente?token=${token}`;
    },
};
