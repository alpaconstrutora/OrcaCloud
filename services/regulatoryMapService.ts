// services/regulatoryMapService.ts
//
// Cadastro de Mapas Regulatórios por cidade (Incorporação, migration 20270819000005).
// Um mapa por cidade/legislação; o empreendimento (MapaRegulatorioEditor) importa zonas daqui
// via `importZonesToEmpreendimento` — cópia, não vínculo vivo (mesma filosofia de "pin" do
// SINAPI versionado). Editar depois de importado não altera o cadastro da cidade.
import { supabase } from '../lib/supabase';
import {
    RegulatoryMap,
    RegulatoryMapInsert,
    RegulatoryMapUpdate,
    RegulatoryMapWithCity,
    RegulatoryMapZone,
    RegulatoryMapZoneInsert,
    RegulatoryMapZoneUpdate,
} from '../types';
import { empreendimentoService } from './empreendimentoService';

const MAP_COLS = 'id, organization_id, city_id, name, lei_referencia, status, observacoes, created_at, updated_at';
// Literal única (não concatenar/templatizar): supabase-js precisa de string literal em
// .select() para tipar o retorno — ver armadilha documentada em empreendimentoService.ts.
const MAP_COLS_WITH_CITY = 'id, organization_id, city_id, name, lei_referencia, status, observacoes, created_at, updated_at, master_cities(name, master_states(code))';
const ZONE_COLS = 'id, regulatory_map_id, organization_id, macroarea, zona, ca_minimo, ca_basico, ca_maximo, taxa_ocupacao_maxima, taxa_permeabilidade_minima, gabarito_altura_maxima, uso_permitido, recuo_frente, recuo_fundos, recuo_lateral_direita, recuo_lateral_esquerda, gabarito_pavimentos, regra_vagas, vagas_por_unidade, area_minima_unidade, lei_referencia, documento_fonte, nivel_confianca, observacoes, sort_order, created_at, updated_at';

export const regulatoryMapService = {
    // ── Mapas ────────────────────────────────────────────────────────────────
    async list(organizationId?: string, cityId?: string): Promise<RegulatoryMapWithCity[]> {
        let query = supabase
            .from('regulatory_maps')
            .select(MAP_COLS_WITH_CITY)
            .order('created_at', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);
        if (cityId) query = query.eq('city_id', cityId);
        const { data, error } = await query;
        if (error) throw new Error(`Falha ao carregar mapas regulatórios: ${error.message}`);
        return (data || []).map((m: any) => ({
            ...m,
            city_name: m.master_cities?.name,
            state_code: m.master_cities?.master_states?.code,
        }));
    },

    async getById(id: string): Promise<RegulatoryMapWithCity | null> {
        const { data, error } = await supabase
            .from('regulatory_maps')
            .select(MAP_COLS_WITH_CITY)
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(`Falha ao carregar mapa regulatório: ${error.message}`);
        if (!data) return null;
        const m: any = data;
        return { ...m, city_name: m.master_cities?.name, state_code: m.master_cities?.master_states?.code };
    },

    async create(map: RegulatoryMapInsert): Promise<RegulatoryMap> {
        const { data, error } = await supabase.from('regulatory_maps').insert(map).select(MAP_COLS).single();
        if (error) throw new Error(`Falha ao criar mapa regulatório: ${error.message}`);
        return data;
    },

    async update(id: string, updates: RegulatoryMapUpdate): Promise<void> {
        const { error } = await supabase.from('regulatory_maps').update(updates).eq('id', id);
        if (error) throw new Error(`Falha ao atualizar mapa regulatório: ${error.message}`);
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('regulatory_maps').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir mapa regulatório: ${error.message}`);
    },

    // ── Zonas do mapa ────────────────────────────────────────────────────────
    async listZones(regulatoryMapId: string): Promise<RegulatoryMapZone[]> {
        const { data, error } = await supabase
            .from('regulatory_map_zones')
            .select(ZONE_COLS)
            .eq('regulatory_map_id', regulatoryMapId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Falha ao carregar zonas do mapa: ${error.message}`);
        return data || [];
    },

    async createZone(zone: RegulatoryMapZoneInsert): Promise<RegulatoryMapZone> {
        const { data, error } = await supabase.from('regulatory_map_zones').insert(zone).select(ZONE_COLS).single();
        if (error) throw new Error(`Falha ao criar zona: ${error.message}`);
        return data;
    },

    /** Insert em lote (uma request) — usado pela importação de planilha Excel, onde uma
     *  cidade pode trazer dezenas de zonas de uma vez. */
    async createZonesBulk(zones: RegulatoryMapZoneInsert[]): Promise<RegulatoryMapZone[]> {
        if (zones.length === 0) return [];
        const { data, error } = await supabase.from('regulatory_map_zones').insert(zones).select(ZONE_COLS);
        if (error) throw new Error(`Falha ao importar zonas: ${error.message}`);
        return data || [];
    },

    /** Importação de planilha Excel: reimportar o mesmo arquivo (ou uma versão atualizada da
     *  lei) NÃO deve duplicar zonas — casa cada linha importada com uma zona já existente pela
     *  chave natural (macroárea, zona) e ATUALIZA em vez de inserir de novo. Só cria zona nova
     *  quando não há uma existente com essa mesma combinação (ou quando a linha não tem
     *  macroárea/zona pra identificar — aí não tem como casar, sempre insere). */
    async upsertZonesFromImport(params: {
        regulatoryMapId: string;
        zones: RegulatoryMapZoneInsert[];
    }): Promise<{ created: number; updated: number }> {
        const { regulatoryMapId, zones } = params;
        const existing = await this.listZones(regulatoryMapId);

        const keyOf = (macroarea?: string, zona?: string): string | null => {
            const m = (macroarea || '').trim().toLowerCase();
            const z = (zona || '').trim().toLowerCase();
            return m && z ? `${m}::${z}` : null;
        };

        const existingByKey = new Map<string, RegulatoryMapZone>();
        for (const z of existing) {
            const key = keyOf(z.macroarea, z.zona);
            if (key) existingByKey.set(key, z);
        }

        const usedExistingIds = new Set<string>();
        const toInsert: RegulatoryMapZoneInsert[] = [];
        let nextSortOrder = existing.length;
        let updated = 0;

        for (const z of zones) {
            const key = keyOf(z.macroarea, z.zona);
            const match = key ? existingByKey.get(key) : undefined;
            if (match && !usedExistingIds.has(match.id)) {
                usedExistingIds.add(match.id);
                const { regulatory_map_id: _mapId, organization_id: _orgId, sort_order: _sortOrder, ...values } = z;
                await this.updateZone(match.id, values);
                updated++;
            } else {
                toInsert.push({ ...z, sort_order: nextSortOrder++ });
            }
        }

        const created = toInsert.length > 0 ? (await this.createZonesBulk(toInsert)).length : 0;
        return { created, updated };
    },

    async updateZone(id: string, updates: RegulatoryMapZoneUpdate): Promise<void> {
        const { error } = await supabase.from('regulatory_map_zones').update(updates).eq('id', id);
        if (error) throw new Error(`Falha ao atualizar zona: ${error.message}`);
    },

    async deleteZone(id: string): Promise<void> {
        const { error } = await supabase.from('regulatory_map_zones').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir zona: ${error.message}`);
    },

    // ── Importação para o Empreendimento ────────────────────────────────────
    /** Copia as zonas escolhidas do cadastro para empreendimento_regulatory_zones.
     *  É cópia (como o "pin" do SINAPI): depois de importado, editar a zona no
     *  empreendimento NÃO altera o cadastro da cidade, e vice-versa. */
    async importZonesToEmpreendimento(params: {
        zones: RegulatoryMapZone[];
        empreendimentoId: string;
        organizationId: string;
        sortOrderOffset: number;
    }) {
        const { zones, empreendimentoId, organizationId, sortOrderOffset } = params;
        for (let i = 0; i < zones.length; i++) {
            const z = zones[i];
            await empreendimentoService.createRegulatoryZone({
                empreendimento_id: empreendimentoId,
                organization_id: organizationId,
                macroarea: z.macroarea,
                zona: z.zona,
                ca_minimo: z.ca_minimo,
                ca_basico: z.ca_basico,
                ca_maximo: z.ca_maximo,
                taxa_ocupacao_maxima: z.taxa_ocupacao_maxima,
                taxa_permeabilidade_minima: z.taxa_permeabilidade_minima,
                gabarito_altura_maxima: z.gabarito_altura_maxima,
                uso_permitido: z.uso_permitido,
                recuo_frente: z.recuo_frente,
                recuo_fundos: z.recuo_fundos,
                recuo_lateral_direita: z.recuo_lateral_direita,
                recuo_lateral_esquerda: z.recuo_lateral_esquerda,
                gabarito_pavimentos: z.gabarito_pavimentos,
                regra_vagas: z.regra_vagas,
                vagas_por_unidade: z.vagas_por_unidade,
                area_minima_unidade: z.area_minima_unidade,
                lei_referencia: z.lei_referencia,
                documento_fonte: z.documento_fonte,
                nivel_confianca: z.nivel_confianca,
                observacoes: z.observacoes,
                sort_order: sortOrderOffset + i,
            });
        }
    },
};
