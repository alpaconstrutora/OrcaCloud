import { supabase } from '../lib/supabase';
import { ContractTypeRecord } from '../types';
import { DEFAULT_CONTRACT_TYPES } from '../constants/contractTypes';

const withDefaultTypes = (types: ContractTypeRecord[], organizationId?: string): ContractTypeRecord[] => {
    const existing = new Set(types.map(t => t.name.trim().toLocaleLowerCase('pt-BR')));
    const defaults: ContractTypeRecord[] = DEFAULT_CONTRACT_TYPES
        .filter(d => !existing.has(d.name.toLocaleLowerCase('pt-BR')))
        .map(d => ({
            id: `default-${d.name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-')}`,
            name: d.name,
            category: d.category,
            organization_id: organizationId,
            active: true,
            created_at: undefined,
        }));

    return [...types, ...defaults].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export const contractTypeService = {
    async listTypes(organizationId?: string): Promise<ContractTypeRecord[]> {
        try {
            const { data, error } = await supabase
                .from('contract_types')
                .select('id, name, category, organization_id, active, created_at');

            if (error) {
                console.error('[CONTRACT TYPE SERVICE] Error listing types:', error);
                return withDefaultTypes([], organizationId);
            }

            let filtered = (data || []) as ContractTypeRecord[];
            if (organizationId) {
                filtered = filtered.filter(t => !t.organization_id || t.organization_id === organizationId);
            }
            return withDefaultTypes(filtered.filter(t => t.active !== false), organizationId);
        } catch (err) {
            console.error('[CONTRACT TYPE SERVICE] Unexpected error listing types:', err);
            return withDefaultTypes([], organizationId);
        }
    },

    async createType(type: { name: string; category: 'Serviços' | 'Suprimentos' | 'Geral'; organization_id?: string }): Promise<ContractTypeRecord> {
        if (!type.organization_id) throw new Error('Selecione uma organização ativa para gerenciar tipos de contrato.');
        const { data, error } = await supabase
            .from('contract_types')
            .insert(type)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateType(id: string, updates: Partial<Pick<ContractTypeRecord, 'name' | 'category' | 'active'>>): Promise<ContractTypeRecord> {
        const { data, error } = await supabase
            .from('contract_types')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteType(id: string): Promise<void> {
        const { error } = await supabase
            .from('contract_types')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async importDefaults(organizationId?: string): Promise<void> {
        if (!organizationId) throw new Error('Selecione uma organização ativa para importar os tipos padrão.');
        const payload = DEFAULT_CONTRACT_TYPES.map(d => ({
            name: d.name,
            category: d.category,
            organization_id: organizationId,
        }));
        const { error } = await supabase
            .from('contract_types')
            .upsert(payload, { onConflict: 'name,organization_id', ignoreDuplicates: true });
        if (error) throw error;
    },
};
