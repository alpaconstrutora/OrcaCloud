import { supabase } from '../lib/supabase';
import { PaymentAccount, CostCenter, ChartOfAccount } from '../types';

export const financialRegistryService = {
    // Payment Accounts
    async listPaymentAccounts(organizationId?: string): Promise<PaymentAccount[]> {
        let query = supabase
            .from('payment_accounts')
            .select('*');
        
        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.order('name');

        if (error) throw error;
        return data || [];
    },

    async createPaymentAccount(account: Omit<PaymentAccount, 'id' | 'created_at'>): Promise<PaymentAccount> {
        const { data, error } = await supabase
            .from('payment_accounts')
            .insert(account)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updatePaymentAccount(id: string, account: Partial<PaymentAccount>): Promise<PaymentAccount> {
        const { data, error } = await supabase
            .from('payment_accounts')
            .update(account)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deletePaymentAccount(id: string): Promise<void> {
        const { error } = await supabase
            .from('payment_accounts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Cost Centers
    async listCostCenters(organizationId?: string): Promise<CostCenter[]> {
        let query = supabase
            .from('cost_centers')
            .select('*');
        
        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.order('name');

        if (error) throw error;
        return data || [];
    },

    async createCostCenter(center: Omit<CostCenter, 'id' | 'created_at'>): Promise<CostCenter> {
        const { data, error } = await supabase
            .from('cost_centers')
            .insert(center)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateCostCenter(id: string, center: Partial<CostCenter>): Promise<CostCenter> {
        const { data, error } = await supabase
            .from('cost_centers')
            .update(center)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteCostCenter(id: string): Promise<void> {
        const { error } = await supabase
            .from('cost_centers')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async upsertCostCenters(
        organizationId: string,
        rows: { name: string; code?: string; existingId?: string }[]
    ): Promise<{ created: number; updated: number }> {
        let created = 0;
        let updated = 0;

        for (const row of rows) {
            if (row.existingId) {
                await supabase
                    .from('cost_centers')
                    .update({ name: row.name, code: row.code || null })
                    .eq('id', row.existingId);
                updated++;
            } else {
                await supabase
                    .from('cost_centers')
                    .insert({ organization_id: organizationId, name: row.name, code: row.code || null });
                created++;
            }
        }

        return { created, updated };
    },

    // Chart of Accounts
    async listChartOfAccounts(organizationId?: string): Promise<ChartOfAccount[]> {
        let query = supabase
            .from('chart_of_accounts')
            .select('*');
        
        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.order('code');

        if (error) throw error;
        return data || [];
    },

    async createChartOfAccount(account: Omit<ChartOfAccount, 'id' | 'created_at'>): Promise<ChartOfAccount> {
        const { data, error } = await supabase
            .from('chart_of_accounts')
            .insert(account)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateChartOfAccount(id: string, account: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
        const { data, error } = await supabase
            .from('chart_of_accounts')
            .update(account)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteChartOfAccount(id: string): Promise<void> {
        const { error } = await supabase
            .from('chart_of_accounts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
