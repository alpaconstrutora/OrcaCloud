import { supabase } from '../lib/supabase';
import { Supplier } from '../types';
import { isRealEstateBrokerCategory, REAL_ESTATE_BROKER_CATEGORY } from '../constants/supplierCategories';

const SUPPLIER_SELECT = 'id, name, contact_name, email, phone, document, type, category, address, street, number, neighborhood, city, state, zip_code, organization_id, created_at';
const SUPPLIER_LIST_SELECT = 'id, name, contact_name, email, phone, document, type, category, city, state, organization_id, created_at, organizations:organization_id(name)';

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

async function syncRealEstateBrokerProfile(supplier: Partial<Supplier>): Promise<void> {
    const email = normalizeEmail(supplier.email);
    const organizationId = supplier.organization_id || null;

    if (!email || !organizationId) return;

    if (!isRealEstateBrokerCategory(supplier.category)) {
        await supabase
            .from('broker_profiles')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId)
            .eq('email', email);
        return;
    }

    const profile = {
        organization_id: organizationId,
        email,
        name: supplier.contact_name || supplier.name || email,
        phone: supplier.phone || null,
        cpf: supplier.type === 'PF' ? supplier.document || null : null,
        agency_name: supplier.type === 'PJ' ? supplier.name || null : null,
        commission_rate: 5,
        is_active: true,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('broker_profiles')
        .upsert(profile, { onConflict: 'organization_id,email' });

    if (error) {
        console.error('[SUPPLIER SERVICE] Error syncing supplier broker profile:', error);
        throw error;
    }
}

export const supplierService = {
    listSuppliers: async (organizationId?: string): Promise<(Supplier & { organization_name?: string })[]> => {
        let query = supabase
            .from('suppliers')
            .select(SUPPLIER_LIST_SELECT)
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

    listRealEstateBrokers: async (organizationId?: string): Promise<Supplier[]> => {
        let query = supabase
            .from('suppliers')
            .select(SUPPLIER_SELECT)
            .ilike('category', REAL_ESTATE_BROKER_CATEGORY)
            .order('name', { ascending: true });

        if (organizationId) {
            query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as Supplier[];
    },

    syncRealEstateBrokerProfiles: async (organizationId?: string): Promise<void> => {
        const brokers = await supplierService.listRealEstateBrokers(organizationId);
        await Promise.all(
            brokers
                .filter(supplier => supplier.organization_id && supplier.email)
                .map(syncRealEstateBrokerProfile)
        );
    },

    getByEmail: async (email: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select(SUPPLIER_SELECT)
                .eq('email', email.toLowerCase())
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error('[SUPPLIER SERVICE] Error fetching supplier by email:', error instanceof Error ? error.message : error);
            return null;
        }
    },

    getById: async (id: string): Promise<Supplier | null> => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select(SUPPLIER_SELECT)
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data as Supplier;
        } catch (error: unknown) {
            console.error('[SUPPLIER SERVICE] Error fetching supplier by id:', error instanceof Error ? error.message : error);
            return null;
        }
    },

    addSupplier: async (supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> => {
        const payload = {
            ...supplier,
            email: normalizeEmail(supplier.email) || null,
        };

        const { data, error } = await supabase
            .from('suppliers')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        await syncRealEstateBrokerProfile(data as Supplier);
        return data as Supplier;
    },

    updateSupplier: async (id: string, updates: Partial<Supplier>): Promise<Supplier> => {
        const payload = {
            ...updates,
            ...(updates.email !== undefined ? { email: normalizeEmail(updates.email) || null } : {}),
        };

        const { data, error } = await supabase
            .from('suppliers')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        await syncRealEstateBrokerProfile(data as Supplier);
        return data as Supplier;
    },

    deleteSupplier: async (id: string): Promise<void> => {
        const existing = await supplierService.getById(id);

        const { error } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (existing?.organization_id && existing.email && isRealEstateBrokerCategory(existing.category)) {
            await supabase
                .from('broker_profiles')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('organization_id', existing.organization_id)
                .eq('email', normalizeEmail(existing.email));
        }
    }
};