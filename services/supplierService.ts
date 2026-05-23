import { supabase } from '../lib/supabase';
import { Supplier } from '../types';

export const supplierService = {
    listSuppliers: async (organizationId?: string): Promise<(Supplier & { organization_name?: string })[]> => {
        let query = supabase
            .from('suppliers')
            .select(`
                *,
                organizations:organization_id(name)
            `)
            .order('name', { ascending: true });

        if (organizationId) {
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data as any[])?.map(supplier => {
            let orgName = 'Todas as Organizações';
            if (supplier.organization_id && supplier.organizations?.name) {
                orgName = supplier.organizations.name;
            }
            return {
                ...supplier,
                organization_name: orgName
            };
        }) || [];
    },

    getByEmail: async (email: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .eq('email', email.toLowerCase())
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error("[SUPPLIER SERVICE] Error fetching supplier by email:", error instanceof Error ? error.message : error);
            return null;
        }
    },

    getById: async (id: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error("[SUPPLIER SERVICE] Error fetching supplier by id:", error instanceof Error ? error.message : error);
            return null;
        }
    },

    addSupplier: async (supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> => {
        const { data, error } = await supabase
            .from('suppliers')
            .insert(supplier)
            .select()
            .single();

        if (error) throw error;
        return data as Supplier;
    },

    updateSupplier: async (id: string, updates: Partial<Supplier>): Promise<Supplier> => {
        const { data, error } = await supabase
            .from('suppliers')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Supplier;
    },

    deleteSupplier: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
