import { supabase } from '../lib/supabase';

export type ContributionType = 'aporte' | 'retirada' | 'dividendo' | 'distribuicao';
export type ContributionStatus = 'pendente' | 'liquidado' | 'atrasado';

export interface InvestorContribution {
    id?: string;
    organization_id: string;
    project_id: string;
    investor_id: string;
    type: ContributionType;
    amount: number;
    due_date?: string | null;
    paid_date?: string | null;
    status: ContributionStatus;
    description?: string;
    payment_method?: string;
    receipt_url?: string;
    created_at?: string;
}

export interface InvestorParticipation {
    id?: string;
    organization_id: string;
    project_id: string;
    investor_id: string;
    ownership_pct: number;
    committed_amount: number;
    quota_count: number;
    created_at?: string;
}

export interface InvestorFinancialSummary {
    totalContributed: number;   // aportes liquidados
    totalWithdrawn: number;     // retiradas + distribuições liquidadas
    totalDividends: number;     // dividendos liquidados
    pendingAmount: number;      // aportes pendentes/atrasados
    nextDue?: InvestorContribution;
    ownershipPct: number;
    committedAmount: number;
    /** ROI realizado = (dividendos + valorização) / aporte total. valorização passada pelo caller. */
    roiRealized: (currentValue: number) => number;
}

const CONTRIB_COLS = 'id, organization_id, project_id, investor_id, type, amount, due_date, paid_date, status, description, payment_method, receipt_url, created_at';
const PART_COLS = 'id, organization_id, project_id, investor_id, ownership_pct, committed_amount, quota_count, created_at';

export const investorContributionsService = {
    // ─── Contributions ────────────────────────────────────────────────────────

    async listContributions(projectId: string, investorId?: string): Promise<InvestorContribution[]> {
        let query = supabase
            .from('investor_contributions')
            .select(CONTRIB_COLS)
            .eq('project_id', projectId)
            .order('due_date', { ascending: true });

        if (investorId) query = query.eq('investor_id', investorId);

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as InvestorContribution[];
    },

    /** Lista contribuições de um investidor em toda a organização (visão de portfólio). */
    async listByInvestor(organizationId: string | null, investorId?: string): Promise<InvestorContribution[]> {
        let query = supabase
            .from('investor_contributions')
            .select(CONTRIB_COLS)
            .order('due_date', { ascending: true });

        if (organizationId) query = query.eq('organization_id', organizationId);
        if (investorId) query = query.eq('investor_id', investorId);

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as InvestorContribution[];
    },

    async saveContribution(c: InvestorContribution): Promise<InvestorContribution> {
        if (c.id) {
            const { data, error } = await supabase
                .from('investor_contributions')
                .update(c)
                .eq('id', c.id)
                .select(CONTRIB_COLS)
                .single();
            if (error) throw error;
            return data as InvestorContribution;
        }
        const { data, error } = await supabase
            .from('investor_contributions')
            .insert(c)
            .select(CONTRIB_COLS)
            .single();
        if (error) throw error;
        return data as InvestorContribution;
    },

    async deleteContribution(id: string): Promise<void> {
        const { error } = await supabase.from('investor_contributions').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── Participations ───────────────────────────────────────────────────────

    async getParticipation(projectId: string, investorId: string): Promise<InvestorParticipation | null> {
        const { data, error } = await supabase
            .from('investor_participations')
            .select(PART_COLS)
            .eq('project_id', projectId)
            .eq('investor_id', investorId)
            .maybeSingle();
        if (error) throw error;
        return data as InvestorParticipation | null;
    },

    async listParticipations(projectId: string): Promise<InvestorParticipation[]> {
        const { data, error } = await supabase
            .from('investor_participations')
            .select(PART_COLS)
            .eq('project_id', projectId)
            .order('ownership_pct', { ascending: false });
        if (error) throw error;
        return (data ?? []) as InvestorParticipation[];
    },

    /** Todas as participações de um investidor (visão de portfólio). */
    async listParticipationsByInvestor(investorId: string): Promise<InvestorParticipation[]> {
        const { data, error } = await supabase
            .from('investor_participations')
            .select(PART_COLS)
            .eq('investor_id', investorId);
        if (error) throw error;
        return (data ?? []) as InvestorParticipation[];
    },

    async saveParticipation(p: InvestorParticipation): Promise<InvestorParticipation> {
        if (p.id) {
            const { data, error } = await supabase
                .from('investor_participations')
                .update(p)
                .eq('id', p.id)
                .select(PART_COLS)
                .single();
            if (error) throw error;
            return data as InvestorParticipation;
        }
        const { data, error } = await supabase
            .from('investor_participations')
            .insert(p)
            .select(PART_COLS)
            .single();
        if (error) throw error;
        return data as InvestorParticipation;
    },

    // ─── Aggregated summary + ROI ──────────────────────────────────────────────

    async getInvestorSummary(projectId: string, investorId: string): Promise<InvestorFinancialSummary> {
        const [contributions, participation] = await Promise.all([
            this.listContributions(projectId, investorId),
            this.getParticipation(projectId, investorId),
        ]);

        const sumBy = (type: ContributionType, status?: ContributionStatus) =>
            contributions
                .filter(c => c.type === type && (status ? c.status === status : true))
                .reduce((acc, c) => acc + Number(c.amount), 0);

        const totalContributed = sumBy('aporte', 'liquidado');
        const totalDividends = sumBy('dividendo', 'liquidado');
        const totalWithdrawn = sumBy('retirada', 'liquidado') + sumBy('distribuicao', 'liquidado');

        const pendingAmount = contributions
            .filter(c => c.type === 'aporte' && (c.status === 'pendente' || c.status === 'atrasado'))
            .reduce((acc, c) => acc + Number(c.amount), 0);

        const nextDue = contributions
            .filter(c => c.status === 'pendente' && c.due_date)
            .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];

        return {
            totalContributed,
            totalWithdrawn,
            totalDividends,
            pendingAmount,
            nextDue,
            ownershipPct: participation?.ownership_pct ?? 0,
            committedAmount: participation?.committed_amount ?? 0,
            roiRealized: (currentValue: number) => {
                if (totalContributed <= 0) return 0;
                const appreciation = currentValue - totalContributed;
                return ((totalDividends + appreciation) / totalContributed) * 100;
            },
        };
    },
};
