import { supabase } from '../lib/supabase';

export interface ContractScopeTemplate {
    id: string;
    organization_id: string;
    name: string;
    content: string;
    created_at?: string;
    updated_at?: string;
}

const list = async (orgId: string): Promise<ContractScopeTemplate[]> => {
    const { data, error } = await supabase
        .from('contract_scope_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');
    if (error) throw error;
    return data ?? [];
};

const create = async (scope: Omit<ContractScopeTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ContractScopeTemplate> => {
    const { data, error } = await supabase.from('contract_scope_templates').insert(scope).select().single();
    if (error) throw error;
    return data;
};

const update = async (id: string, updates: Pick<ContractScopeTemplate, 'name' | 'content'>): Promise<ContractScopeTemplate> => {
    const { data, error } = await supabase
        .from('contract_scope_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};

const remove = async (id: string): Promise<void> => {
    const { error } = await supabase.from('contract_scope_templates').delete().eq('id', id);
    if (error) throw error;
};

const duplicate = async (id: string): Promise<ContractScopeTemplate> => {
    const { data: orig, error: fetchErr } = await supabase
        .from('contract_scope_templates')
        .select('*')
        .eq('id', id)
        .single();
    if (fetchErr) throw fetchErr;
    const { data, error } = await supabase
        .from('contract_scope_templates')
        .insert({ organization_id: orig.organization_id, name: `${orig.name} (cópia)`, content: orig.content })
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const contractScopeService = { list, create, update, remove, duplicate };
