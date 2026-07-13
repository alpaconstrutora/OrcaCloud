import { supabase } from '../lib/supabase';

export interface FinancialAlert {
    alert_type:   string;
    severity:     'HIGH' | 'MEDIUM' | 'LOW';
    title:        string;
    description:  string;
    amount:       number | null;
    project_id:   string | null;
    project_name: string | null;
    ref_id:       string | null;
}

export interface ProjectScorecard {
    project_id:        string;
    project_name:      string;
    receita_realizada: number;
    custo_realizado:   number;
    margem_pct:        number;
    ar_pendente:       number;
    ap_pendente:       number;
    saldo_projetado:   number;
    risco:             'HIGH' | 'MEDIUM' | 'OK';
}

export interface CashflowProjectionPoint {
    data_ref:    string;
    cr_previsto: number;
    db_previsto: number;
    saldo_dia:   number;
    saldo_acum:  number;
}

export const financialIntelligenceService = {

    async getAlerts(organizationId: string | null): Promise<FinancialAlert[]> {
        const { data, error } = await supabase.rpc('fn_financial_alerts', {
            p_organization_id: organizationId || null,
        });
        if (error) throw error;
        return (data || []) as FinancialAlert[];
    },

    async getProjectScorecards(organizationId: string | null): Promise<ProjectScorecard[]> {
        const { data, error } = await supabase.rpc('fn_project_scorecard', {
            p_organization_id: organizationId || null,
        });
        if (error) throw error;
        return (data || []) as ProjectScorecard[];
    },

    async getCashflowProjection(organizationId: string | null, days = 90): Promise<CashflowProjectionPoint[]> {
        const { data, error } = await supabase.rpc('fn_cashflow_projection', {
            p_organization_id: organizationId || null,
            p_days: days,
        });
        if (error) throw error;
        return (data || []) as CashflowProjectionPoint[];
    },
};
