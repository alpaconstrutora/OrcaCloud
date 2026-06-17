import { supabase } from '../lib/supabase';

export interface PropertyType {
    id: string;
    organization_id: string | null;
    code: string;
    label: string;
    sort_order: number;
    is_system: boolean;
}

// Fallback usado se a tabela ainda não existir no banco
const FALLBACK_TYPES: PropertyType[] = [
    { id: 'sys-1', organization_id: null, code: 'APARTMENT', label: 'Apartamento',       sort_order: 1, is_system: true },
    { id: 'sys-2', organization_id: null, code: 'HOUSE',     label: 'Casa',               sort_order: 2, is_system: true },
    { id: 'sys-3', organization_id: null, code: 'LAND',      label: 'Terreno / Lote',     sort_order: 3, is_system: true },
    { id: 'sys-4', organization_id: null, code: 'COMMERCIAL',label: 'Comercial',          sort_order: 4, is_system: true },
    { id: 'sys-5', organization_id: null, code: 'BUILDING',  label: 'Edifício (Master)',  sort_order: 5, is_system: true },
];

export const propertyTypesService = {
    async listTypes(): Promise<PropertyType[]> {
        try {
            const { data, error } = await supabase
                .from('commercial_property_types')
                .select('*')
                .order('sort_order', { ascending: true });
            if (error) throw error;
            return (data || []) as PropertyType[];
        } catch {
            return FALLBACK_TYPES;
        }
    },

    async createType(organizationId: string, code: string, label: string, sortOrder: number): Promise<PropertyType> {
        const cleanCode = code.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        const { data, error } = await supabase
            .from('commercial_property_types')
            .insert({ organization_id: organizationId, code: cleanCode, label, sort_order: sortOrder, is_system: false })
            .select()
            .single();
        if (error) throw error;
        return data as PropertyType;
    },

    async updateType(id: string, label: string): Promise<PropertyType> {
        const { data, error } = await supabase
            .from('commercial_property_types')
            .update({ label })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as PropertyType;
    },

    async deleteType(id: string): Promise<void> {
        const { error } = await supabase
            .from('commercial_property_types')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
