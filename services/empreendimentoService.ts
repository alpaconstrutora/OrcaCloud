import { supabase } from '../lib/supabase';
import { imovibService } from './imovibService';
import { commercialService } from './commercialService';
import {
    Empreendimento, EmpreendimentoInsert, EmpreendimentoUpdate, EmpreendimentoWithChildren,
    EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoTowerUpdate,
    EmpreendimentoFloor, EmpreendimentoFloorInsert, EmpreendimentoFloorUpdate,
    EmpreendimentoUnit, EmpreendimentoUnitInsert, EmpreendimentoUnitUpdate,
    EmpreendimentoCommonArea, EmpreendimentoCommonAreaInsert, EmpreendimentoSyncReport,
    EmpreendimentoRegulatoryZone, EmpreendimentoRegulatoryZoneInsert, EmpreendimentoRegulatoryZoneUpdate,
    UnitStatus,
} from '../types';
import {
    mapCommercialToEmpr, mapEmprToCommercial, mapEmprToRentalStatus, UNMAPPABLE_COMMERCIAL_STATUSES,
    mapRentalToEmpr, UNMAPPABLE_RENTAL_STATUSES,
    mapPositionToCommercial, mapViewToCommercial, mapSunToCommercial,
} from '../utils/empreendimentoComercial';
import { buildPlan, PlanOptions } from './sync/planner';
import { applyPlan } from './sync/applier';
import { loadImovibSide } from './sync/imovibAdapter';
import { SyncPlan, TargetState } from './sync/types';
import { empreendimentoProposalService } from './empreendimentoProposalService';

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

// Resultado de Empreendimento → Comercial (publicação em lote).
export interface CommercialPublishReport {
    published: number;
    alreadyPublished: number;
}

// Resultado de Comercial → Empreendimento (status de venda de volta).
export interface CommercialPullReport {
    statusUpdated: number;
    /** Unidades em Locado/Manutenção: sem equivalente em UnitStatus, nunca alteradas. */
    skippedUnmappable: number;
    unlinked: number;
}

// `translateStatus` e `inferCommonAreaCategory` mudaram para services/sync/imovibAdapter.ts
// junto com o resto da normalização da origem Imovib — eram usados só pelo planner antigo.

// Endereço do empreendimento → campos estruturados do Comercial. Fonte única: o
// PropertyModal edita/exibe street/number/neighborhood/city/state (não o texto `address`
// direto) — publicar só a string concatenada deixa esses campos vazios no Comercial.
export interface CommercialAddressFields {
    address: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
}

export const buildCommercialAddressFields = (emp: Empreendimento): CommercialAddressFields => {
    const hasEndereco = emp.endereco_street || emp.endereco_city;
    const street = hasEndereco ? emp.endereco_street : emp.terreno_street;
    const number = hasEndereco ? emp.endereco_number : emp.terreno_number;
    const neighborhood = hasEndereco ? emp.endereco_neighborhood : emp.terreno_neighborhood;
    const city = hasEndereco ? emp.endereco_city : emp.terreno_city;
    const state = hasEndereco ? emp.endereco_state : emp.terreno_state;
    const zip_code = hasEndereco ? emp.endereco_zip_code : emp.terreno_zip_code;

    const address = [street, number, neighborhood, city, state].filter(Boolean).join(', ') || emp.name;
    return { address, street, number, neighborhood, city, state, zip_code };
};

// NOTA: estas constantes precisam ser string LITERAIS (sem concatenação com +),
// senão o supabase-js infere GenericStringError em vez do tipo da linha.
const EMPREENDIMENTO_COLS = 'id, organization_id, name, code, status, tipo, imovib_study_id, planta_ai_study_id, last_synced_at, matricula, construtora, responsavel_tecnico, crea_cau, numero_processo, endereco_street, endereco_number, endereco_complement, endereco_neighborhood, endereco_city, endereco_state, endereco_zip_code, spe_razao_social, spe_cnpj, spe_nome_fantasia, terreno_street, terreno_number, terreno_complement, terreno_neighborhood, terreno_city, terreno_state, terreno_zip_code, terreno_area, terreno_frente, terreno_fundos, terreno_lateral_direita, terreno_lateral_esquerda, vgv_total, commercial_building_id, commercial_rental_building_id, developer_name, manager, launch_date, expected_delivery_date, metadata, created_at, updated_at';

const TOWER_COLS = 'id, empreendimento_id, project_id, imovib_block_id, planta_ai_scenario_id, name, floors_count, units_per_floor, construction_cost_sqm, sales_price_sqm, sort_order, created_at, updated_at';

const FLOOR_COLS = 'id, tower_id, name, tipo, floor_number, repeat_count, units_per_floor, prefix, sort_order, created_at, updated_at';

const UNIT_COLS = 'id, tower_id, floor_id, floor_tipo, imovib_unit_id, imovib_instance_id, planta_ai_unit_id, name, floor, typology, private_area, common_area, total_area, bedrooms, bathrooms, parking_spaces, position_type, sun_orientation, view_type, price, status, rental_price, rental_status, is_vendavel, commercial_property_id, rental_property_id, sort_order, fracao_ideal_decimal, fracao_ideal_thousandths, area_real_total_m2, area_engine_version_id, area_engine_synced_at, created_at, updated_at';

const COMMON_AREA_COLS = 'id, empreendimento_id, tower_id, name, category, area, floor, description, is_vendavel, sort_order, created_at, updated_at';

const REGULATORY_ZONE_COLS = 'id, empreendimento_id, organization_id, macroarea, zona, ca_minimo, ca_basico, ca_maximo, taxa_ocupacao_maxima, taxa_permeabilidade_minima, gabarito_altura_maxima, uso_permitido, recuo_frente, recuo_fundos, recuo_lateral_direita, recuo_lateral_esquerda, gabarito_pavimentos, regra_vagas, vagas_por_unidade, area_minima_unidade, lei_referencia, documento_fonte, nivel_confianca, observacoes, sort_order, created_at, updated_at';

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

        // Propaga renomeação para os edifícios-pai no Comercial — venda e locação (best-effort)
        const buildingIds = [data.commercial_building_id, data.commercial_rental_building_id].filter(Boolean) as string[];
        if (updates.name && buildingIds.length) {
            await supabase
                .from('commercial_properties')
                .update({ name: updates.name })
                .in('id', buildingIds);
        }

        // Propaga mudança de endereço para o edifício-pai + todas as unidades já
        // publicadas (best-effort — nunca bloqueia o save do empreendimento). Antes só
        // existia via botão manual "Sync Endereço", que também não tocava o próprio
        // edifício-pai, só as unidades.
        const ADDRESS_FIELDS: (keyof EmpreendimentoUpdate)[] = [
            'endereco_street', 'endereco_number', 'endereco_complement', 'endereco_neighborhood',
            'endereco_city', 'endereco_state', 'endereco_zip_code',
            'terreno_street', 'terreno_number', 'terreno_neighborhood', 'terreno_city', 'terreno_state', 'terreno_zip_code',
        ];
        if (buildingIds.length && ADDRESS_FIELDS.some(f => f in updates)) {
            try {
                const addressFields = buildCommercialAddressFields(data);
                const units = await this.listAllUnitsForEmpreendimento(id);
                // Edifícios-pai (venda + locação) e todas as unidades vinculadas em qualquer
                // dos dois canais recebem o novo endereço.
                const targetIds = [
                    ...buildingIds,
                    ...units.map(u => u.commercial_property_id).filter(Boolean) as string[],
                    ...units.map(u => u.rental_property_id).filter(Boolean) as string[],
                ];
                if (targetIds.length) {
                    await supabase
                        .from('commercial_properties')
                        .update(addressFields)
                        .in('id', targetIds);
                }
            } catch (err) {
                console.error('[empreendimentoService] erro ao propagar endereço para o Comercial:', err);
            }
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

    // ── Empreendimento ⇄ Comercial em lote ────────────────────────────────────
    // Extraídos de EspelhoVendasTab (eram funções locais do componente, com window.confirm
    // e alert embutidos) para que o Centro de Sincronização também possa dispará-los. A
    // confirmação e o aviso ficam na UI; aqui só a operação + relatório.

    /** Empreendimento → Comercial: publica as unidades ainda não vinculadas. */
    async publishAllToCommercial(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialPublishReport> {
        const emp = await this.getById(empreendimentoId) as Empreendimento | null;
        if (!emp) throw new Error('Empreendimento não encontrado.');

        // Revalida no banco: o estado da tela pode estar obsoleto e recriaria properties
        // duplicadas para unidades já publicadas.
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const unpublished = units.filter(u => !u.commercial_property_id);
        if (!unpublished.length) {
            return { published: 0, alreadyPublished: units.length };
        }

        const buildingId = await this.ensureCommercialBuilding(emp, organizationId);
        const addressFields = buildCommercialAddressFields(emp);

        for (const unit of unpublished) {
            const prop = await commercialService.saveProperty({
                organization_id: organizationId,
                name: unit.name,
                type: 'APARTMENT',
                purpose: 'SALE',
                parent_id: buildingId,
                ...addressFields,
                price: unit.price ?? 0,
                private_area: unit.private_area,
                common_area: unit.common_area,
                total_area: unit.total_area,
                status: mapEmprToCommercial(unit.status),
                floor: unit.floor,
                typology: unit.typology || undefined,
                block: unit._tower_name,
                project_id: unit._tower_project_id || undefined,
                position_type: mapPositionToCommercial(unit.position_type),
                view_type: mapViewToCommercial(unit.view_type),
                sun_orientation: mapSunToCommercial(unit.sun_orientation),
                specs: {
                    parkingSpaces: unit.parking_spaces,
                    bedrooms: unit.bedrooms,
                    bathrooms: unit.bathrooms,
                    ...(unit.floor_tipo ? { floorTipo: unit.floor_tipo } : {}),
                },
            } as any);
            await this.updateUnit(unit.id, { commercial_property_id: prop.id });
        }

        return { published: unpublished.length, alreadyPublished: units.length - unpublished.length };
    },

    /**
     * Comercial → Empreendimento: traz o status de venda das properties de volta às unidades.
     * A venda acontece no Comercial (propostas/portal do corretor), então ali é a fonte do
     * status. Locado/Manutenção não têm equivalente em UnitStatus e são pulados — nunca
     * traduzir silenciosamente (ver mapCommercialToEmpr, que devolve null nesses casos).
     */
    async pullStatusFromCommercial(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialPullReport> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.commercial_property_id).filter(Boolean) as string[];
        const report: CommercialPullReport = { statusUpdated: 0, skippedUnmappable: 0, unlinked: 0 };
        if (!ids.length) {
            report.unlinked = units.length;
            return report;
        }

        const { data, error } = await supabase
            .from('commercial_properties')
            .select('id, status')
            .eq('organization_id', organizationId)
            .in('id', ids);
        if (error) throw new Error(`Falha ao ler o Comercial: ${error.message}`);
        const snaps: Record<string, string> = {};
        (data || []).forEach((p: any) => { snaps[p.id] = p.status; });

        const updates: Promise<unknown>[] = [];
        for (const u of units) {
            if (!u.commercial_property_id) { report.unlinked++; continue; }
            const status = snaps[u.commercial_property_id];
            if (!status) continue; // property sumiu — órfã, tratada no Espelho de Vendas
            if (UNMAPPABLE_COMMERCIAL_STATUSES.has(status)) { report.skippedUnmappable++; continue; }
            const mapped = mapCommercialToEmpr(status);
            if (mapped && mapped !== u.status) {
                updates.push(this.updateUnit(u.id, { status: mapped }));
                report.statusUpdated++;
            }
        }
        await Promise.all(updates);
        return report;
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

        const addressFields = buildCommercialAddressFields(emp);

        const building = await commercialService.saveProperty({
            organization_id: organizationId,
            name: emp.name,
            type: 'BUILDING',
            purpose: 'SALE',
            ...addressFields,
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

    // ══════════════════════════════════════════════════════════════════════════
    // Empreendimento ⇄ Locações — espelho da ponte de Vendas, num eixo próprio.
    // Vínculo por `rental_property_id` (não `commercial_property_id`), edifício-pai
    // por `commercial_rental_building_id`, properties com purpose='RENTAL'. Uma
    // unidade pode estar publicada em Vendas e em Locações ao mesmo tempo, sem
    // que um status contamine o outro — por isso o eixo de locação tem colunas
    // próprias: `rental_status` (ocupação) e `rental_price` (aluguel-alvo), que o
    // pull de Vendas nunca toca. Ver migration 20270815000003.
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Garante o edifício-pai de LOCAÇÃO (commercial_properties type='BUILDING',
     * purpose='RENTAL') para o empreendimento e retorna seu id. Reusa o existente
     * se já vinculado e presente; senão cria e persiste em
     * empreendimentos.commercial_rental_building_id.
     */
    async ensureCommercialRentalBuilding(emp: Empreendimento, organizationId: string): Promise<string> {
        if (emp.commercial_rental_building_id) {
            const { data } = await supabase
                .from('commercial_properties')
                .select('id')
                .eq('id', emp.commercial_rental_building_id)
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (data?.id) return data.id;
        }

        const addressFields = buildCommercialAddressFields(emp);

        const building = await commercialService.saveProperty({
            organization_id: organizationId,
            name: emp.name,
            type: 'BUILDING',
            purpose: 'RENTAL',
            ...addressFields,
            area: 0,
            price: 0,
            status: 'AVAILABLE' as any,
        } as any);

        await this.update(emp.id, { commercial_rental_building_id: building.id });
        return building.id;
    },

    /** Empreendimento → Locações: publica as unidades ainda não vinculadas ao aluguel. */
    async publishAllToRental(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialPublishReport> {
        const emp = await this.getById(empreendimentoId) as Empreendimento | null;
        if (!emp) throw new Error('Empreendimento não encontrado.');

        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const unpublished = units.filter(u => !u.rental_property_id);
        if (!unpublished.length) {
            return { published: 0, alreadyPublished: units.length };
        }

        const buildingId = await this.ensureCommercialRentalBuilding(emp, organizationId);
        const addressFields = buildCommercialAddressFields(emp);

        for (const unit of unpublished) {
            const prop = await commercialService.saveProperty({
                organization_id: organizationId,
                name: unit.name,
                type: 'APARTMENT',
                purpose: 'RENTAL',
                parent_id: buildingId,
                ...addressFields,
                // Aluguel-alvo definido no Empreendimento (rental_price). NUNCA `price`,
                // que é o VGV/preço de venda — grandezas diferentes (mensal × total).
                price: unit.rental_price ?? 0,
                private_area: unit.private_area,
                common_area: unit.common_area,
                total_area: unit.total_area,
                status: mapEmprToRentalStatus(unit.rental_status ?? 'DISPONIVEL'),
                floor: unit.floor,
                typology: unit.typology || undefined,
                block: unit._tower_name,
                project_id: unit._tower_project_id || undefined,
                position_type: mapPositionToCommercial(unit.position_type),
                view_type: mapViewToCommercial(unit.view_type),
                sun_orientation: mapSunToCommercial(unit.sun_orientation),
                specs: {
                    parkingSpaces: unit.parking_spaces,
                    bedrooms: unit.bedrooms,
                    bathrooms: unit.bathrooms,
                    ...(unit.floor_tipo ? { floorTipo: unit.floor_tipo } : {}),
                },
            } as any);
            await this.updateUnit(unit.id, { rental_property_id: prop.id });
        }

        return { published: unpublished.length, alreadyPublished: units.length - unpublished.length };
    },

    /**
     * Reagrupa unidades publicadas p/ locação que estão soltas (property sem
     * parent_id ou com parent_id diferente do edifício de locação). Retorna quantas.
     */
    async regroupRentalUnits(empreendimentoId: string, organizationId: string, buildingId: string): Promise<number> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.rental_property_id).filter(Boolean) as string[];
        if (!ids.length) return 0;

        const { data } = await supabase
            .from('commercial_properties')
            .select('id, parent_id, type')
            .eq('organization_id', organizationId)
            .in('id', ids);

        const toFix = (data || []).filter((p: any) => p.id !== buildingId && p.type !== 'BUILDING' && p.parent_id !== buildingId);
        if (!toFix.length) return 0;

        await Promise.all(toFix.map((p: any) =>
            commercialService.saveProperty({ id: p.id, parent_id: buildingId } as any)
        ));
        return toFix.length;
    },

    /**
     * Resumo de divergências Empreendimento ↔ Locações (somente leitura).
     * Espelho de getCommercialDivergenceSummary, no eixo de aluguel: compara
     * rental_status/rental_price em vez de status/price.
     */
    async getRentalDivergenceSummary(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialDivergenceSummary> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.rental_property_id).filter(Boolean) as string[];

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
            if (!u.rental_property_id) { summary.unpublished++; continue; }
            const snap = snaps[u.rental_property_id];
            if (!snap) { summary.orphans++; continue; } // property excluída ou de outra org
            summary.published++;
            if (UNMAPPABLE_RENTAL_STATUSES.has(snap.status)) {
                summary.unmappable++;
            } else if (mapRentalToEmpr(snap.status) !== (u.rental_status ?? 'DISPONIVEL')) {
                summary.statusDiverge++;
            }
            if (u.rental_price != null && Math.abs((snap.price ?? 0) - u.rental_price) > 0.01) summary.priceDiverge++;
        }
        return summary;
    },

    /**
     * Locações → Empreendimento: traz a ocupação das properties de volta às unidades.
     * A locação acontece no módulo de Locações (contratos/negócios), então ali é a
     * fonte do status. Grava SEMPRE em `rental_status` — nunca em `status`, que é o
     * eixo de venda. Vendido/Permutado não têm equivalente no aluguel e são pulados
     * (ver mapRentalToEmpr, que devolve null nesses casos).
     */
    async pullStatusFromRental(
        empreendimentoId: string,
        organizationId: string,
    ): Promise<CommercialPullReport> {
        const units = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const ids = units.map(u => u.rental_property_id).filter(Boolean) as string[];
        const report: CommercialPullReport = { statusUpdated: 0, skippedUnmappable: 0, unlinked: 0 };
        if (!ids.length) {
            report.unlinked = units.length;
            return report;
        }

        const { data, error } = await supabase
            .from('commercial_properties')
            .select('id, status')
            .eq('organization_id', organizationId)
            .in('id', ids);
        if (error) throw new Error(`Falha ao ler Locações: ${error.message}`);
        const snaps: Record<string, string> = {};
        (data || []).forEach((p: any) => { snaps[p.id] = p.status; });

        const updates: Promise<unknown>[] = [];
        for (const u of units) {
            if (!u.rental_property_id) { report.unlinked++; continue; }
            const status = snaps[u.rental_property_id];
            if (!status) continue; // property sumiu — órfã, tratada no Espelho de Locações
            if (UNMAPPABLE_RENTAL_STATUSES.has(status)) { report.skippedUnmappable++; continue; }
            const mapped = mapRentalToEmpr(status);
            if (mapped && mapped !== (u.rental_status ?? 'DISPONIVEL')) {
                updates.push(this.updateUnit(u.id, { rental_status: mapped }));
                report.statusUpdated++;
            }
        }
        await Promise.all(updates);
        return report;
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
        if ('name'          in changed) propUpdate.name          = unit.name;
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

        // floor_tipo/parking_spaces/bedrooms/bathrooms vivem em specs (JSONB) — o
        // PropertyModal lê specs.bedrooms/specs.bathrooms, não a coluna top-level.
        // Merge para não destruir os outros campos já salvos em specs.
        const specsChanged = ['floor_tipo', 'parking_spaces', 'bedrooms', 'bathrooms'].some(f => f in changed);
        if (specsChanged) {
            const { data: prop } = await supabase
                .from('commercial_properties')
                .select('specs')
                .eq('id', unit.commercial_property_id)
                .single();
            const specs: Record<string, unknown> = { ...(prop?.specs ?? {}) };
            if ('floor_tipo'      in changed) specs.floorTipo      = unit.floor_tipo;
            if ('parking_spaces'  in changed) specs.parkingSpaces  = unit.parking_spaces;
            if ('bedrooms'        in changed) specs.bedrooms       = unit.bedrooms;
            if ('bathrooms'       in changed) specs.bathrooms      = unit.bathrooms;
            propUpdate.specs = specs;
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

    // ── Mapa Regulatório (mora no empreendimento — fonte única) ───────────────
    async listRegulatoryZones(empreendimentoId: string): Promise<EmpreendimentoRegulatoryZone[]> {
        const { data, error } = await supabase
            .from('empreendimento_regulatory_zones')
            .select(REGULATORY_ZONE_COLS)
            .eq('empreendimento_id', empreendimentoId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw new Error(`Falha ao carregar zonas regulatórias: ${error.message}`);
        return data || [];
    },

    /** Zonas do empreendimento vinculado a um estudo Imovib — usado pelos cálculos da
     *  Viabilidade (Potencial Construtivo, CAPEX, Viabilidade Estática). Sem empreendimento
     *  vinculado, retorna [] (fonte única: o regulatório mora no empreendimento). */
    async listRegulatoryZonesByImovibStudy(imovibStudyId: string): Promise<EmpreendimentoRegulatoryZone[]> {
        const { data: emp, error: empErr } = await supabase
            .from('empreendimentos').select('id').eq('imovib_study_id', imovibStudyId).maybeSingle();
        if (empErr) throw new Error(`Falha ao resolver empreendimento do estudo: ${empErr.message}`);
        if (!emp) return [];
        return this.listRegulatoryZones(emp.id);
    },

    /** Mesma coisa, pelo vínculo com um estudo da Planta IA — usado pelo motor de geração de
     *  cenários (aba "Regras" foi removida: os campos eram 100% duplicados do Mapa Regulatório,
     *  achado do usuário em 2026-07-17). Sem empreendimento vinculado, [] — sem regras, sem gerar. */
    async listRegulatoryZonesByPlantaStudy(plantaAiStudyId: string): Promise<EmpreendimentoRegulatoryZone[]> {
        const { data: emp, error: empErr } = await supabase
            .from('empreendimentos').select('id').eq('planta_ai_study_id', plantaAiStudyId).maybeSingle();
        if (empErr) throw new Error(`Falha ao resolver empreendimento do estudo: ${empErr.message}`);
        if (!emp) return [];
        return this.listRegulatoryZones(emp.id);
    },

    async createRegulatoryZone(zone: EmpreendimentoRegulatoryZoneInsert): Promise<EmpreendimentoRegulatoryZone> {
        const { data, error } = await supabase
            .from('empreendimento_regulatory_zones').insert(zone).select(REGULATORY_ZONE_COLS).single();
        if (error) throw new Error(`Falha ao criar zona regulatória: ${error.message}`);
        return data;
    },

    async updateRegulatoryZone(id: string, updates: EmpreendimentoRegulatoryZoneUpdate): Promise<void> {
        const { error } = await supabase.from('empreendimento_regulatory_zones').update(updates).eq('id', id);
        if (error) throw new Error(`Falha ao atualizar zona regulatória: ${error.message}`);
    },

    async deleteRegulatoryZone(id: string): Promise<void> {
        const { error } = await supabase.from('empreendimento_regulatory_zones').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir zona regulatória: ${error.message}`);
    },

    // ── Sincronização com o estudo Imovib (vínculo vivo) ─────────────────────
    //
    // O motor vive em services/sync/ e é compartilhado com o Planta IA. Aqui ficam só os
    // wrappers que preservam a assinatura pública destes métodos.

    /** Dry-run: calcula o que seria criado/atualizado sem escrever no banco. */
    async previewSync(empreendimentoId: string): Promise<EmpreendimentoSyncReport> {
        const { plan } = await planImovibSync(empreendimentoId, { overwriteCommercialState: false });
        return planToReport(plan);
    },

    /**
     * Aplica a sincronização: cria torres/unidades/áreas, preenche vazios e adota vínculos.
     * Conflitos NÃO sobrescrevem o Empreendimento — viram propostas de curadoria.
     */
    async syncFromStudy(
        empreendimentoId: string,
        opts?: { overwriteCommercialState?: boolean },
    ): Promise<EmpreendimentoSyncReport> {
        const { plan, organizationId } = await planImovibSync(empreendimentoId, {
            overwriteCommercialState: !!opts?.overwriteCommercialState,
        });
        // Materializa antes de aplicar: se a curadoria não estiver disponível (migration não
        // aplicada), falha aqui, sem ter escrito creates/fills parciais.
        await empreendimentoProposalService.materializeConflicts(empreendimentoId, organizationId, plan.conflicts);
        await applyPlan(plan);
        return planToReport(plan);
    },

    // ── Escrita reversa: Empreendimento → Viabilidade (Imovib) ───────────────
    // Vive em services/sync/writeBackImovib.ts: previewWriteBackImovib / applyWriteBackImovib.
    // Além de atualizar instâncias vinculadas, CRIA no estudo bloco/instância que só existem
    // no empreendimento (o empreendimento é a fonte). Só estrutura — nunca preço/status.
};

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização — cola entre o serviço e o motor em services/sync/
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estado atual do Empreendimento (o destino). Exportado porque o plantaEmpreendimentoSync
 * precisa exatamente do mesmo carregamento — é o "target" das duas arestas de entrada.
 */
export async function loadTargetState(empreendimentoId: string): Promise<TargetState> {
    const towers = await empreendimentoService.listTowers(empreendimentoId);
    let units: EmpreendimentoUnit[] = [];
    for (const t of towers) {
        units = units.concat(await empreendimentoService.listUnits(t.id));
    }
    const commonAreas = await empreendimentoService.listCommonAreas(empreendimentoId);
    return { towers, units, commonAreas };
}

async function planImovibSync(empreendimentoId: string, opts: PlanOptions): Promise<{ plan: SyncPlan; organizationId: string }> {
    const empreendimento = await empreendimentoService.getById(empreendimentoId) as Empreendimento | null;
    if (!empreendimento) throw new Error('Empreendimento não encontrado.');
    const [side, target] = await Promise.all([
        loadImovibSide(empreendimento),
        loadTargetState(empreendimentoId),
    ]);
    return { plan: buildPlan(side, target, opts), organizationId: empreendimento.organization_id };
}

/** Traduz o plano para o relatório que a UI já conhece (contadores). */
function planToReport(plan: SyncPlan): EmpreendimentoSyncReport {
    const touched = new Set([...plan.fills, ...plan.conflicts].map(c => `${c.entity}|${c.entityId}`));
    const countTouched = (entity: 'tower' | 'unit') =>
        [...touched].filter(k => k.startsWith(`${entity}|`)).length;

    return {
        towersCreated: plan.towerCreates.length,
        // "Atualizado" = tem pelo menos um campo divergindo de fato. Antes, toda unidade com
        // proveniência entrava na conta, mesmo idêntica ao estudo — era a origem dos números
        // inflados de divergência na tela.
        towersUpdated: countTouched('tower'),
        unitsCreated: plan.towerCreates.reduce((s, tc) => s + tc.units.length, 0) + plan.unitCreates.length,
        unitsUpdated: countTouched('unit'),
        commonAreasUpserted: plan.commonAreaCreates.length,
        orphanTowers: plan.orphanTowers,
        orphanUnits: plan.orphanUnits,
        skippedDueToLocalChanges: plan.preservedUnitNames,
        warnings: plan.warnings,
    };
}

