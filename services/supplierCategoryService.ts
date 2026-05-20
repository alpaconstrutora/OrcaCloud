import { supabase } from '../lib/supabase';
import { SupplierCategory } from '../types';

// Helper to generate a unique ID for fallback
const generateId = () => Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);

export const supplierCategoryService = {
    async listCategories(organizationId?: string): Promise<SupplierCategory[]> {
        const { data, error } = await supabase
            .from('supplier_categories')
            .select('*');
        
        if (error) {
            // Error 42P01 is "undefined_table"
            if (error.code === '42P01') {
                // Return categories from organizations.resources
                const { data: orgs } = await supabase
                    .from('organizations')
                    .select('id, resources');
                
                let allCats: SupplierCategory[] = [];
                for (const org of (orgs || [])) {
                    const resources = org.resources as { supplierCategories?: SupplierCategory[] } | null;
                    const cats: SupplierCategory[] = resources?.supplierCategories || [];
                    if (organizationId) {
                        if (org.id === organizationId) allCats = [...allCats, ...cats];
                    } else {
                        allCats = [...allCats, ...cats];
                    }
                }
                return allCats.sort((a, b) => a.name.localeCompare(b.name));
            }
            console.error('[SUPPLIER CATEGORY SERVICE] Error listing categories:', error);
            return [];
        }

        let filtered = data || [];
        if (organizationId) {
            filtered = filtered.filter((c) => !c.organization_id || c.organization_id === organizationId);
        }
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    },

    async createCategory(category: Omit<SupplierCategory, 'id' | 'created_at'>): Promise<SupplierCategory> {
        const { data, error } = await supabase
            .from('supplier_categories')
            .insert(category)
            .select()
            .single();

        if (error) {
            if (error.code === '42P01') {
                // If no organization_id is provided, try to find the first one
                let targetOrgId = category.organization_id;
                if (!targetOrgId) {
                    const { data: firstOrg } = await supabase.from('organizations').select('id').limit(1).single();
                    targetOrgId = firstOrg?.id;
                }

                if (!targetOrgId) throw new Error("Selecione uma organização ativa para gerenciar categorias.");

                const { data: org } = await supabase
                    .from('organizations')
                    .select('resources')
                    .eq('id', targetOrgId)
                    .single();
                
                const resources = (org?.resources as { supplierCategories?: SupplierCategory[] } | null) ?? {};
                const currentCategories: SupplierCategory[] = (resources as { supplierCategories?: SupplierCategory[] }).supplierCategories || [];
                const newCategory = {
                    ...category,
                    id: generateId(),
                    created_at: new Date().toISOString(),
                    organization_id: targetOrgId
                };
                
                await supabase
                    .from('organizations')
                    .update({
                        resources: {
                            ...resources,
                            supplierCategories: [...currentCategories, newCategory]
                        }
                    })
                    .eq('id', targetOrgId);
                
                return newCategory;
            }
            throw error;
        }
        return data;
    },

    async createCategories(categories: Omit<SupplierCategory, 'id' | 'created_at'>[]): Promise<SupplierCategory[]> {
        const { data, error } = await supabase
            .from('supplier_categories')
            .insert(categories)
            .select();

        if (error) {
            if (error.code === '42P01') {
                let targetOrgId = categories.length > 0 ? categories[0].organization_id : null;
                if (!targetOrgId) {
                    const { data: firstOrg } = await supabase.from('organizations').select('id').limit(1).single();
                    targetOrgId = firstOrg?.id;
                }

                if (!targetOrgId) throw new Error("Selecione uma organização ativa para gerenciar categorias.");

                const { data: org } = await supabase
                    .from('organizations')
                    .select('resources')
                    .eq('id', targetOrgId)
                    .single();
                
                const resources = (org?.resources as { supplierCategories?: SupplierCategory[] } | null) ?? {};
                const currentCategories: SupplierCategory[] = (resources as { supplierCategories?: SupplierCategory[] }).supplierCategories || [];
                const newCats = categories.map(c => ({
                    ...c,
                    id: generateId(),
                    created_at: new Date().toISOString(),
                    organization_id: targetOrgId
                }));

                await supabase
                    .from('organizations')
                    .update({
                        resources: {
                            ...resources,
                            supplierCategories: [...currentCategories, ...newCats]
                        }
                    })
                    .eq('id', targetOrgId);
                
                return newCats;
            }
            throw error;
        }
        return data || [];
    },

    async updateCategory(id: string, updates: Partial<SupplierCategory>, organizationId?: string): Promise<SupplierCategory> {
        const { data, error } = await supabase
            .from('supplier_categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '42P01') {
                const { data: orgs } = await supabase
                    .from('organizations')
                    .select('id, resources');
                
                for (const org of (orgs || [])) {
                    if (organizationId && org.id !== organizationId) continue;

                    const resources = org.resources as { supplierCategories?: SupplierCategory[] } | null;
                    const cats: SupplierCategory[] = resources?.supplierCategories || [];
                    const index = cats.findIndex((c) => c.id === id);
                    if (index !== -1) {
                        cats[index] = { ...cats[index], ...updates };
                        await supabase
                            .from('organizations')
                            .update({
                                resources: {
                                    ...resources,
                                    supplierCategories: cats
                                }
                            })
                            .eq('id', org.id);
                        return cats[index];
                    }
                }
            }
            throw error;
        }
        return data;
    },

    async deleteCategory(id: string, organizationId?: string): Promise<void> {
        const { error } = await supabase
            .from('supplier_categories')
            .delete()
            .eq('id', id);

        if (error) {
            if (error.code === '42P01') {
                const { data: orgs } = await supabase
                    .from('organizations')
                    .select('id, resources');
                
                for (const org of (orgs || [])) {
                    if (organizationId && org.id !== organizationId) continue;

                    const resources = org.resources as { supplierCategories?: SupplierCategory[] } | null;
                    const cats: SupplierCategory[] = resources?.supplierCategories || [];
                    const index = cats.findIndex((c) => c.id === id);
                    if (index !== -1) {
                        const newCats = cats.filter((c) => c.id !== id);
                        await supabase
                            .from('organizations')
                            .update({
                                resources: {
                                    ...resources,
                                    supplierCategories: newCats
                                }
                            })
                            .eq('id', org.id);
                        return;
                    }
                }
            }
            throw error;
        }
    }
};
