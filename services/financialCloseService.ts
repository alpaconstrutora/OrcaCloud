import { supabase } from '../lib/supabase';
import type { FinancialCloseChecklist, FinancialPeriodLock } from '../types/financial';

export const financialCloseService = {
    /**
     * Assistente de fechamento: pendências do mês (conciliação, classificação, tarifas).
     */
    async getChecklist(
        organizationId: string,
        year: number,
        month: number,
    ): Promise<FinancialCloseChecklist | null> {
        const { data, error } = await supabase.rpc('fn_financial_close_checklist', {
            p_organization_id: organizationId,
            p_year:            year,
            p_month:           month,
        });
        if (error) throw error;
        return (data as FinancialCloseChecklist) ?? null;
    },

    /**
     * Lista os períodos já registrados (fechados ou reabertos) da organização.
     */
    async listPeriods(organizationId: string): Promise<FinancialPeriodLock[]> {
        const { data, error } = await supabase
            .from('financial_period_locks')
            .select('id, organization_id, period_year, period_month, is_closed, notes, closed_at, closed_by, reopened_at, reopened_by, created_at, updated_at')
            .eq('organization_id', organizationId)
            .order('period_year', { ascending: false })
            .order('period_month', { ascending: false });
        if (error) throw error;
        return (data || []) as FinancialPeriodLock[];
    },

    /**
     * Verifica se o mês de uma data está bloqueado (fechado).
     */
    async isClosed(organizationId: string, date: string): Promise<boolean> {
        const { data, error } = await supabase.rpc('fn_period_is_closed', {
            p_organization_id: organizationId,
            p_date:            date,
        });
        if (error) throw error;
        return Boolean(data);
    },

    async closePeriod(
        organizationId: string,
        year: number,
        month: number,
        notes?: string,
    ): Promise<FinancialPeriodLock> {
        const { data, error } = await supabase.rpc('fn_close_period', {
            p_organization_id: organizationId,
            p_year:            year,
            p_month:           month,
            p_notes:           notes ?? null,
        });
        if (error) throw error;
        return data as FinancialPeriodLock;
    },

    async reopenPeriod(
        organizationId: string,
        year: number,
        month: number,
    ): Promise<FinancialPeriodLock> {
        const { data, error } = await supabase.rpc('fn_reopen_period', {
            p_organization_id: organizationId,
            p_year:            year,
            p_month:           month,
        });
        if (error) throw error;
        return data as FinancialPeriodLock;
    },
};
