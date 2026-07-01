import { supabase } from '../lib/supabase';
import { contractIndexService, IndexName } from './contractIndexService';

export type PriceTableStatus = 'draft' | 'active' | 'superseded';

export interface CommercialPriceTable {
    id: string;
    organization_id: string;
    building_id: string;
    version_label: string;
    effective_date: string;
    status: PriceTableStatus;
    notes?: string | null;
    created_at: string;
    activated_at?: string | null;
}

export interface CommercialPriceTableItem {
    id: string;
    price_table_id: string;
    property_id: string;
    price: number;
    created_at: string;
    property_name?: string;
    current_price?: number; // preço vigente na commercial_properties, para diff visual
}

const TABLE_COLS = 'id, organization_id, building_id, version_label, effective_date, status, notes, created_at, activated_at';
const ITEM_COLS = 'id, price_table_id, property_id, price, created_at';

export const commercialPriceTableService = {
    async listTables(buildingId: string): Promise<CommercialPriceTable[]> {
        const { data, error } = await supabase
            .from('commercial_price_tables')
            .select(TABLE_COLS)
            .eq('building_id', buildingId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    async getActiveTable(buildingId: string): Promise<CommercialPriceTable | null> {
        const { data, error } = await supabase
            .from('commercial_price_tables')
            .select(TABLE_COLS)
            .eq('building_id', buildingId)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getTableItems(tableId: string): Promise<CommercialPriceTableItem[]> {
        const { data, error } = await supabase
            .from('commercial_price_table_items')
            .select(`${ITEM_COLS}, property:commercial_properties(name, price)`)
            .eq('price_table_id', tableId);
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
            id: row.id,
            price_table_id: row.price_table_id,
            property_id: row.property_id,
            price: Number(row.price),
            created_at: row.created_at,
            property_name: row.property?.name,
            current_price: row.property?.price != null ? Number(row.property.price) : undefined,
        }));
    },

    /** Cria um rascunho clonando os preços vigentes das unidades do prédio (filhas diretas). */
    async createDraftFromActive(
        organizationId: string,
        buildingId: string,
        versionLabel: string,
    ): Promise<CommercialPriceTable> {
        const { data: units, error: unitsErr } = await supabase
            .from('commercial_properties')
            .select('id, price')
            .eq('parent_id', buildingId);
        if (unitsErr) throw unitsErr;
        if (!units || units.length === 0) throw new Error('Nenhuma unidade encontrada para este prédio.');

        const { data: table, error: tableErr } = await supabase
            .from('commercial_price_tables')
            .insert({ organization_id: organizationId, building_id: buildingId, version_label: versionLabel, status: 'draft' })
            .select(TABLE_COLS)
            .single();
        if (tableErr) throw tableErr;

        const items = units.map(u => ({ price_table_id: table.id, property_id: u.id, price: Number(u.price ?? 0) }));
        const { error: itemsErr } = await supabase.from('commercial_price_table_items').insert(items);
        if (itemsErr) throw itemsErr;

        return table;
    },

    async updateItemPrice(itemId: string, price: number): Promise<void> {
        const { error } = await supabase.from('commercial_price_table_items').update({ price }).eq('id', itemId);
        if (error) throw error;
    },

    /**
     * Reajuste em massa: percentual simples OU por índice (INCC/IPCA/...) entre 2 meses
     * de referência, reusando os valores já cadastrados em contractIndexService (Contratos).
     */
    async applyBulkAdjustment(
        tableId: string,
        adjustment:
            | { percent: number }
            | { indexName: IndexName; baseMonth: string; targetMonth: string; organizationId: string },
    ): Promise<{ itemsUpdated: number; factor: number }> {
        let factor: number;
        if ('percent' in adjustment) {
            factor = 1 + adjustment.percent / 100;
        } else {
            const base = await contractIndexService.getClosestTo(adjustment.indexName, adjustment.baseMonth, adjustment.organizationId);
            const target = await contractIndexService.getClosestTo(adjustment.indexName, adjustment.targetMonth, adjustment.organizationId);
            if (!base || !target) throw new Error(`Índice ${adjustment.indexName} sem valores cadastrados para os meses selecionados.`);
            if (base.value <= 0) throw new Error('Valor base do índice deve ser maior que zero.');
            factor = target.value / base.value;
        }

        const { data: items, error: itemsErr } = await supabase
            .from('commercial_price_table_items')
            .select('id, price')
            .eq('price_table_id', tableId);
        if (itemsErr) throw itemsErr;
        if (!items || items.length === 0) return { itemsUpdated: 0, factor };

        for (const item of items) {
            const newPrice = Math.round(Number(item.price) * factor * 100) / 100;
            const { error } = await supabase.from('commercial_price_table_items').update({ price: newPrice }).eq('id', item.id);
            if (error) throw error;
        }
        return { itemsUpdated: items.length, factor };
    },

    /** Ativa a tabela (RPC atômica): grava price/table_price em cada property, supersede a anterior. */
    async activateTable(tableId: string): Promise<{ propertiesUpdated: number }> {
        const { data, error } = await supabase.rpc('fn_activate_commercial_price_table', { p_table_id: tableId });
        if (error) throw error;
        return { propertiesUpdated: Number(data?.properties_updated ?? 0) };
    },

    async deleteTable(tableId: string): Promise<void> {
        const { error } = await supabase.from('commercial_price_tables').delete().eq('id', tableId).eq('status', 'draft');
        if (error) throw error;
    },
};
