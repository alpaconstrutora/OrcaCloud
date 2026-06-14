import { supabase } from '../lib/supabase';
import {
    ImovibStudy, ImovibStudyInsert, ImovibStudyUpdate,
    ImovibBlock, ImovibBlockInsert, ImovibBlockUpdate,
    ImovibUnit, ImovibUnitInsert, ImovibUnitUpdate,
    ImovibRegulatoryZone, ImovibRegulatoryZoneInsert, ImovibRegulatoryZoneUpdate
} from '../types';

export const imovibService = {
    async getStudies(organizationId?: string): Promise<ImovibStudy[]> {
        // Campos numéricos de cenário omitidos na lista (carregados em getStudyById)
        let query = supabase
            .from('imovib_studies')
            .select('id, organization_id, name, cnpj, developer, manager, version, segment, sub_classification, phase, development_modality, zoning, created_at, updated_at')
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
                    .select('id, study_id, name, construction_cost_sqm, sales_price_sqm, created_at, updated_at')
                    .eq('study_id', id)
                    .order('created_at', { ascending: true });

                if (blocksError) throw blocksError;

                if (blocks && blocks.length > 0) {
                    const blockIds = blocks.map(b => b.id);
                    const { data: units, error: unitsError } = await supabase
                        .from('imovib_units')
                        .select('id, block_id, name, quantity, private_area, common_area, pavimentos, is_vendavel, created_at, updated_at')
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
                    .select('id, study_id, category, subcategory, name, value_type, value, created_at, updated_at')
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
        const { data, error } = await supabase.from('imovib_blocks').select('id, study_id, name, construction_cost_sqm, sales_price_sqm, created_at, updated_at').eq('study_id', studyId).order('created_at', { ascending: true });
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
        const { data, error } = await supabase.from('imovib_units').select('id, block_id, name, quantity, private_area, common_area, pavimentos, is_vendavel, created_at, updated_at').eq('block_id', blockId).order('created_at', { ascending: true });
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
    },

    // ── Regulatory Zones ──────────────────────────────────────────────────────

    async getRegulatoryZones(studyId: string): Promise<ImovibRegulatoryZone[]> {
        const { data, error } = await supabase
            .from('imovib_regulatory_zones')
            .select('*')
            .eq('study_id', studyId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch regulatory zones: ${error.message}`);
        return data || [];
    },

    async createRegulatoryZone(zone: ImovibRegulatoryZoneInsert): Promise<ImovibRegulatoryZone> {
        const { data, error } = await supabase
            .from('imovib_regulatory_zones')
            .insert(zone)
            .select()
            .single();
        if (error) throw new Error(`Failed to create regulatory zone: ${error.message}`);
        return data;
    },

    async updateRegulatoryZone(id: string, updates: ImovibRegulatoryZoneUpdate): Promise<void> {
        const { error } = await supabase
            .from('imovib_regulatory_zones')
            .update(updates)
            .eq('id', id);
        if (error) throw new Error(`Failed to update regulatory zone: ${error.message}`);
    },

    async deleteRegulatoryZone(id: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_regulatory_zones')
            .delete()
            .eq('id', id);
        if (error) throw new Error(`Failed to delete regulatory zone: ${error.message}`);
    },

    // ── Unit Instances (Espelho de Vendas da Viabilidade) ─────────────────────

    async getUnitInstances(studyId: string): Promise<import('../types').ImovibUnitInstance[]> {
        const { data, error } = await supabase
            .from('imovib_unit_instances')
            .select('id, study_id, block_id, unit_id, name, floor, private_area, position_type, sun_orientation, price, status, created_at, updated_at')
            .eq('study_id', studyId)
            .order('floor', { ascending: true })
            .order('name', { ascending: true });
        if (error) throw new Error(`Failed to fetch unit instances: ${error.message}`);
        return data || [];
    },

    async createUnitInstances(instances: import('../types').ImovibUnitInstanceInsert[]): Promise<import('../types').ImovibUnitInstance[]> {
        if (!instances || instances.length === 0) return [];
        const { data, error } = await supabase
            .from('imovib_unit_instances')
            .insert(instances)
            .select();
        if (error) throw new Error(`Failed to create unit instances: ${error.message}`);
        return data || [];
    },

    async updateUnitInstance(id: string, updates: Partial<import('../types').ImovibUnitInstanceInsert>): Promise<void> {
        const { error } = await supabase
            .from('imovib_unit_instances')
            .update(updates)
            .eq('id', id);
        if (error) throw new Error(`Failed to update unit instance: ${error.message}`);
    },

    async deleteUnitInstancesByStudy(studyId: string): Promise<void> {
        const { error } = await supabase
            .from('imovib_unit_instances')
            .delete()
            .eq('study_id', studyId);
        if (error) throw new Error(`Failed to delete unit instances: ${error.message}`);
    },

};
