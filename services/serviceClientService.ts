import { supabase } from '../lib/supabase';

export interface ServiceClient {
    id: string;
    organization_id: string;
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;
    contact_name?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

const listServiceClients = async (orgId?: string): Promise<ServiceClient[]> => {
    let q = supabase.from('service_clients').select('id, organization_id, name, document, email, phone, address, contact_name, notes, created_at, updated_at').order('name');
    if (orgId) q = q.eq('organization_id', orgId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
};

const getById = async (id: string): Promise<ServiceClient | null> => {
    const { data } = await supabase.from('service_clients').select('id, organization_id, name, document, email, phone, address, contact_name, notes, created_at, updated_at').eq('id', id).maybeSingle();
    return data;
};

const createServiceClient = async (sc: Omit<ServiceClient, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceClient> => {
    const { data, error } = await supabase.from('service_clients').insert(sc).select().single();
    if (error) throw error;
    return data;
};

const updateServiceClient = async (id: string, updates: Partial<ServiceClient>): Promise<ServiceClient> => {
    const { data, error } = await supabase
        .from('service_clients')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};

const deleteServiceClient = async (id: string): Promise<void> => {
    const { error } = await supabase.from('service_clients').delete().eq('id', id);
    if (error) throw error;
};

export const serviceClientService = {
    listServiceClients, getById, createServiceClient, updateServiceClient, deleteServiceClient
};
