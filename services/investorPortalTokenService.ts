import { supabase } from '../lib/supabase';
import type { InterestRole } from './investorPortalService';

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

export interface SubmitInvestorPortalInterestPayload {
    opportunityId: string;
    name: string;
    email?: string;
    phone?: string;
    role?: InterestRole;
    message?: string;
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

    /**
     * SPEs em que o investidor do token é sócio, com a participação DELE.
     * Devolve [] (em vez de estourar) quando a RPC ainda não foi aplicada no
     * banco — a aba mostra estado vazio em vez de derrubar o portal.
     */
    async getSpesByToken(token: string): Promise<any[]> {
        const { data, error } = await supabase.rpc('fn_investor_portal_get_spes', { p_token: token });
        if (error) {
            // PGRST202 = função inexistente no schema exposto
            if (error.code === 'PGRST202' || /not find the function/i.test(error.message ?? '')) {
                console.warn('fn_investor_portal_get_spes ausente — aba SPE ficará vazia até a migration ser aplicada.');
                return [];
            }
            throw error;
        }
        return (data as any)?.spes ?? [];
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

    async submitInterestByToken(token: string, payload: SubmitInvestorPortalInterestPayload): Promise<string> {
        const { data, error } = await supabase.rpc('fn_investor_portal_submit_interest', {
            p_token: token,
            p_opportunity_id: payload.opportunityId,
            p_name: payload.name,
            p_email: payload.email ?? null,
            p_phone: payload.phone ?? null,
            p_role: payload.role ?? 'investidor',
            p_message: payload.message ?? null,
        });
        if (error) throw error;
        if (!data || !(data as any).valid) {
            throw new Error((data as any)?.error ?? 'Erro ao registrar interesse');
        }

        const interestId = (data as any).id as string;
        const organizationId = (data as any).organization_id as string;

        supabase.functions.invoke('notify-opportunity-interest', {
            body: {
                interestId,
                opportunityId: payload.opportunityId,
                organizationId,
            },
        }).catch(() => {/* notificacao nao bloqueia o fluxo */});

        return interestId;
    },
};
