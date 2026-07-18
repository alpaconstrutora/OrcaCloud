import { supabase } from '../lib/supabase';
import { ClientCategory } from '../types';

export const clientCategoryService = {
    async list(organizationId?: string): Promise<ClientCategory[]> {
        let query = supabase
            .from('client_categories')
            .select('*')
            .order('name');

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        let { data, error } = await query;

        if (error) {
            console.error('[clientCategoryService.list] Erro:', error);
            throw new Error(`Erro ao listar categorias: ${error.message}`);
        }

        // Auto-popular defaults só quando há uma organização específica selecionada
        // (sem organizationId — "Todas as organizações" — não há para qual organização inserir)
        if (organizationId && (!data || data.length === 0)) {
            const defaults = [
                { name: 'Vendas', organization_id: organizationId },
                { name: 'Locação', organization_id: organizationId },
                { name: 'Serviços', organization_id: organizationId },
                { name: 'Condomínio', organization_id: organizationId },
            ];

            const { data: inserted, error: insertError } = await supabase
                .from('client_categories')
                .insert(defaults)
                .select('*')
                .order('name');

            if (insertError) {
                console.error('[clientCategoryService.list] Erro ao auto-popular defaults:', insertError);
                // Se falhar a inserção (ex: falta de permissão ou offline), retornamos os defaults virtualmente
                return defaults.map((d, i) => ({ id: `temp-${i}`, ...d }));
            }
            return inserted || [];
        }

        return data || [];
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
    }
};
