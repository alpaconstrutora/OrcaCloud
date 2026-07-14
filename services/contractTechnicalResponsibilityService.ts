import { supabase } from '../lib/supabase';
import { ContractTechnicalResponsibility, ContractTechnicalGateItem } from '../types/contracts';

export const contractTechnicalResponsibilityService = {
    list: async (contractId: string): Promise<ContractTechnicalResponsibility[]> => {
        const { data, error } = await supabase
            .from('contract_technical_responsibilities')
            .select('*')
            .eq('contract_id', contractId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    save: async (payload: Partial<ContractTechnicalResponsibility> & { organization_id: string; contract_id: string; professional_name: string; art_type: ContractTechnicalResponsibility['art_type'] }): Promise<ContractTechnicalResponsibility> => {
        const { id, ...rest } = payload;
        const query = id
            ? supabase.from('contract_technical_responsibilities').update(rest).eq('id', id)
            : supabase.from('contract_technical_responsibilities').insert(rest);
        const { data, error } = await query.select().single();
        if (error) throw error;
        return data;
    },

    remove: async (id: string): Promise<void> => {
        const { error } = await supabase.from('contract_technical_responsibilities').delete().eq('id', id);
        if (error) throw error;
    },

    /** ART/RRT/TRT inválida ou vencida — usado no gate de pagamento (Cl.10.2) */
    getGate: async (contractId: string): Promise<ContractTechnicalGateItem[]> => {
        const { data, error } = await supabase.rpc('fn_contract_technical_gate', { p_contract_id: contractId });
        if (error) throw error;
        return data ?? [];
    },
};
