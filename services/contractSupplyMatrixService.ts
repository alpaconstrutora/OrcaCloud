import { supabase } from '../lib/supabase';
import { ContractSupplyMatrixItem, ContractInterface } from '../types/contracts';

export const contractSupplyMatrixService = {
    listItems: async (contractId: string): Promise<ContractSupplyMatrixItem[]> => {
        const { data, error } = await supabase
            .from('contract_supply_matrix')
            .select('*')
            .eq('contract_id', contractId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },

    saveItem: async (payload: Partial<ContractSupplyMatrixItem> & { organization_id: string; contract_id: string; item: string }): Promise<ContractSupplyMatrixItem> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_supply_matrix').update(rest).eq('id', id)
            : supabase.from('contract_supply_matrix').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    removeItem: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_supply_matrix').delete().eq('id', id);
        if (error) throw error;
    },

    listInterfaces: async (contractId: string): Promise<ContractInterface[]> => {
        const { data, error } = await supabase
            .from('contract_interfaces')
            .select('*')
            .eq('contract_id', contractId)
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data ?? [];
    },

    saveInterface: async (payload: Partial<ContractInterface> & { organization_id: string; contract_id: string; interface_event: string }): Promise<ContractInterface> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_interfaces').update(rest).eq('id', id)
            : supabase.from('contract_interfaces').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    removeInterface: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_interfaces').delete().eq('id', id);
        if (error) throw error;
    },
};
