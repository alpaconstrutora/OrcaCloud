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

    // Cost Centers — fonte de verdade agora é cost_centers_v2 (módulo dedicado
    // "Centro de Custo" em Minha Organização, ver components/CostCenterModule.tsx
    // e services/costCenterService.ts). Este método continua sendo o ponto único
    // consumido por Boletos/Contratos/Conciliação Bancária (BoletoFormModal,
    // BoletoLoteModal, BoletoEdicaoEmLoteModal, BankTxEdicaoEmLoteModal,
    // BankReconciliation, DivergencesPanel, ContractModal) — repontar aqui basta
    // para reconectar todos eles, sem editar cada tela. Retorna no formato
    // CostCenter (flat) para não quebrar esses consumidores; grupo/subgrupo vira
    // "Grupo > Subgrupo" no name.
    async listCostCenters(organizationId?: string, empresaId?: string): Promise<CostCenter[]> {
        let query = supabase
            .from('cost_centers_v2')
            .select('id, organization_id, empresa_id, parent_id, name, code, created_at');

        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.order('code');

        if (error) throw error;

        type Row = { id: string; organization_id: string; empresa_id?: string; parent_id?: string | null; name: string; code: string; created_at?: string };
        const rows = (data || []) as Row[];
        const byId = new Map(rows.map(r => [r.id, r]));

        return rows.map(r => ({
            id: r.id,
            organization_id: r.organization_id,
            empresa_id: r.empresa_id,
            code: r.code,
            name: r.parent_id ? `${byId.get(r.parent_id)?.name ?? ''} > ${r.name}` : r.name,
            created_at: r.created_at,
        }));
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
