import { supabase } from '../lib/supabase';
import { ClientCategory } from '../types';
import { DEFAULT_CLIENT_CATEGORIES } from '../constants/clientCategories';

const withDefaultCategories = (categories: ClientCategory[], organizationId?: string): ClientCategory[] => {
    const existing = new Set(categories.map(c => c.name.trim().toLocaleLowerCase('pt-BR')));
    const defaults: ClientCategory[] = DEFAULT_CLIENT_CATEGORIES
        .filter(name => !existing.has(name.toLocaleLowerCase('pt-BR')))
        .map(name => ({
            id: `default-${name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-')}`,
            name,
            organization_id: organizationId,
        }));

    return [...categories, ...defaults].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export const clientCategoryService = {
    async list(organizationId?: string): Promise<ClientCategory[]> {
        let query = supabase
            .from('client_categories')
            .select('*')
            .order('name');

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[clientCategoryService.list] Erro:', error);
            throw new Error(`Erro ao listar categorias: ${error.message}`);
        }

        return withDefaultCategories(data || [], organizationId);
    },

    async create(organizationId: string, name: string): Promise<ClientCategory> {
        const { data, error } = await supabase
            .from('client_categories')
            .insert({ organization_id: organizationId, name })
            .select('*')
            .single();

        if (error) {
            console.error('[clientCategoryService.create] Erro:', error);
            throw new Error(`Erro ao criar categoria: ${error.message}`);
        }

        return data;
    },

    async update(id: string, name: string): Promise<ClientCategory> {
        const { data, error } = await supabase
            .from('client_categories')
            .update({ name })
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            console.error('[clientCategoryService.update] Erro:', error);
            throw new Error(`Erro ao atualizar categoria: ${error.message}`);
        }

        return data;
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('client_categories')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[clientCategoryService.delete] Erro:', error);
            throw new Error(`Erro ao excluir categoria: ${error.message}`);
        }
    },

    async importDefaults(organizationId?: string): Promise<void> {
        if (!organizationId) throw new Error('Selecione uma organização ativa para importar as categorias padrão.');

        const { data: existing, error: readError } = await supabase
            .from('client_categories')
            .select('name')
            .eq('organization_id', organizationId);
        if (readError) throw readError;

        const existingNames = new Set((existing || []).map(c => c.name.trim().toLocaleLowerCase('pt-BR')));
        const payload = DEFAULT_CLIENT_CATEGORIES
            .filter(name => !existingNames.has(name.toLocaleLowerCase('pt-BR')))
            .map(name => ({ name, organization_id: organizationId }));

        if (payload.length === 0) return;

        const { error } = await supabase.from('client_categories').insert(payload);
        if (error) throw error;
    },
};
