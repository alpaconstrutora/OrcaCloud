import { supabase } from '../lib/supabase';
import { ContractGuarantee, GuaranteeKind } from '../types/contracts';

export interface ContractGuaranteeExpiring {
    guarantee_id: string;
    contract_id: string;
    contract_title: string;
    kind: GuaranteeKind;
    insurer?: string;
    valid_until: string;
    days_remaining: number;
}

export const contractGuaranteeService = {
    list: async (contractId: string): Promise<ContractGuarantee[]> => {
        const { data, error } = await supabase
            .from('contract_guarantees')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    save: async (payload: Partial<ContractGuarantee> & { organization_id: string; contract_id: string }): Promise<ContractGuarantee> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_guarantees').update(rest).eq('id', id)
            : supabase.from('contract_guarantees').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_guarantees').delete().eq('id', id);
        if (error) throw error;
    },

    /** Apólices/garantias vigentes vencendo em até N dias — alimenta o KPI do dashboard */
    listExpiring: async (organizationId: string | null, days: number = 30): Promise<ContractGuaranteeExpiring[]> => {
        const { data, error } = await supabase.rpc('fn_contract_guarantees_expiring', {
            p_organization_id: organizationId,
            p_days: days,
        });
        if (error) throw error;
        return data ?? [];
    },
};
