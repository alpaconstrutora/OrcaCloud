import { supabase } from '../lib/supabase';

export interface InvestorPortalToken {
    id: string;
    org_id: string;
    investor_id: string;
    token: string;
    expires_at: string;
    last_used_at?: string;
    is_active: boolean;
    created_at?: string;
}

export const investorPortalTokenService = {
    async generateToken(investorId: string, orgId: string): Promise<string> {
        const { data, error } = await supabase.rpc('investor_portal_generate_token', {
            p_investor_id: investorId,
            p_org_id: orgId,
        });
        if (error) throw error;
        return data as string;
    },

    async getTokenForInvestor(investorId: string): Promise<InvestorPortalToken | null> {
        const { data, error } = await supabase
            .from('investor_portal_tokens')
            .select('id, org_id, investor_id, token, expires_at, last_used_at, is_active, created_at')
            .eq('investor_id', investorId)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw error;
        return data as InvestorPortalToken | null;
    },

    async revokeToken(investorId: string): Promise<void> {
        const { error } = await supabase
            .from('investor_portal_tokens')
            .update({ is_active: false })
            .eq('investor_id', investorId);
        if (error) throw error;
    },

    async getPortalData(token: string): Promise<{ valid: boolean; investor?: any; org_id?: string }> {
        const { data, error } = await supabase.rpc('investor_portal_get_data', { p_token: token });
        if (error) throw error;
        return data as { valid: boolean; investor?: any; org_id?: string };
    },

    buildPortalUrl(token: string): string {
        return `${window.location.origin}/portal-investidor?token=${token}`;
    },

    // ── RPCs de dados via token (anon) ────────────────────────────────────────

    async getSummaryByToken(token: string): Promise<{ participations: any[]; contributions: any[]; projects: any[] }> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_summary', { p_token: token });
        if (error) throw error;
        const res = data as any;
        return {
            participations: res?.participations ?? [],
            contributions: res?.contributions ?? [],
            projects: res?.projects ?? [],
        };
    },

    async getReportsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_reports', { p_token: token });
        if (error) throw error;
        return (data as any)?.reports ?? [];
    },

    async getAnnouncementsByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_announcements', { p_token: token });
        if (error) throw error;
        return (data as any)?.announcements ?? [];
    },

    async acknowledgeByToken(token: string, announcementId: string, voteOption?: string): Promise<void> {
        const { error } = await supabase.rpc('fn_investor_portal_acknowledge', {
            p_token: token,
            p_announcement_id: announcementId,
            p_vote_option: voteOption ?? null,
        });
        if (error) throw error;
    },

    async getOpportunitiesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_opportunities', { p_token: token });
        if (error) throw error;
        return (data as any)?.opportunities ?? [];
    },

    async getMilestonesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_milestones', { p_token: token });
        if (error) throw error;
        return (data as any)?.milestones ?? [];
    },

    async getStudyByToken(token: string, studyId: string): Promise<any> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_study', {
            p_token: token,
            p_study_id: studyId
        });
        if (error) throw error;
        return (data as any)?.study ?? null;
    },
};
