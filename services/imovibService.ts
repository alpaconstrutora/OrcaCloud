import { supabase } from '../lib/supabase';
import {
    ImovibStudy, ImovibStudyInsert, ImovibStudyUpdate,
    ImovibBlock, ImovibBlockInsert, ImovibBlockUpdate,
    ImovibUnit, ImovibUnitInsert, ImovibUnitUpdate
} from '../types';

export const imovibService = {
    async getStudies(organizationId?: string): Promise<ImovibStudy[]> {
        let query = supabase
            .from('imovib_studies')
            .select('*')
            .order('created_at', { ascending: false });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching IMOVIB studies:', error);
            throw new Error(`Failed to fetch IMOVIB studies: ${error.message}`);
        }

        return data || [];
    },

    async getStudyById(id: string, includeDetails: boolean = false): Promise<ImovibStudy | null> {
        const { data: study, error } = await supabase
            .from('imovib_studies')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error fetching IMOVIB study ${id}:`, error);
            throw new Error(`Failed to fetch IMOVIB study: ${error.message}`);
        }

        if (study && includeDetails) {
            try {
                const { data: blocks, error: blocksError } = await supabase
                    .from('imovib_blocks')
                    .select('*')
                    .eq('study_id', id)
                    .order('created_at', { ascending: true });

                if (blocksError) throw blocksError;

                if (blocks && blocks.length > 0) {
                    const blockIds = blocks.map(b => b.id);
                    const { data: units, error: unitsError } = await supabase
                        .from('imovib_units')
                        .select('*')
                        .in('block_id', blockIds)
                        .order('created_at', { ascending: true });

                    if (unitsError) throw unitsError;

                    study.blocks = blocks.map(b => ({
                        ...b,
                        units: units ? units.filter(u => u.block_id === b.id) : []
                    }));
                } else {
                    study.blocks = [];
                }
            } catch (err) {
                console.error('Error loading study blocks/units:', err);
                study.blocks = [];
            }

            try {
                // Fetch CAPEX Items
                const { data: capex, error: capexError } = await supabase
                    .from('imovib_capex_items')
                    .select('*')
                    .eq('study_id', id)
                    .order('category', { ascending: true })
                    .order('created_at', { ascending: true });

                if (capexError) throw capexError;
                study.capex_items = capex || [];
            } catch (err) {
                console.error('Error loading study CAPEX items:', err);
                study.capex_items = [];
            }
        }

        return study;
    },

    async createStudy(study: ImovibStudyInsert): Promise<ImovibStudy> {
        const { data, error } = await supabase
            .from('imovib_studies')
            .insert(study)
            .select()
            .single();

        if (error) {
            console.error('Error creating IMOVIB study:', error);
            throw new Error(`Failed to create IMOVIB study: ${error.message}`);
        }

        return data;
    },

    async updateStudy(id: string, updates: ImovibStudyUpdate): Promise<ImovibStudy> {
        const { data, error } = await supabase
            .from('imovib_studies')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(`Error updating IMOVIB study ${id}:`, error);
            throw new Error(`Failed to update IMOVIB study: ${error.message}`);
        }

        return data;
    },

    async deleteStudy(id: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_studies')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`Error deleting IMOVIB study ${id}:`, error);
            throw new Error(`Failed to delete IMOVIB study: ${error.message}`);
        }
    },

    // Blocks
    async getBlocksByStudyId(studyId: string): Promise<ImovibBlock[]> {
        const { data, error } = await supabase.from('imovib_blocks').select('*').eq('study_id', studyId).order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch IMOVIB blocks: ${error.message}`);
        return data || [];
    },

    async createBlock(block: ImovibBlockInsert): Promise<ImovibBlock> {
        const { data, error } = await supabase.from('imovib_blocks').insert(block).select().single();
        if (error) throw new Error(`Failed to create IMOVIB block: ${error.message}`);
        return data;
    },

    async updateBlock(id: string, updates: ImovibBlockUpdate): Promise<ImovibBlock> {
        const { data, error } = await supabase.from('imovib_blocks').update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Failed to update IMOVIB block: ${error.message}`);
        return data;
    },

    async deleteBlock(id: string): Promise<void> {
        const { error } = await supabase.from('imovib_blocks').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete IMOVIB block: ${error.message}`);
    },

    // Units
    async getUnitsByBlockId(blockId: string): Promise<ImovibUnit[]> {
        const { data, error } = await supabase.from('imovib_units').select('*').eq('block_id', blockId).order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch IMOVIB units: ${error.message}`);
        return data || [];
    },

    async createUnit(unit: ImovibUnitInsert): Promise<ImovibUnit> {
        const { data, error } = await supabase.from('imovib_units').insert(unit).select().single();
        if (error) throw new Error(`Failed to create IMOVIB unit: ${error.message}`);
        return data;
    },

    async updateUnit(id: string, updates: ImovibUnitUpdate): Promise<ImovibUnit> {
        const { data, error } = await supabase.from('imovib_units').update(updates).eq('id', id).select().single();
        if (error) throw new Error(`Failed to update IMOVIB unit: ${error.message}`);
        return data;
    },

    async deleteUnit(id: string): Promise<void> {
        const { error } = await supabase.from('imovib_units').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete IMOVIB unit: ${error.message}`);
    },

    // --- CAPEX Items (Sprint 7) ---

    async upsertCapexItems(items: import('../types').ImovibCapexItemInsert[]): Promise<import('../types').ImovibCapexItem[]> {
        if (!items || items.length === 0) return [];

        const { data, error } = await supabase
            .from('imovib_capex_items')
            .upsert(items, { onConflict: 'id' })
            .select();

        if (error) {
            console.error('Error upserting IMOVIB CAPEX items:', error);
            throw new Error(`Failed to upsert CAPEX items: ${error.message}`);
        }

        return data || [];
    },

    async updateCapexItem(id: string, updates: Partial<import('../types').ImovibCapexItem>): Promise<void> {
        const { error } = await supabase
            .from('imovib_capex_items')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error(`Error updating CAPEX item ${id}:`, error);
            throw new Error(`Failed to update CAPEX item: ${error.message}`);
        }
    },

    async deleteCapexItem(id: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_capex_items')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`Error deleting CAPEX item ${id}:`, error);
            throw new Error(`Failed to delete CAPEX item: ${error.message}`);
        }
    }

};
