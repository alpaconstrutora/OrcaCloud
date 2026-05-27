import { supabase } from '../lib/supabase';
import { Company, CompanyInsert, CompanyUpdate } from '../types';

export const companyService = {
    async list(orgId: string): Promise<Company[]> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('org_id', orgId)
            .order('is_headquarters', { ascending: false })
            .order('razao_social');
        if (error) throw error;
        return data as Company[];
    },

    async get(id: string): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Company;
    },

    async create(payload: CompanyInsert): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data as Company;
    },

    async update(id: string, payload: CompanyUpdate): Promise<Company> {
        const { data, error } = await supabase
            .from('companies')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as Company;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
