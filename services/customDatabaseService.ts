import { supabase } from '../lib/supabase';
import { SinapiItem, CustomDatabase } from '../types';

export const customDatabaseService = {
    // --- Database Management ---

    async listDatabases() {
        const { data, error } = await supabase
            .from('custom_databases')
            .select('*')
            .order('name');

        if (error) throw error;
        return data as CustomDatabase[];
    },

    async createDatabase(name: string, description?: string) {
        const { data, error } = await supabase
            .from('custom_databases')
            .insert({ name, description })
            .select()
            .single();

        if (error) throw error;
        return data as CustomDatabase;
    },

    async updateDatabase(id: string, updates: { name?: string; description?: string }) {
        const { data, error } = await supabase
            .from('custom_databases')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as CustomDatabase;
    },

    async deleteDatabase(id: string) {
        const { error } = await supabase
            .from('custom_databases')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // --- Item Management ---

    async saveItem(item: SinapiItem): Promise<any> {
        // Ensure we don't save with technical IDs if they exist in the object
        const { ...itemToSave } = item;

        // If database_id is not set, we might need a default or throw error.
        // For backward compatibility, if no database_id, it might go to a "default" one or stay null if the column allows (but we want to organize them).

        // Assumption: UI ensures a database is selected before saving.

        // Check if item exists in the target database
        let query = supabase
            .from('custom_items')
            .select('id')
            .eq('code', item.code);

        if (item.database_id) {
            query = query.eq('database_id', item.database_id);
        } else {
            query = query.is('database_id', null);
        }

        const { data: existing } = await query.maybeSingle();

        let result;
        const itemData = {
            code: item.code || `CUSTOM-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            description: item.description,
            unit: item.unit,
            price: item.price,
            type: item.type,
            category: item.category || 'Própria',
            composition: item.composition ? JSON.stringify(item.composition) : null,
            database_id: item.database_id
        };

        if (existing) {
            // Update
            result = await supabase
                .from('custom_items')
                .update(itemData)
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            // Insert
            result = await supabase
                .from('custom_items')
                .insert(itemData)
                .select()
                .single();
        }

        const { data, error } = result;

        if (error) {
            // Handle unique constraint violation (code already exists globally)
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
                console.warn('Code collision detected. Modifying code and retrying...');

                // Append a suffix to make it unique, but try to keep it readable
                const suffix = Math.random().toString(36).substr(2, 4).toUpperCase();
                const newCode = `${itemData.code}-${suffix}`;

                console.log(`Retrying with new code: ${newCode}`);

                return this.saveItem({
                    ...item,
                    code: newCode
                });
            }

            console.error('Error saving to custom_items:', error);
            throw error;
        }
        return data;
    },

    async saveBatch(items: SinapiItem[]) {
        const BATCH_SIZE = 50;
        const chunks = [];

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            chunks.push(items.slice(i, i + BATCH_SIZE));
        }

        const results = [];
        const errors = [];

        for (const chunk of chunks) {
            const itemsToSave = chunk.map(item => ({
                code: item.code || `CUSTOM-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                description: item.description,
                unit: item.unit,
                price: item.price,
                type: item.type,
                category: item.category || 'Própria',
                composition: item.composition ? JSON.stringify(item.composition) : null,
                database_id: item.database_id
            }));

            // Use .insert() instead of .upsert() because 'code,database_id' constraint might not exist yet.
            const { data, error } = await supabase
                .from('custom_items')
                .insert(itemsToSave)
                .select();

            if (error) {
                console.error('Error saving batch chunk:', error);
                errors.push(error);
            } else {
                if (data) results.push(...data);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Failed to save ${errors.length} chunks. First error: ${errors[0].message}`);
        }

        return results;
    },

    async search(
        term: string,
        filters?: {
            type?: string;
            category?: string;
            code?: string;
            searchScope?: 'description' | 'category' | 'both';
            searchMode?: 'exact' | 'all-words';
            databaseId?: string;
            codes?: string[];
        }
    ) {
        let query = supabase.from('custom_items').select('*');

        // IMPORTANT: Filter by database ID if provided
        if (filters?.databaseId) {
            if (filters.databaseId === 'GENERAL') {
                query = query.is('database_id', null);
            } else {
                query = query.eq('database_id', filters.databaseId);
            }
        }

        // 0. Filter by specific codes (Favorites)
        if (filters?.codes && filters.codes.length > 0) {
            query = query.in('code', filters.codes);
        }

        const cleanTerm = term?.trim();
        if (cleanTerm) {
            const scope = filters?.searchScope || 'both';
            const mode = filters?.searchMode || 'exact';

            if (mode === 'all-words') {
                const words = cleanTerm.split(/\s+/).filter(w => w.length >= 2);
                if (words.length > 0) {
                    words.forEach(word => {
                        if (scope === 'description') {
                            query = query.ilike('description', `%${word}%`);
                        } else if (scope === 'category') {
                            query = query.ilike('category', `%${word}%`);
                        } else {
                            query = query.or(`description.ilike.%${word}%,code.ilike.%${word}%,category.ilike.%${word}%`);
                        }
                    });
                }
            } else {
                if (scope === 'description') {
                    query = query.ilike('description', `%${cleanTerm}%`);
                } else if (scope === 'category') {
                    query = query.ilike('category', `%${cleanTerm}%`);
                } else {
                    query = query.or(`description.ilike.%${cleanTerm}%,code.ilike.%${cleanTerm}%,category.ilike.%${cleanTerm}%`);
                }
            }
        }

        if (filters?.type) {
            query = query.eq('type', filters.type);
        }

        if (filters?.code) {
            query = query.ilike('code', `%${filters.code}%`);
        }

        if (filters?.category) {
            query = query.eq('category', filters.category);
        }

        const { data, error } = await query.order('description');

        if (error) {
            console.error('Error searching custom_items:', error);
            throw error;
        }

        // Parse composition back to object
        return (data || []).map(item => ({
            ...item,
            composition: item.composition ? JSON.parse(item.composition) : [],
            source: 'Própria' as const
        }));
    },

    async deleteItem(code: string, databaseId?: string) {
        let query = supabase.from('custom_items').delete().eq('code', code);

        if (databaseId) {
            query = query.eq('database_id', databaseId);
        } else {
            query = query.is('database_id', null);
        }

        const { error } = await query;

        if (error) {
            console.error('Error deleting from custom_items:', error);
            throw error;
        }
    },

    // --- Group Management ---

    async renameGroup(oldName: string, newName: string) {
        if (!oldName || !newName) throw new Error("Nomes antigo e novo são obrigatórios.");

        const { error } = await supabase
            .from('custom_items')
            .update({ category: newName })
            .eq('category', oldName);

        if (error) {
            console.error('Error renaming group:', error);
            throw error;
        }
    },

    async deleteGroup(name: string, deleteItems: boolean = false) {
        if (!name) throw new Error("Nome do grupo é obrigatório.");

        let result;
        if (deleteItems) {
            // Deleta os itens permanentemente
            result = await supabase
                .from('custom_items')
                .delete()
                .eq('category', name);
        } else {
            // Apenas remove o rótulo do grupo (move para Itens Avulsos)
            result = await supabase
                .from('custom_items')
                .update({ category: null })
                .eq('category', name);
        }

        if (result.error) {
            console.error('Error deleting group:', result.error);
            throw result.error;
        }
    },

    async duplicateGroup(sourceName: string, targetName: string, options: { sourceBase: 'SINAPI' | 'CUSTOM', targetDatabaseId?: string }) {
        if (!sourceName || !targetName) throw new Error("Nomes de origem e destino são obrigatórios.");

        let itemsToDuplicate: any[] = [];

        if (options.sourceBase === 'SINAPI') {
            const { data, error } = await supabase
                .from('sinapi_items')
                .select('*')
                .eq('category', sourceName);

            if (error) throw error;
            itemsToDuplicate = data || [];
        } else {
            const { data, error } = await supabase
                .from('custom_items')
                .select('*')
                .eq('category', sourceName);

            if (error) throw error;
            itemsToDuplicate = data || [];
        }

        if (itemsToDuplicate.length === 0) return 0;

        // Mapeia para o novo grupo e limpa dados específicos
        const newItems = itemsToDuplicate.map(item => ({
            code: `${item.code}-COPY`, // Adiciona sufixo para evitar colisão imediata se na mesma base
            description: item.description,
            unit: item.unit,
            price: item.price,
            type: item.type,
            category: targetName,
            composition: typeof item.composition === 'string' ? item.composition : JSON.stringify(item.composition || []),
            database_id: options.targetDatabaseId || null
        }));

        // Salva em lotes (saveBatch já existe no service)
        await this.saveBatch(newItems as unknown as SinapiItem[]);

        return newItems.length;
    }
};
