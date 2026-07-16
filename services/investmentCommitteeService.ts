import { supabase } from '../lib/supabase';

export type CommitteeGate = 1 | 2 | 3 | 4 | 5 | 6;
export type CommitteeDecision = 'pendente' | 'aprovado' | 'aprovado_condicionantes' | 'reprovado' | 'devolvido' | 'suspenso' | 'arquivado';

export const COMMITTEE_GATE_LABELS: Record<CommitteeGate, string> = {
    1: 'Gate 1 — Triagem',
    2: 'Gate 2 — Viabilidade Preliminar',
    3: 'Gate 3 — Negociação',
    4: 'Gate 4 — Aquisição',
    5: 'Gate 5 — Desenvolvimento',
    6: 'Gate 6 — Lançamento',
};

export const COMMITTEE_DECISION_LABELS: Record<CommitteeDecision, string> = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    aprovado_condicionantes: 'Aprovado com condicionantes',
    reprovado: 'Reprovado',
    devolvido: 'Devolvido para revisão',
    suspenso: 'Suspenso',
    arquivado: 'Arquivado',
};

export interface CommitteeDecisionRecord {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    gate: CommitteeGate;
    decision: CommitteeDecision;
    condicionantes?: string | null;
    parecer?: string | null;
    dossie_url?: string | null;
    decided_by_email?: string | null;
    decided_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

const DECISION_COLS = 'id, organization_id, opportunity_id, gate, decision, condicionantes, parecer, dossie_url, decided_by_email, decided_at, created_at, updated_at';

export const investmentCommitteeService = {
    async listDecisions(opportunityId: string): Promise<CommitteeDecisionRecord[]> {
        const { data, error } = await supabase
            .from('investment_committee_decisions')
            .select(DECISION_COLS)
            .eq('opportunity_id', opportunityId)
            .order('gate', { ascending: true });
        if (error) throw error;
        return (data ?? []) as CommitteeDecisionRecord[];
    },

    async decideGate(record: Omit<CommitteeDecisionRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<CommitteeDecisionRecord> {
        const payload = {
            ...record,
            decided_at: record.decision === 'pendente' ? null : (record.decided_at ?? new Date().toISOString()),
            updated_at: new Date().toISOString(),
        };
        if (record.id) {
            const { data, error } = await supabase
                .from('investment_committee_decisions')
                .update(payload)
                .eq('id', record.id)
                .select(DECISION_COLS)
                .single();
            if (error) throw error;
            return data as CommitteeDecisionRecord;
        }
        // upsert por (opportunity_id, gate) — cada gate tem no máximo uma decisão vigente
        const { data, error } = await supabase
            .from('investment_committee_decisions')
            .upsert(payload, { onConflict: 'opportunity_id,gate' })
            .select(DECISION_COLS)
            .single();
        if (error) throw error;
        return data as CommitteeDecisionRecord;
    },

    /** Próximo gate liberado: o primeiro sem decisão 'aprovado'/'aprovado_condicionantes' */
    nextOpenGate(decisions: CommitteeDecisionRecord[]): CommitteeGate {
        const decidedGates = new Set(
            decisions.filter(d => d.decision === 'aprovado' || d.decision === 'aprovado_condicionantes').map(d => d.gate)
        );
        for (let g = 1; g <= 6; g++) {
            if (!decidedGates.has(g as CommitteeGate)) return g as CommitteeGate;
        }
        return 6;
    },
};
