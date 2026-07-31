import { supabase } from '../lib/supabase';
import { contractIndexService, IndexName } from './contractIndexService';
import {
    CommercialPriceTable,
    CommercialPriceTableItem,
    PriceTableStatus,
    commercialPriceTableService,
} from './commercialPriceTableService';

// Locação reusa as MESMAS interfaces de Venda de Ativos (CommercialPriceTable/
// CommercialPriceTableItem) — a única diferença é o eixo de valor: aqui
// current_price/activate vêm de commercial_properties.rental_price, não de
// price/table_price. Ver 20270824000002_rental_price_tables.sql.
export type { CommercialPriceTable as RentalPriceTable, CommercialPriceTableItem as RentalPriceTableItem, PriceTableStatus };

const TABLE_COLS = 'id, organization_id, building_id, version_label, effective_date, status, notes, created_at, activated_at';
const ITEM_COLS = 'id, price_table_id, property_id, price, created_at';

export const rentalPriceTableService = {
    async listTables(buildingId: string): Promise<CommercialPriceTable[]> {
        const { data, error } = await supabase
            .from('rental_price_tables')
            .select(TABLE_COLS)
            .eq('building_id', buildingId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },

    /** Unidades publicadas no Comercial sob este edifício (filhas diretas). */
    async listBuildingUnits(buildingId: string): Promise<{ id: string; name: string | null }[]> {
        const { data, error } = await supabase
            .from('commercial_properties')
            .select('id, name')
            .eq('parent_id', buildingId);
        if (error) throw error;
        return data ?? [];
    },

    async getActiveTable(buildingId: string): Promise<CommercialPriceTable | null> {
        const { data, error } = await supabase
            .from('rental_price_tables')
            .select(TABLE_COLS)
            .eq('building_id', buildingId)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async getTableItems(tableId: string): Promise<CommercialPriceTableItem[]> {
        const { data: rows, error } = await supabase
            .from('rental_price_table_items')
            .select(ITEM_COLS)
            .eq('price_table_id', tableId);
        if (error) throw error;
        const items = rows ?? [];
        if (items.length === 0) return [];

        // Join manual: rental_price_table_items NÃO tem FK para commercial_properties
        // (tabela quente — evita deadlock de DDL), então o PostgREST não resolve o
        // embed `property:commercial_properties(...)`. Buscamos as unidades à parte
        // e cruzamos por property_id.
        const propIds = [...new Set(items.map((i: any) => i.property_id))];
        const { data: props, error: propsErr } = await supabase
            .from('commercial_properties')
            .select('id, name, rental_price, price, status, private_area, bedrooms, bathrooms, parking_spaces, floor, position_type, specs, visible_to_broker, show_price_to_broker, images')
            .in('id', propIds);
        if (propsErr) throw propsErr;
        const byId = new Map((props ?? []).map((p: any) => [p.id, p]));

        return items.map((row: any) => {
            const p = byId.get(row.property_id) ?? {};
            const specs = p.specs ?? {};
            // Padrão canônico de PropertyUnitMap.tsx: `coluna || specs || 0` (falsy).
            const num = (a: any, b: any) => (Number(a) || Number(b)) || null;
            // Valor vigente de locação: rental_price; fallback para price (o campo
            // "Aluguel base" antigo) enquanto rental_price não foi preenchido.
            const currentRental = p.rental_price != null ? Number(p.rental_price)
                : (p.price != null ? Number(p.price) : undefined);
            return {
                id: row.id,
                price_table_id: row.price_table_id,
                property_id: row.property_id,
                price: Number(row.price),
                created_at: row.created_at,
                property_name: p.name,
                current_price: currentRental,
                property_status: p.status ?? undefined,
                private_area: p.private_area != null ? Number(p.private_area) : null,
                bedrooms: num(p.bedrooms, specs.bedrooms),
                bathrooms: num(p.bathrooms, specs.bathrooms),
                parking_spaces: num(p.parking_spaces, specs.parkingSpaces),
                // Fallback para specs igual ao das RPCs do portal (app e link têm que
                // concordar). NÃO usa o `num()` acima: ele é `||`, e pavimento 0 é
                // térreo — cairia no specs e viraria "—".
                floor: p.floor != null ? Number(p.floor) : (specs.floor != null ? Number(specs.floor) : null),
                position_type: p.position_type ?? null,
                visible_to_broker: p.visible_to_broker ?? true,
                show_price_to_broker: p.show_price_to_broker ?? true,
                photo_url: (Array.isArray(p.images) && p.images[0]) || null,
            };
        });
    },

    /** Cria um rascunho clonando os aluguéis vigentes das unidades do prédio
     *  (filhas diretas). Usa rental_price; fallback para price ("Aluguel base"
     *  antigo) quando rental_price ainda não foi definido. */
    async createDraftFromActive(
        organizationId: string,
        buildingId: string,
        versionLabel: string,
    ): Promise<CommercialPriceTable> {
        const { data: units, error: unitsErr } = await supabase
            .from('commercial_properties')
            .select('id, rental_price, price')
            .eq('parent_id', buildingId);
        if (unitsErr) throw unitsErr;
        if (!units || units.length === 0) throw new Error('Nenhuma unidade encontrada para este prédio.');

        const { data: table, error: tableErr } = await supabase
            .from('rental_price_tables')
            .insert({ organization_id: organizationId, building_id: buildingId, version_label: versionLabel, status: 'draft' })
            .select(TABLE_COLS)
            .single();
        if (tableErr) throw tableErr;

        const items = units.map(u => ({
            price_table_id: table.id,
            property_id: u.id,
            price: Number((u as any).rental_price ?? (u as any).price ?? 0),
        }));
        const { error: itemsErr } = await supabase.from('rental_price_table_items').insert(items);
        if (itemsErr) throw itemsErr;

        return table;
    },

    async updateItemPrice(itemId: string, price: number): Promise<void> {
        const { error } = await supabase.from('rental_price_table_items').update({ price }).eq('id', itemId);
        if (error) throw error;
    },

    /** Visibilidade no Portal do Corretor é da UNIDADE (commercial_properties),
     *  não da versão da tabela — mesma flag compartilhada com Venda de Ativos. */
    async updateItemVisibility(propertyId: string, visible: boolean): Promise<void> {
        const { error } = await supabase.from('commercial_properties').update({ visible_to_broker: visible }).eq('id', propertyId);
        if (error) throw error;
    },

    /** "Exibir Preço" — mesma flag de unidade compartilhada com Venda de Ativos. */
    async updateItemShowPrice(propertyId: string, show: boolean): Promise<void> {
        const { error } = await supabase.from('commercial_properties').update({ show_price_to_broker: show }).eq('id', propertyId);
        if (error) throw error;
    },

    /** Foto de capa — mesma coluna/bucket compartilhados com Venda de Ativos. */
    updateItemPhoto: commercialPriceTableService.updateItemPhoto,
    uploadItemPhoto: commercialPriceTableService.uploadItemPhoto,

    /** Reajuste em massa: percentual simples OU por índice (IGP-M/IPCA/...),
     *  reusando contractIndexService (mesmos índices dos Contratos de locação). */
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
            .from('rental_price_table_items')
            .select('id, price')
            .eq('price_table_id', tableId);
        if (itemsErr) throw itemsErr;
        if (!items || items.length === 0) return { itemsUpdated: 0, factor };

        for (const item of items) {
            const newPrice = Math.round(Number(item.price) * factor * 100) / 100;
            const { error } = await supabase.from('rental_price_table_items').update({ price: newPrice }).eq('id', item.id);
            if (error) throw error;
        }
        return { itemsUpdated: items.length, factor };
    },

    /** Sincroniza os itens da tabela ATIVA do prédio com os aluguéis informados
     *  (property_id → aluguel). Usado pela Inteligência de Aluguéis: como ela grava
     *  rental_price direto nas unidades (sem passar pela tabela), a versão ativa
     *  ficaria defasada e o Portal do Corretor (que lê o item da versão ativa)
     *  mostraria o valor antigo/zerado. Mantém "aluguel vigente" == "aluguel nesta
     *  versão". Sem tabela ativa é no-op (o Portal cai no current_price/rental_price). */
    async syncActiveTableItems(
        buildingId: string,
        rentByPropertyId: Record<string, number>,
    ): Promise<{ hadActiveTable: boolean; itemsUpdated: number }> {
        const table = await this.getActiveTable(buildingId);
        if (!table) return { hadActiveTable: false, itemsUpdated: 0 };

        const { data: items, error } = await supabase
            .from('rental_price_table_items')
            .select('id, property_id')
            .eq('price_table_id', table.id);
        if (error) throw error;

        let itemsUpdated = 0;
        for (const item of items ?? []) {
            const rent = rentByPropertyId[(item as any).property_id];
            if (rent == null) continue;
            const { error: upErr } = await supabase
                .from('rental_price_table_items')
                .update({ price: rent })
                .eq('id', (item as any).id);
            if (upErr) throw upErr;
            itemsUpdated++;
        }
        return { hadActiveTable: true, itemsUpdated };
    },

    /** Ativa a tabela (RPC atômica): grava rental_price em cada property, supersede a anterior. */
    async activateTable(tableId: string): Promise<{ propertiesUpdated: number }> {
        const { data, error } = await supabase.rpc('fn_activate_rental_price_table', { p_table_id: tableId });
        if (error) throw error;
        return { propertiesUpdated: Number(data?.properties_updated ?? 0) };
    },

    async deleteTable(tableId: string): Promise<void> {
        const { error } = await supabase.from('rental_price_tables').delete().eq('id', tableId).eq('status', 'draft');
        if (error) throw error;
    },
};
