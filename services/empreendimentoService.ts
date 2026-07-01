import { supabase } from '../lib/supabase';
import { imovibService } from './imovibService';
import { commercialService } from './commercialService';
import {
    Empreendimento, EmpreendimentoInsert, EmpreendimentoUpdate, EmpreendimentoWithChildren,
    EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoTowerUpdate,
    EmpreendimentoFloor, EmpreendimentoFloorInsert, EmpreendimentoFloorUpdate,
    EmpreendimentoUnit, EmpreendimentoUnitInsert, EmpreendimentoUnitUpdate,
    EmpreendimentoCommonArea, EmpreendimentoCommonAreaInsert, EmpreendimentoSyncReport,
    UnitStatus, CommonAreaCategory,
    ImovibStudy, ImovibUnit, ImovibUnitInstance,
} from '../types';
import {
    mapCommercialToEmpr, UNMAPPABLE_COMMERCIAL_STATUSES,
    mapPositionToCommercial, mapViewToCommercial, mapSunToCommercial,
} from '../utils/empreendimentoComercial';

// Resumo de divergências entre as unidades do empreendimento e suas properties no Comercial.
export interface CommercialDivergenceSummary {
    total: number;
    published: number;
    unpublished: number;
    statusDiverge: number;
    priceDiverge: number;
    unmappable: number;
    orphans: number;
}

// Traduz status da instância Imovib (com acento) para o enum do empreendimento.
const translateStatus = (s?: string): UnitStatus => {
    switch (s) {
        case 'DISPONÍVEL': case 'DISPONIVEL': return 'DISPONIVEL';
        case 'RESERVADO': return 'RESERVADO';
        case 'PERMUTADO': return 'PERMUTADO';
        case 'VENDIDO': return 'VENDIDO';
        default: return 'DISPONIVEL';
    }
};

// Infere categoria de área comum a partir do nome da unidade não-vendável.
const inferCommonAreaCategory = (name: string): CommonAreaCategory => {
    const n = (name || '').toLowerCase();
    if (/(piscina|academia|festa|gourmet|playground|quadra|lazer|churrasq|sal[ãa]o|spa|sauna|brinquedo|cinema|coworking)/.test(n)) return 'LAZER';
    if (/(garagem|vaga|estacion)/.test(n)) return 'GARAGEM';
    if (/(hall|circula|corredor|escada|elevador)/.test(n)) return 'CIRCULACAO';
    if (/(t[ée]cnic|casa de m[áa]quinas|barrilete|reservat[óo]rio|medidor|lixo|gerador)/.test(n)) return 'TECNICA';
    return 'COMUM';
};

// NOTA: estas constantes precisam ser string LITERAIS (sem concatenação com +),
// senão o supabase-js infere GenericStringError em vez do tipo da linha.
const EMPREENDIMENTO_COLS = 'id, organization_id, name, code, status, tipo, imovib_study_id, last_synced_at, matricula, construtora, responsavel_tecnico, crea_cau, numero_processo, endereco_street, endereco_number, endereco_complement, endereco_neighborhood, endereco_city, endereco_state, endereco_zip_code, spe_razao_social, spe_cnpj, spe_nome_fantasia, terreno_street, terreno_number, terreno_complement, terreno_neighborhood, terreno_city, terreno_state, terreno_zip_code, terreno_area, terreno_frente, terreno_fundos, terreno_lateral_direita, terreno_lateral_esquerda, vgv_total, commercial_building_id, developer_name, manager, launch_date, expected_delivery_date, metadata, created_at, updated_at';

const TOWER_COLS = 'id, empreendimento_id, project_id, imovib_block_id, name, floors_count, units_per_floor, construction_cost_sqm, sales_price_sqm, sort_order, created_at, updated_at';

const FLOOR_COLS = 'id, tower_id, name, tipo, floor_number, repeat_count, units_per_floor, prefix, sort_order, created_at, updated_at';

const UNIT_COLS = 'id, tower_id, floor_id, floor_tipo, imovib_unit_id, imovib_instance_id, name, floor, typology, private_area, common_area, total_area, bedrooms, bathrooms, parking_spaces, position_type, sun_orientation, view_type, price, status, is_vendavel, commercial_property_id, sort_order, created_at, updated_at';

const COMMON_AREA_COLS = 'id, empreendimento_id, tower_id, name, category, area, floor, description, is_vendavel, sort_order, created_at, updated_at';

export const empreendimentoService = {
    // ── Empreendimentos ──────────────────────────────────────────────────────
    async list(organizationId?: string): Promise<Empreendimento[]> {
        let query = supabase
            .from('empreendimentos')
            .select(EMPREENDIMENTO_COLS)
            .order('created_at', { ascending: false });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch empreendimentos: ${error.message}`);
        return data || [];
    },

    async getById(id: string, opts?: { includeChildren?: boolean }): Promise<Empreendimento | EmpreendimentoWithChildren | null> {
        const { data: empreendimento, error } = await supabase
            .from('empreendimentos')
            .select(EMPREENDIMENTO_COLS)
            .eq('id', id)
            .single();

        if (error) throw new Error(`Failed to fetch empreendimento: ${error.message}`);
        if (!empreendimento) return null;

        const result = empreendimento as unknown as Empreendimento;

        if (opts?.includeChildren) {
            const towers = await this.listTowers(id);
            const towerIds = towers.map(t => t.id);
            let units: EmpreendimentoUnit[] = [];
            if (towerIds.length > 0) {
                const { data: unitsData, error: unitsError } = await supabase
                    .from('empreendimento_units')
                    .select(UNIT_COLS)
                    .in('tower_id', towerIds)
                    .order('floor', { ascending: true })
                    .order('sort_order', { ascending: true });
                if (unitsError) throw new Error(`Failed to fetch units: ${unitsError.message}`);
                units = unitsData || [];
            }
            result.towers = towers.map(t => ({
                ...t,
                units: units.filter(u => u.tower_id === t.id),
            }));
            result.common_areas = await this.listCommonAreas(id);
        }

        return result;
    },

    async create(data: EmpreendimentoInsert): Promise<Empreendimento> {
        const { data: created, error } = await supabase
            .from('empreendimentos')
            .insert(data)
            .select(EMPREENDIMENTO_COLS)
            .single();
        if (error) throw new Error(`Failed to create empreendimento: ${error.message}`);
        return created;
    },

    async update(id: string, updates: EmpreendimentoUpdate): Promise<Empreendimento> {
        const { data, error } = await supabase
            .from('empreendimentos')
            .update(updates)
            .eq('id', id)
            .select(EMPREENDIMENTO_COLS)
            .single();
        if (error) throw new Error(`Failed to update empreendimento: ${error.message}`);

        // Propaga renomeação para o edifício-pai no Comercial (best-effort)
        if (updates.name && data.commercial_building_id) {
            await supabase
                .from('commercial_properties')
                .update({ name: updates.name })
                .eq('id', data.commercial_building_id);
        }

        return data;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimentos').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete empreendimento: ${error.message}`);
    },

    // ── Torres (= obra) ──────────────────────────────────────────────────────
    async listTowers(empreendimentoId: string): Promise<EmpreendimentoTower[]> {
        const { data, error } = await supabase
            .from('empreendimento_towers')
            .select(TOWER_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch towers: ${error.message}`);
        return data || [];
    },

    async createTower(tower: EmpreendimentoTowerInsert): Promise<EmpreendimentoTower> {
        const { data, error } = await supabase
            .from('empreendimento_towers')
            .insert(tower)
            .select(TOWER_COLS)
            .single();
        if (error) throw new Error(`Failed to create tower: ${error.message}`);
        return data;
    },

    async updateTower(id: string, updates: EmpreendimentoTowerUpdate): Promise<EmpreendimentoTower> {
        const { data, error } = await supabase
            .from('empreendimento_towers')
            .update(updates)
            .eq('id', id)
            .select(TOWER_COLS)
            .single();
        if (error) throw new Error(`Failed to update tower: ${error.message}`);
        return data;
    },

    async deleteTower(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_towers').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete tower: ${error.message}`);
    },

    async linkTowerToObra(towerId: string, projectId: string): Promise<void> {
        const { error } = await supabase
            .from('empreendimento_towers')
            .update({ project_id: projectId })
            .eq('id', towerId);
        if (error) throw new Error(`Failed to link tower to obra: ${error.message}`);
    },

    /**
     * Cria uma obra (projects) para a torre e vincula. Retorna o project_id criado.
     * A obra é persistida com organizationId/classification dentro de settings (padrão do projectService).
     */
    async createObraForTower(towerId: string, organizationId: string, towerName: string): Promise<string> {
        const { data: created, error } = await supabase
            .from('projects')
            .insert({
                name: towerName,
                settings: { name: towerName, organizationId, classification: 'OBRA' },
                budget: {},
            })
            .select('id')
            .single();
        if (error) throw new Error(`Failed to create obra for tower: ${error.message}`);

        await this.linkTowerToObra(towerId, created.id);
        return created.id;
    },

    // ── Utilitário F3: todas as unidades do empreendimento (flatten) ─────────
    async listAllUnitsForEmpreendimento(empreendimentoId: string): Promise<(EmpreendimentoUnit & { _tower_name: string; _tower_project_id?: string | null })[]> {
        const towers = await this.listTowers(empreendimentoId);
        const arrays = await Promise.all(towers.map(t => this.listUnits(t.id)));
        return arrays.flatMap((arr, i) =>
            arr.map(u => ({ ...u, _tower_name: towers[i].name, _tower_project_id: towers[i].project_id }))
        );
    },

    /**
     * Resumo de divergências Empreendimento ↔ Comercial (somente leitura).
     * Reusa a mesma detecção do Espelho de Vendas: status/preço divergentes,
     * status não mapeáveis (Locado/Manutenção) e vínculos órfãos.
     */
    async getCommercialDivergenceSummary(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialDivergenceSummary> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.commercial_property_id).filter(Boolean) as string[];

        const snaps: Record<string, { status: string; price: number }> = {};
        if (ids.length) {
            const { data } = await supabase
                .from('commercial_properties')
                .select('id, status, price')
                .eq('organization_id', organizationId)
                .in('id', ids);
            (data || []).forEach((p: any) => { snaps[p.id] = { status: p.status, price: p.price }; });
        }

        const summary: CommercialDivergenceSummary = {
            total: units.length, published: 0, unpublished: 0,
            statusDiverge: 0, priceDiverge: 0, unmappable: 0, orphans: 0,
        };

        for (const u of units) {
            if (!u.commercial_property_id) { summary.unpublished++; continue; }
            const snap = snaps[u.commercial_property_id];
            if (!snap) { summary.orphans++; continue; } // property excluída ou de outra org
            summary.published++;
            if (UNMAPPABLE_COMMERCIAL_STATUSES.has(snap.status)) {
                summary.unmappable++;
            } else if (mapCommercialToEmpr(snap.status) !== u.status) {
                summary.statusDiverge++;
            }
            if (u.price != null && Math.abs((snap.price ?? 0) - u.price) > 0.01) summary.priceDiverge++;
        }
        return summary;
    },

    // ── Edifício-pai no Comercial (agrupa as unidades publicadas) ─────────────
    /**
     * Garante que exista um edifício-pai (commercial_properties type='BUILDING') para o
     * empreendimento e retorna seu id. Reusa o existente se já vinculado e presente;
     * senão cria e persiste o vínculo em empreendimentos.commercial_building_id.
     */
    async ensureCommercialBuilding(emp: Empreendimento, organizationId: string): Promise<string> {
        // Já vinculado e ainda existente nesta org?
        if (emp.commercial_building_id) {
            const { data } = await supabase
                .from('commercial_properties')
                .select('id')
                .eq('id', emp.commercial_building_id)
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (data?.id) return data.id;
        }

        const address = [emp.endereco_street, emp.endereco_number, emp.endereco_neighborhood, emp.endereco_city, emp.endereco_state]
            .filter(Boolean).join(', ')
            || [emp.terreno_street, emp.terreno_number, emp.terreno_city, emp.terreno_state].filter(Boolean).join(', ')
            || emp.name;

        const building = await commercialService.saveProperty({
            organization_id: organizationId,
            name: emp.name,
            type: 'BUILDING',
            purpose: 'SALE',
            address,
            area: 0,
            price: 0,
            status: 'AVAILABLE' as any,
        } as any);

        await this.update(emp.id, { commercial_building_id: building.id });
        return building.id;
    },

    /**
     * Reagrupa unidades já publicadas que estão soltas (property sem parent_id ou com
     * parent_id diferente do edifício). Retorna quantas foram reagrupadas.
     */
    async regroupCommercialUnits(empreendimentoId: string, organizationId: string, buildingId: string): Promise<number> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.commercial_property_id).filter(Boolean) as string[];
        if (!ids.length) return 0;

        const { data } = await supabase
            .from('commercial_properties')
            .select('id, parent_id, type')
            .eq('organization_id', organizationId)
            .in('id', ids);

        // Só as unidades (não o próprio building) que ainda não apontam para o edifício
        const toFix = (data || []).filter((p: any) => p.id !== buildingId && p.type !== 'BUILDING' && p.parent_id !== buildingId);
        if (!toFix.length) return 0;

        await Promise.all(toFix.map((p: any) =>
            commercialService.saveProperty({ id: p.id, parent_id: buildingId } as any)
        ));
        return toFix.length;
    },

    // ── Pavimentos template ──────────────────────────────────────────────────
    async listFloors(towerId: string): Promise<EmpreendimentoFloor[]> {
        const { data, error } = await supabase
            .from('empreendimento_floors')
            .select(FLOOR_COLS)
            .eq('tower_id', towerId)
            .order('sort_order', { ascending: true })
            .order('floor_number', { ascending: true });
        if (error) throw new Error(`Failed to fetch floors: ${error.message}`);
        return data || [];
    },

    async createFloor(floor: EmpreendimentoFloorInsert): Promise<EmpreendimentoFloor> {
        const { data, error } = await supabase
            .from('empreendimento_floors')
            .insert(floor)
            .select(FLOOR_COLS)
            .single();
        if (error) throw new Error(`Failed to create floor: ${error.message}`);
        return data;
    },

    async updateFloor(id: string, updates: EmpreendimentoFloorUpdate): Promise<EmpreendimentoFloor> {
        const { data, error } = await supabase
            .from('empreendimento_floors')
            .update(updates)
            .eq('id', id)
            .select(FLOOR_COLS)
            .single();
        if (error) throw new Error(`Failed to update floor: ${error.message}`);
        return data;
    },

    async deleteFloor(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_floors').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete floor: ${error.message}`);
    },

    async deleteUnitsByTower(towerId: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_units').delete().eq('tower_id', towerId);
        if (error) throw new Error(`Failed to delete units: ${error.message}`);
    },

    async generateUnitsFromFloors(tower: EmpreendimentoTower): Promise<EmpreendimentoUnit[]> {
        const floors = await this.listFloors(tower.id);
        if (!floors.length) throw new Error('Nenhum pavimento cadastrado para esta torre.');

        const toCreate: EmpreendimentoUnitInsert[] = [];
        for (const fl of floors) {
            const upf = fl.units_per_floor ?? tower.units_per_floor ?? 1;
            for (let rep = 0; rep < fl.repeat_count; rep++) {
                const floorNum = fl.floor_number + rep;
                const floorLabel = floorNum < 0
                    ? `SS${Math.abs(floorNum)}`
                    : floorNum === 0 ? 'TR' : String(floorNum);
                for (let u = 1; u <= upf; u++) {
                    const unitNum = String(u).padStart(2, '0');
                    const pre = fl.prefix ? `${fl.prefix}-` : '';
                    toCreate.push({
                        tower_id: tower.id,
                        floor_id: fl.id,
                        floor_tipo: fl.tipo,
                        name: `${pre}${floorLabel}${unitNum}`,
                        floor: floorNum,
                        status: 'DISPONIVEL',
                        is_vendavel: true,
                        sort_order: toCreate.length,
                    });
                }
            }
        }

        return this.bulkUpsertUnits(toCreate);
    },

    // ── Unidades ─────────────────────────────────────────────────────────────
    async listUnits(towerId: string): Promise<EmpreendimentoUnit[]> {
        const { data, error } = await supabase
            .from('empreendimento_units')
            .select(UNIT_COLS)
            .eq('tower_id', towerId)
            .order('floor', { ascending: true })
            .order('sort_order', { ascending: true });
        if (error) throw new Error(`Failed to fetch units: ${error.message}`);
        return data || [];
    },

    async bulkUpsertUnits(units: EmpreendimentoUnitInsert[]): Promise<EmpreendimentoUnit[]> {
        if (!units || units.length === 0) return [];
        const { data, error } = await supabase
            .from('empreendimento_units')
            .upsert(units, { onConflict: 'id' })
            .select(UNIT_COLS);
        if (error) throw new Error(`Failed to upsert units: ${error.message}`);
        return data || [];
    },

    async createUnit(unit: EmpreendimentoUnitInsert): Promise<EmpreendimentoUnit> {
        const { data, error } = await supabase
            .from('empreendimento_units')
            .insert(unit)
            .select(UNIT_COLS)
            .single();
        if (error) throw new Error(`Failed to create unit: ${error.message}`);
        return data;
    },

    async updateUnit(id: string, updates: EmpreendimentoUnitUpdate): Promise<EmpreendimentoUnit> {
        const { data, error } = await supabase
            .from('empreendimento_units')
            .update(updates)
            .eq('id', id)
            .select(UNIT_COLS)
            .single();
        if (error) throw new Error(`Failed to update unit: ${error.message}`);
        // Propaga campos comerciais para a property vinculada (best-effort, não bloqueia)
        if (data.commercial_property_id) {
            this.pushCommercialFieldsFromUnit(data, updates).catch(err =>
                console.error('[empreendimentoService] erro ao propagar para Comercial:', err)
            );
        }
        return data;
    },

    // Campos da unit que têm mapeamento direto para commercial_properties
    async pushCommercialFieldsFromUnit(
        unit: EmpreendimentoUnit,
        changed: EmpreendimentoUnitUpdate,
    ): Promise<void> {
        if (!unit.commercial_property_id) return;
        const propUpdate: Record<string, unknown> = {};
        if ('price'         in changed) propUpdate.price         = unit.price ?? 0;
        if ('private_area'  in changed) propUpdate.private_area  = unit.private_area;
        if ('common_area'   in changed) propUpdate.common_area   = unit.common_area;
        if ('total_area'    in changed) propUpdate.total_area    = unit.total_area;
        if ('typology'      in changed) propUpdate.typology      = unit.typology;
        if ('floor'         in changed) propUpdate.floor         = unit.floor;
        // Atributos de precificação — traduzidos PT→EN
        if ('position_type'   in changed) propUpdate.position_type   = mapPositionToCommercial(unit.position_type) ?? null;
        if ('view_type'       in changed) propUpdate.view_type       = mapViewToCommercial(unit.view_type) ?? null;
        if ('sun_orientation' in changed) propUpdate.sun_orientation = mapSunToCommercial(unit.sun_orientation) ?? null;

        // floor_tipo vive em specs (JSONB) — merge para não destruir os outros campos
        if ('floor_tipo' in changed) {
            const { data: prop } = await supabase
                .from('commercial_properties')
                .select('specs')
                .eq('id', unit.commercial_property_id)
                .single();
            propUpdate.specs = { ...(prop?.specs ?? {}), floorTipo: unit.floor_tipo };
        }

        // parking_spaces vive em specs.parkingSpaces (sem coluna direta)
        if ('parking_spaces' in changed) {
            if (propUpdate.specs) {
                (propUpdate.specs as Record<string, unknown>).parkingSpaces = unit.parking_spaces;
            } else {
                const { data: prop } = await supabase
                    .from('commercial_properties')
                    .select('specs')
                    .eq('id', unit.commercial_property_id)
                    .single();
                propUpdate.specs = { ...(prop?.specs ?? {}), parkingSpaces: unit.parking_spaces };
            }
        }

        if (!Object.keys(propUpdate).length) return;
        await supabase
            .from('commercial_properties')
            .update(propUpdate)
            .eq('id', unit.commercial_property_id);
    },

    async deleteUnit(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_units').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete unit: ${error.message}`);
    },

    // ── Áreas comuns / lazer ─────────────────────────────────────────────────
    async listCommonAreas(empreendimentoId: string): Promise<EmpreendimentoCommonArea[]> {
        const { data, error } = await supabase
            .from('empreendimento_common_areas')
            .select(COMMON_AREA_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Failed to fetch common areas: ${error.message}`);
        return data || [];
    },

    async createCommonArea(area: EmpreendimentoCommonAreaInsert): Promise<EmpreendimentoCommonArea> {
        const { data, error } = await supabase
            .from('empreendimento_common_areas')
            .insert(area)
            .select(COMMON_AREA_COLS)
            .single();
        if (error) throw new Error(`Failed to create common area: ${error.message}`);
        return data;
    },

    async upsertCommonAreas(areas: EmpreendimentoCommonAreaInsert[]): Promise<EmpreendimentoCommonArea[]> {
        if (!areas || areas.length === 0) return [];
        const { data, error } = await supabase
            .from('empreendimento_common_areas')
            .upsert(areas, { onConflict: 'id' })
            .select(COMMON_AREA_COLS);
        if (error) throw new Error(`Failed to upsert common areas: ${error.message}`);
        return data || [];
    },

    async deleteCommonArea(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_common_areas').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete common area: ${error.message}`);
    },

    // ── Sincronização com o estudo Imovib (vínculo vivo) ─────────────────────
    /** Dry-run: calcula o que seria criado/atualizado sem escrever no banco. */
    async previewSync(empreendimentoId: string): Promise<EmpreendimentoSyncReport> {
        const ctx = await loadSyncContext(empreendimentoId);
        const plan = buildSyncPlan(ctx, { overwriteCommercialState: false });
        return planToReport(plan);
    },

    /** Aplica a sincronização (merge): cria/atualiza torres, unidades e áreas comuns. */
    async syncFromStudy(
        empreendimentoId: string,
        opts?: { overwriteCommercialState?: boolean },
    ): Promise<EmpreendimentoSyncReport> {
        const ctx = await loadSyncContext(empreendimentoId);
        const plan = buildSyncPlan(ctx, { overwriteCommercialState: !!opts?.overwriteCommercialState });

        for (const bp of plan.blocks) {
            // 1. Garantir a torre
            let towerId: string;
            if (bp.existingTowerId) {
                towerId = bp.existingTowerId;
                if (Object.keys(bp.towerUpdates).length > 0) {
                    await this.updateTower(towerId, bp.towerUpdates);
                }
            } else {
                const created = await this.createTower(bp.towerInsert!);
                towerId = created.id;
            }

            // 2. Unidades da torre
            for (const u of bp.units) {
                if (u.existingUnitId) {
                    await this.updateUnit(u.existingUnitId, u.fields);
                } else {
                    await this.createUnit({ tower_id: towerId, status: 'DISPONIVEL', ...u.fields } as EmpreendimentoUnitInsert);
                }
            }
        }

        // 3. Áreas comuns novas
        for (const area of plan.commonAreasToCreate) {
            await this.createCommonArea(area);
        }

        // 4. Carimbar última sincronização
        await this.update(empreendimentoId, { last_synced_at: new Date().toISOString() });

        return planToReport(plan);
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sincronização (puros — usados por preview e apply)
// ─────────────────────────────────────────────────────────────────────────────

interface SyncContext {
    empreendimento: Empreendimento;
    study: ImovibStudy;
    instances: ImovibUnitInstance[];
    existingTowers: EmpreendimentoTower[];
    existingUnits: EmpreendimentoUnit[];
    existingCommonAreas: EmpreendimentoCommonArea[];
}

interface UnitPlan {
    existingUnitId?: string;
    fields: Partial<EmpreendimentoUnitInsert>;
    preservedCommercial?: boolean;
}

interface BlockPlan {
    existingTowerId?: string;
    towerInsert?: EmpreendimentoTowerInsert;
    towerUpdates: EmpreendimentoTowerUpdate;
    isNewTower: boolean;
    units: UnitPlan[];
}

interface SyncPlan {
    blocks: BlockPlan[];
    commonAreasToCreate: EmpreendimentoCommonAreaInsert[];
    orphanTowers: EmpreendimentoTower[];
    orphanUnits: EmpreendimentoUnit[];
    preservedUnitNames: string[];
    warnings: string[];
}

async function loadSyncContext(empreendimentoId: string): Promise<SyncContext> {
    const empreendimento = await empreendimentoService.getById(empreendimentoId) as Empreendimento | null;
    if (!empreendimento) throw new Error('Empreendimento não encontrado.');
    if (!empreendimento.imovib_study_id) {
        throw new Error('Este empreendimento não está vinculado a um estudo de viabilidade (Imovib).');
    }

    const study = await imovibService.getStudyById(empreendimento.imovib_study_id, true);
    if (!study) throw new Error('Estudo de viabilidade vinculado não foi encontrado.');

    // Blindagem multi-tenant: o estudo precisa ser da mesma organização.
    if (study.organization_id !== empreendimento.organization_id) {
        throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');
    }

    const instances = await imovibService.getUnitInstances(empreendimento.imovib_study_id);

    const existingTowers = await empreendimentoService.listTowers(empreendimentoId);
    const towerIds = existingTowers.map(t => t.id);
    let existingUnits: EmpreendimentoUnit[] = [];
    for (const tid of towerIds) {
        existingUnits = existingUnits.concat(await empreendimentoService.listUnits(tid));
    }
    const existingCommonAreas = await empreendimentoService.listCommonAreas(empreendimentoId);

    return { empreendimento, study, instances, existingTowers, existingUnits, existingCommonAreas };
}

function buildSyncPlan(ctx: SyncContext, opts: { overwriteCommercialState: boolean }): SyncPlan {
    const { empreendimento, study, instances, existingTowers, existingUnits, existingCommonAreas } = ctx;
    const blocks = study.blocks || [];

    // Mapa de tipologias (imovib_units) por id, para nome/área comum.
    const unitMetaById = new Map<string, ImovibUnit>();
    for (const b of blocks) for (const u of (b.units || [])) unitMetaById.set(u.id, u);

    const towerByBlockId = new Map<string, EmpreendimentoTower>();
    for (const t of existingTowers) if (t.imovib_block_id) towerByBlockId.set(t.imovib_block_id, t);

    const unitByInstanceId = new Map<string, EmpreendimentoUnit>();
    for (const u of existingUnits) if (u.imovib_instance_id) unitByInstanceId.set(u.imovib_instance_id, u);

    const commonAreaByName = new Set(existingCommonAreas.map(a => (a.name || '').toLowerCase()));

    const plan: SyncPlan = {
        blocks: [], commonAreasToCreate: [], orphanTowers: [], orphanUnits: [],
        preservedUnitNames: [], warnings: [],
    };

    const instancesByBlock = new Map<string, ImovibUnitInstance[]>();
    for (const inst of instances) {
        const arr = instancesByBlock.get(inst.block_id) || [];
        arr.push(inst);
        instancesByBlock.set(inst.block_id, arr);
    }

    for (const block of blocks) {
        const existingTower = towerByBlockId.get(block.id);
        const towerUpdates: EmpreendimentoTowerUpdate = {};
        if (existingTower) {
            if (existingTower.name !== block.name) towerUpdates.name = block.name;
            if (existingTower.construction_cost_sqm !== block.construction_cost_sqm) towerUpdates.construction_cost_sqm = block.construction_cost_sqm;
            if (existingTower.sales_price_sqm !== block.sales_price_sqm) towerUpdates.sales_price_sqm = block.sales_price_sqm;
        }

        const blockInstances = instancesByBlock.get(block.id) || [];
        const unitPlans: UnitPlan[] = [];

        if (blockInstances.length > 0) {
            // Instance-first: 1 unidade por instância
            for (const inst of blockInstances) {
                const meta = inst.unit_id ? unitMetaById.get(inst.unit_id) : undefined;
                const priv = inst.private_area;
                const common = meta?.common_area;
                const structural: Partial<EmpreendimentoUnitInsert> = {
                    imovib_unit_id: inst.unit_id ?? undefined,
                    imovib_instance_id: inst.id,
                    name: inst.name,
                    floor: inst.floor,
                    typology: meta?.name,
                    private_area: priv,
                    common_area: common,
                    total_area: (priv ?? 0) + (common ?? 0),
                    position_type: inst.position_type,
                    sun_orientation: inst.sun_orientation,
                    is_vendavel: true,
                };

                const existingUnit = unitByInstanceId.get(inst.id);
                if (existingUnit) {
                    // Preserva estado comercial salvo, exceto se overwrite.
                    const hasLocalCommercial = existingUnit.status !== 'DISPONIVEL'
                        || existingUnit.price != null
                        || !!existingUnit.commercial_property_id;
                    if (opts.overwriteCommercialState || !hasLocalCommercial) {
                        structural.status = translateStatus(inst.status);
                        structural.price = inst.price;
                    } else {
                        plan.preservedUnitNames.push(existingUnit.name);
                    }
                    unitPlans.push({ existingUnitId: existingUnit.id, fields: structural, preservedCommercial: hasLocalCommercial && !opts.overwriteCommercialState });
                } else {
                    structural.status = translateStatus(inst.status);
                    structural.price = inst.price;
                    unitPlans.push({ fields: structural });
                }
            }
        } else {
            // Sem instâncias: expandir tipologias só se a torre ainda não tem unidades.
            const towerHasUnits = existingTower
                ? existingUnits.some(u => u.tower_id === existingTower.id)
                : false;
            const vendaveis = (block.units || []).filter(u => u.is_vendavel !== false);
            if (!towerHasUnits && vendaveis.length > 0) {
                for (const meta of vendaveis) {
                    const qty = Math.max(1, meta.quantity || 1);
                    for (let i = 0; i < qty; i++) {
                        unitPlans.push({
                            fields: {
                                imovib_unit_id: meta.id,
                                name: `${meta.name} ${i + 1}`,
                                typology: meta.name,
                                private_area: meta.private_area,
                                common_area: meta.common_area,
                                total_area: (meta.private_area ?? 0) + (meta.common_area ?? 0),
                                is_vendavel: true,
                                status: 'DISPONIVEL',
                            },
                        });
                    }
                }
                plan.warnings.push(`Bloco "${block.name}": gerado a partir das tipologias (sem espelho de vendas). Gere as instâncias no Imovib para detalhar por pavimento/posição.`);
            } else if (towerHasUnits && vendaveis.length > 0) {
                plan.warnings.push(`Bloco "${block.name}": sem espelho de vendas no estudo e a torre já tem unidades — nada foi regenerado.`);
            }
        }

        // Áreas comuns vindas de tipologias não-vendáveis
        for (const meta of (block.units || [])) {
            if (meta.is_vendavel === false && !commonAreaByName.has((meta.name || '').toLowerCase())) {
                plan.commonAreasToCreate.push({
                    empreendimento_id: empreendimento.id,
                    name: meta.name,
                    category: inferCommonAreaCategory(meta.name),
                    area: meta.common_area || meta.private_area,
                    is_vendavel: false,
                });
                commonAreaByName.add((meta.name || '').toLowerCase());
            }
        }

        plan.blocks.push({
            existingTowerId: existingTower?.id,
            towerInsert: existingTower ? undefined : {
                empreendimento_id: empreendimento.id,
                imovib_block_id: block.id,
                name: block.name,
                construction_cost_sqm: block.construction_cost_sqm,
                sales_price_sqm: block.sales_price_sqm,
                sort_order: plan.blocks.length,
            },
            towerUpdates,
            isNewTower: !existingTower,
            units: unitPlans,
        });
    }

    // Órfãos: torres/unidades com proveniência que sumiu do estudo (nunca auto-deletar)
    const studyBlockIds = new Set(blocks.map(b => b.id));
    const studyInstanceIds = new Set(instances.map(i => i.id));
    plan.orphanTowers = existingTowers.filter(t => t.imovib_block_id && !studyBlockIds.has(t.imovib_block_id));
    plan.orphanUnits = existingUnits.filter(u => u.imovib_instance_id && !studyInstanceIds.has(u.imovib_instance_id));

    return plan;
}

function planToReport(plan: SyncPlan): EmpreendimentoSyncReport {
    let towersCreated = 0, towersUpdated = 0, unitsCreated = 0, unitsUpdated = 0;
    for (const bp of plan.blocks) {
        if (bp.isNewTower) towersCreated++;
        else if (Object.keys(bp.towerUpdates).length > 0) towersUpdated++;
        for (const u of bp.units) {
            if (u.existingUnitId) unitsUpdated++;
            else unitsCreated++;
        }
    }
    return {
        towersCreated,
        towersUpdated,
        unitsCreated,
        unitsUpdated,
        commonAreasUpserted: plan.commonAreasToCreate.length,
        orphanTowers: plan.orphanTowers,
        orphanUnits: plan.orphanUnits,
        skippedDueToLocalChanges: plan.preservedUnitNames,
        warnings: plan.warnings,
    };
}
