import { supabase } from '../lib/supabase';
import { PaymentAccount, CostCenter, ChartOfAccount } from '../types';

export const financialRegistryService = {
    // Payment Accounts
    async listPaymentAccounts(organizationId?: string, empresaId?: string): Promise<PaymentAccount[]> {
        let query = supabase
            .from('payment_accounts')
            .select('id, code, organization_id, empresa_id, name, description, bank, branch, account_number, created_at');

        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.order('name');

        if (error) throw error;
        return data || [];
    },

    async createPaymentAccount(account: Omit<PaymentAccount, 'id' | 'created_at'>): Promise<PaymentAccount> {
        const payload: Record<string, unknown> = { ...account };
        // Código sequencial 001/002/003... único por organização (§ui_ux_standard_guide.md).
        if (!payload.code) {
            const { data: nextCode } = await supabase.rpc('get_next_payment_account_code', { p_org_id: account.organization_id });
            if (nextCode) payload.code = nextCode;
        }
        const { data, error } = await supabase
            .from('payment_accounts')
            .insert(payload)
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
    async listCostCenters(organizationId?: string, empresaId?: string): Promise<CostCenter[]> {
        let query = supabase
            .from('cost_centers')
            .select('id, organization_id, empresa_id, name, code, created_at');

        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
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

    // Categorias Financeiras (substitui chart_of_accounts — aposentado em jun/2026)
    // Os parâmetros organizationId/empresaId são ignorados; financial_categories é global.
    async listChartOfAccounts(_organizationId?: string, _empresaId?: string): Promise<ChartOfAccount[]> {
        const { data, error } = await supabase
            .from('financial_categories')
            .select('id, name, parent_id, dre_group, nature, accounting_nature, sort_order')
            .order('sort_order', { ascending: true, nullsFirst: false });

        if (error) throw error;
        return (data || []) as ChartOfAccount[];
    },

    async createChartOfAccount(account: Omit<ChartOfAccount, 'id' | 'created_at'>): Promise<ChartOfAccount> {
        const { data, error } = await supabase
            .from('financial_categories')
            .insert({ name: account.name, parent_id: account.parent_id ?? null, accounting_nature: account.accounting_nature ?? null })
            .select('id, name, parent_id, dre_group, nature, accounting_nature, sort_order')
            .single();

        if (error) throw error;
        return data as ChartOfAccount;
    },

    // Fonte única para quick-add de categoria a partir de qualquer tela
    // (ex: conciliação bancária). Evita duplicata por nome (case-insensitive).
    async getOrCreateChartOfAccountByName(name: string): Promise<ChartOfAccount> {
        const trimmed = name.trim();
        const { data: existing, error: findError } = await supabase
            .from('financial_categories')
            .select('id, name, parent_id, dre_group, nature, accounting_nature, sort_order')
            .ilike('name', trimmed)
            .maybeSingle();

        if (findError) throw findError;
        if (existing) return existing as ChartOfAccount;

        return financialRegistryService.createChartOfAccount({ name: trimmed });
    },

    async updateChartOfAccount(id: string, account: Partial<ChartOfAccount>): Promise<ChartOfAccount> {
        const payload: Record<string, unknown> = {};
        if (account.name              !== undefined) payload.name              = account.name;
        if (account.parent_id         !== undefined) payload.parent_id         = account.parent_id;
        if (account.dre_group         !== undefined) payload.dre_group         = account.dre_group;
        if (account.nature            !== undefined) payload.nature            = account.nature;
        if (account.accounting_nature !== undefined) payload.accounting_nature = account.accounting_nature;
        if (account.sort_order        !== undefined) payload.sort_order        = account.sort_order;

        const { data, error } = await supabase
            .from('financial_categories')
            .update(payload)
            .eq('id', id)
            .select('id, name, parent_id, dre_group, nature, accounting_nature, sort_order')
            .single();

        if (error) throw error;
        return data as ChartOfAccount;
    },

    async deleteChartOfAccount(id: string): Promise<void> {
        const { error } = await supabase
            .from('financial_categories')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
