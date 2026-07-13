import { supabase } from '../lib/supabase';
import type { FinancialKPIs, FinancialTopSupplier, DREProjectSummary } from '../types/financial';

export const financialOverviewService = {

    async getKPIs(
        organizationId: string | null,
        dateFrom: string,
        dateTo: string,
        projectId?: string,
    ): Promise<FinancialKPIs> {
        const { data, error } = await supabase.rpc('fn_financial_kpis', {
            p_organization_id: organizationId || null,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
            p_project_id:      projectId ?? null,
        });
        if (error) throw error;
        const row = (data as FinancialKPIs[])?.[0];
        return row ?? {
            a_pagar: 0, pago: 0, a_receber: 0, recebido: 0,
            resultado_periodo: 0, boletos_vencidos_count: 0, boletos_vencidos_valor: 0,
        };
    },

    async getTopSuppliers(
        organizationId: string | null,
        dateFrom: string,
        dateTo: string,
        limit = 10,
    ): Promise<FinancialTopSupplier[]> {
        const { data, error } = await supabase.rpc('fn_top_suppliers_ap', {
            p_organization_id: organizationId || null,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
            p_limit:           limit,
        });
        if (error) throw error;
        return (data || []) as FinancialTopSupplier[];
    },

    async getTopProjects(
        organizationId: string | null,
        dateFrom: string,
        dateTo: string,
    ): Promise<DREProjectSummary[]> {
        const { data, error } = await supabase.rpc('fn_dre_projects_summary', {
            p_organization_id: organizationId || null,
            p_date_from:       dateFrom,
            p_date_to:         dateTo,
        });
        if (error) throw error;
        return ((data || []) as Omit<DREProjectSummary, 'margem_pct'>[]).map(r => ({
            ...r,
            margem_pct: r.receita ? (r.margem / r.receita * 100) : null,
        }));
    },
};
