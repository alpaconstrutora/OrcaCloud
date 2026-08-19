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
import { empreendimentoAuditService } from './empreendimentoAuditService';

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

// Empreendimento resolvido a partir de um imóvel do Comercial — ver
// mapPropertiesToEmpreendimentos.
export interface EmpreendimentoPropertyLink {
    id: string;
    name: string;
    /** Só quando o imóvel é uma unidade de torre nomeada. */
    towerName?: string;
    /** Obra do vínculo (torre tem precedência sobre o empreendimento). */
    projectId?: string;
    /** true = o imóvel é o EDIFÍCIO-pai do empreendimento, não uma unidade. */
    isBuilding?: boolean;
}

// Contagem do que a duplicação copiou — ver copyStructure.
export interface EmpreendimentoCopyReport {
    towers: number;
    floors: number;
    units: number;
    commonAreas: number;
}

// Um empreendimento com unidade(s) apontando para commercial_property_id/
// rental_property_id que não existe(m) mais — ver getOrphanLinksSummary.
export interface EmpreendimentoOrphanSummary {
    empreendimentoId: string;
    empreendimentoName: string;
    commercialOrphans: number;
    rentalOrphans: number;
}

// Resultado de Empreendimento → Comercial (publicação em lote).
export interface CommercialPublishReport {
    /** Properties criadas no Comercial (unidade sem vínculo vivo). */
    published: number;
    /** Properties já existentes sobrescritas — publicar de novo nunca duplica. */
    updated: number;
    /** @deprecated mesmo número de `updated`; mantido pelos consumidores antigos. */
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
const EMPREENDIMENTO_COLS = 'id, organization_id, company_id, name, code, status, tipo, imovib_study_id, planta_ai_study_id, project_id, last_synced_at, matricula, construtora, responsavel_tecnico, crea_cau, numero_processo, endereco_street, endereco_number, endereco_complement, endereco_neighborhood, endereco_city, endereco_state, endereco_zip_code, spe_razao_social, spe_cnpj, spe_nome_fantasia, condominio_cnpj, condominio_razao_social, condominio_instalado_em, sindico_client_id, sindico_mandato_inicio, sindico_mandato_fim, terreno_street, terreno_number, terreno_complement, terreno_neighborhood, terreno_city, terreno_state, terreno_zip_code, terreno_area, terreno_tipo, terreno_frente, terreno_fundos, terreno_profundidade, terreno_lateral_direita, terreno_lateral_esquerda, vgv_total, commercial_building_id, commercial_rental_building_id, developer_name, manager, launch_date, expected_delivery_date, metadata, created_at, updated_at';

const TOWER_COLS = 'id, empreendimento_id, project_id, imovib_block_id, planta_ai_scenario_id, name, floors_count, units_per_floor, construction_cost_sqm, sales_price_sqm, sort_order, created_at, updated_at';

const FLOOR_COLS = 'id, tower_id, name, tipo, floor_number, repeat_count, units_per_floor, prefix, sort_order, created_at, updated_at';

const UNIT_COLS = 'id, tower_id, floor_id, floor_tipo, imovib_unit_id, imovib_instance_id, planta_ai_unit_id, name, floor, typology, private_area, common_area, total_area, bedrooms, bathrooms, suites, parking_spaces, position_type, sun_orientation, view_type, price, status, rental_price, rental_status, is_vendavel, commercial_property_id, rental_property_id, sort_order, fracao_ideal_decimal, fracao_ideal_thousandths, fracao_ideal_origem, fracao_ideal_fonte, fracao_ideal_transcrita_em, area_real_total_m2, area_engine_version_id, area_engine_synced_at, created_at, updated_at';

const COMMON_AREA_COLS = 'id, empreendimento_id, tower_id, name, category, area, floor, description, is_vendavel, sort_order, created_at, updated_at';

const REGULATORY_ZONE_COLS = 'id, empreendimento_id, organization_id, macroarea, zona, ca_minimo, ca_basico, ca_maximo, taxa_ocupacao_maxima, taxa_permeabilidade_minima, gabarito_altura_maxima, uso_permitido, recuo_frente, recuo_fundos, recuo_lateral_direita, recuo_lateral_esquerda, gabarito_pavimentos, regra_vagas, vagas_por_unidade, area_minima_unidade, lei_referencia, documento_fonte, nivel_confianca, observacoes, sort_order, created_at, updated_at';

// ── Contexto para a trilha de auditoria ──────────────────────────────────────
// Torre/pavimento/unidade não carregam `empreendimento_id`: o histórico precisa
// subir a cadeia unidade → torre → empreendimento. Com cache, porque senão cada
// evento vira mais um round-trip (e um lote vira N).

interface AuditContext {
    empreendimentoId: string | null;
    organizationId: string | null;
    towerName: string | null;
}

const NO_CONTEXT: AuditContext = { empreendimentoId: null, organizationId: null, towerName: null };
const towerContextCache = new Map<string, AuditContext>();

async function towerContext(towerId: string | null | undefined): Promise<AuditContext> {
    if (!towerId) return NO_CONTEXT;
    const cached = towerContextCache.get(towerId);
    if (cached) return cached;
    try {
        const { data } = await supabase
            .from('empreendimento_towers')
            .select('name, empreendimento_id, empreendimentos!inner(organization_id)')
            .eq('id', towerId)
            .maybeSingle();
        if (!data) return NO_CONTEXT;
        const emp = (data as any).empreendimentos;
        const ctx: AuditContext = {
            empreendimentoId: (data as any).empreendimento_id ?? null,
            organizationId: (Array.isArray(emp) ? emp[0]?.organization_id : emp?.organization_id) ?? null,
            towerName: (data as any).name ?? null,
        };
        towerContextCache.set(towerId, ctx);
        return ctx;
    } catch {
        return NO_CONTEXT;
    }
}

/** Contexto a partir de um pavimento (sobe para a torre). */
async function floorContext(floorId: string): Promise<AuditContext & { floorName: string | null }> {
    try {
        const { data } = await supabase
            .from('empreendimento_floors')
            .select('name, tower_id')
            .eq('id', floorId)
            .maybeSingle();
        if (!data) return { ...NO_CONTEXT, floorName: null };
        const ctx = await towerContext((data as any).tower_id);
        return { ...ctx, floorName: (data as any).name ?? null };
    } catch {
        return { ...NO_CONTEXT, floorName: null };
    }
}

/** Contexto a partir de uma unidade (sobe para a torre). */
async function unitContext(unitId: string): Promise<AuditContext & { unitName: string | null }> {
    try {
        const { data } = await supabase
            .from('empreendimento_units')
            .select('name, tower_id')
            .eq('id', unitId)
            .maybeSingle();
        if (!data) return { ...NO_CONTEXT, unitName: null };
        const ctx = await towerContext((data as any).tower_id);
        return { ...ctx, unitName: (data as any).name ?? null };
    } catch {
        return { ...NO_CONTEXT, unitName: null };
    }
}

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

    /**
     * Mapa obra (`projects.id`) → empreendimento a que ela pertence.
     *
     * O vínculo mora nos DOIS sentidos do módulo: `empreendimentos.project_id` (obra
     * principal) e `empreendimento_towers.project_id` (obra por torre, multi-torre).
     * Uma obra só aparece uma vez — o vínculo principal tem precedência.
     *
     * Nenhuma das colunas tem FK (DDL deadlocka no módulo), então a obra apontada pode
     * nem existir mais; quem consome deve tratar o id ausente, não confiar no mapa.
     */
    async mapObrasToEmpreendimentos(
        organizationId?: string | null,
    ): Promise<Record<string, { id: string; name: string; towerName?: string }>> {
        // organizationId ausente = "Todas as organizações": não filtra, deixa a RLS
        // recortar pelas orgs do usuário (CLAUDE.md regra #5).
        let query = supabase
            .from('empreendimentos')
            .select('id, name, project_id')
            .order('name');
        if (organizationId) query = query.eq('organization_id', organizationId);

        const { data: emps, error } = await query;
        if (error) throw new Error(`Failed to map obras to empreendimentos: ${error.message}`);

        const list = (emps || []) as { id: string; name: string; project_id: string | null }[];
        const map: Record<string, { id: string; name: string; towerName?: string }> = {};
        if (list.length === 0) return map;

        // Torres primeiro: assim o vínculo principal sobrescreve e vira o que prevalece.
        const { data: towers } = await supabase
            .from('empreendimento_towers')
            .select('name, project_id, empreendimento_id')
            .in('empreendimento_id', list.map(e => e.id))
            .not('project_id', 'is', null);

        const byId = new Map(list.map(e => [e.id, e]));
        for (const t of (towers || []) as { name: string; project_id: string; empreendimento_id: string }[]) {
            const emp = byId.get(t.empreendimento_id);
            if (emp) map[t.project_id] = { id: emp.id, name: emp.name, towerName: t.name };
        }
        for (const e of list) {
            if (e.project_id) map[e.project_id] = { id: e.id, name: e.name };
        }
        return map;
    },

    /**
     * Imóvel do Comercial (`commercial_properties.id`) → empreendimento. É o
     * espelho de `mapObrasToEmpreendimentos` para as telas cuja chave é o imóvel
     * (Venda de Ativos, Gestão de Locações), não a obra.
     *
     * Lê a view `vw_unit_property_map` (migration 20270842000000, `security_invoker=on`),
     * que já resolve unidade → torre → empreendimento numa consulta só — em vez da
     * cadeia manual de 4 queries.
     *
     * `purpose` recorta o eixo: 'SALE' usa `commercial_property_id`, 'RENTAL' usa
     * `rental_property_id`. Omitido, traz os dois.
     *
     * Cobre também o EDIFÍCIO-pai (o modo mestre das duas telas): edifício não é
     * unidade, então não está na view — vem de
     * `empreendimentos.commercial_building_id`/`commercial_rental_building_id`.
     */
    async mapPropertiesToEmpreendimentos(
        organizationId?: string | null,
        purpose?: 'SALE' | 'RENTAL',
    ): Promise<Record<string, EmpreendimentoPropertyLink>> {
        const map: Record<string, EmpreendimentoPropertyLink> = {};

        // organizationId ausente = "Todas as organizações": não filtra, a RLS recorta
        // (CLAUDE.md regra #5).
        let unitsQuery = supabase
            .from('vw_unit_property_map')
            .select('property_id, purpose, empreendimento_id, empreendimento_name, tower_name, project_id');
        if (organizationId) unitsQuery = unitsQuery.eq('organization_id', organizationId);
        if (purpose) unitsQuery = unitsQuery.eq('purpose', purpose);

        const { data: rows, error } = await unitsQuery;
        if (error) throw new Error(`Failed to map properties to empreendimentos: ${error.message}`);

        for (const r of (rows || []) as {
            property_id: string; empreendimento_id: string; empreendimento_name: string;
            tower_name: string | null; project_id: string | null;
        }[]) {
            if (!r.property_id) continue;
            map[r.property_id] = {
                id: r.empreendimento_id,
                name: r.empreendimento_name,
                towerName: r.tower_name ?? undefined,
                projectId: r.project_id ?? undefined,
            };
        }

        // Edifícios-pai. Uma linha por empreendimento, então é uma consulta barata.
        let buildingsQuery = supabase
            .from('empreendimentos')
            .select('id, name, commercial_building_id, commercial_rental_building_id, project_id');
        if (organizationId) buildingsQuery = buildingsQuery.eq('organization_id', organizationId);

        const { data: emps } = await buildingsQuery;
        for (const e of (emps || []) as {
            id: string; name: string; commercial_building_id: string | null;
            commercial_rental_building_id: string | null; project_id: string | null;
        }[]) {
            const entry = { id: e.id, name: e.name, projectId: e.project_id ?? undefined, isBuilding: true };
            if (purpose !== 'RENTAL' && e.commercial_building_id) map[e.commercial_building_id] = entry;
            if (purpose !== 'SALE' && e.commercial_rental_building_id) map[e.commercial_rental_building_id] = entry;
        }

        return map;
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

        await empreendimentoAuditService.record({
            empreendimentoId: created.id,
            organizationId: created.organization_id,
            entityType: 'empreendimento',
            entityId: created.id,
            entityLabel: created.name,
            action: 'create',
        });

        return created;
    },

    /**
     * Copia a ESTRUTURA de um empreendimento para outro já criado — torres,
     * pavimentos, unidades e áreas comuns. Usado pelo "Duplicar" da lista, depois
     * que o usuário confere o cadastro no formulário e salva.
     *
     * A cópia nasce SEM vínculo nenhum: não leva `project_id` da torre,
     * proveniência de estudo (`imovib_*`/`planta_ai_*`) nem as pontes com o
     * Comercial/Locações (`commercial_property_id`/`rental_property_id`). As
     * unidades entram DISPONIVEL nos dois eixos — copiar um "VENDIDO" para um
     * empreendimento que ainda não existe comercialmente seria dado falso.
     */
    async copyStructure(sourceId: string, targetId: string): Promise<EmpreendimentoCopyReport> {
        const report: EmpreendimentoCopyReport = { towers: 0, floors: 0, units: 0, commonAreas: 0 };

        const sourceTowers = await this.listTowers(sourceId);
        const towerIdMap = new Map<string, string>();

        for (const tower of sourceTowers) {
            const created = await this.createTower({
                empreendimento_id: targetId,
                name: tower.name,
                floors_count: tower.floors_count,
                units_per_floor: tower.units_per_floor,
                construction_cost_sqm: tower.construction_cost_sqm,
                sales_price_sqm: tower.sales_price_sqm,
                sort_order: tower.sort_order,
                // project_id / imovib_block_id / planta_ai_scenario_id ficam de fora
                // de propósito: vínculo e proveniência não se duplicam.
            });
            towerIdMap.set(tower.id, created.id);
            report.towers += 1;

            // Pavimentos primeiro — a unidade referencia `floor_id`, então o mapa
            // velho→novo precisa existir antes de copiar as unidades.
            const floorIdMap = new Map<string, string>();
            for (const floor of await this.listFloors(tower.id)) {
                const newFloor = await this.createFloor({
                    tower_id: created.id,
                    name: floor.name,
                    tipo: floor.tipo,
                    floor_number: floor.floor_number,
                    repeat_count: floor.repeat_count,
                    units_per_floor: floor.units_per_floor,
                    prefix: floor.prefix,
                    sort_order: floor.sort_order,
                });
                floorIdMap.set(floor.id, newFloor.id);
                report.floors += 1;
            }

            const sourceUnits = await this.listUnits(tower.id);
            if (sourceUnits.length > 0) {
                const copies: EmpreendimentoUnitInsert[] = sourceUnits.map(u => ({
                    tower_id: created.id,
                    floor_id: u.floor_id ? (floorIdMap.get(u.floor_id) ?? null) : null,
                    floor_tipo: u.floor_tipo,
                    name: u.name,
                    floor: u.floor,
                    typology: u.typology,
                    private_area: u.private_area,
                    common_area: u.common_area,
                    total_area: u.total_area,
                    bedrooms: u.bedrooms,
                    bathrooms: u.bathrooms,
                    suites: u.suites,
                    parking_spaces: u.parking_spaces,
                    position_type: u.position_type,
                    sun_orientation: u.sun_orientation,
                    view_type: u.view_type,
                    price: u.price,
                    rental_price: u.rental_price,
                    is_vendavel: u.is_vendavel,
                    sort_order: u.sort_order,
                    // Estado comercial NÃO se copia — a cópia nasce disponível nos dois eixos.
                    status: 'DISPONIVEL',
                    rental_status: 'DISPONIVEL',
                    commercial_property_id: null,
                    rental_property_id: null,
                }));
                await this.bulkUpsertUnits(copies);
                report.units += copies.length;
            }
        }

        const sourceAreas = await this.listCommonAreas(sourceId);
        if (sourceAreas.length > 0) {
            const areaCopies: EmpreendimentoCommonAreaInsert[] = sourceAreas.map(a => ({
                empreendimento_id: targetId,
                // Área comum ligada a uma torre acompanha a torre correspondente da cópia.
                tower_id: a.tower_id ? (towerIdMap.get(a.tower_id) ?? null) : null,
                name: a.name,
                category: a.category,
                area: a.area,
                floor: a.floor,
                description: a.description,
                is_vendavel: a.is_vendavel,
                sort_order: a.sort_order,
            }));
            await this.upsertCommonAreas(areaCopies);
            report.commonAreas += areaCopies.length;
        }

        await empreendimentoAuditService.record({
            empreendimentoId: targetId,
            entityType: 'empreendimento',
            entityId: targetId,
            action: 'create',
            metadata: { duplicadoDe: sourceId, ...report },
        });

        return report;
    },

    async update(id: string, updates: EmpreendimentoUpdate): Promise<Empreendimento> {
        // Estado anterior para o diff da trilha de auditoria. Best-effort: se falhar,
        // o update segue e o histórico grava só o valor novo.
        let before: Empreendimento | null = null;
        try {
            const { data: prev } = await supabase
                .from('empreendimentos')
                .select(EMPREENDIMENTO_COLS)
                .eq('id', id)
                .maybeSingle();
            before = (prev as unknown as Empreendimento) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { data, error } = await supabase
            .from('empreendimentos')
            .update(updates)
            .eq('id', id)
            .select(EMPREENDIMENTO_COLS)
            .single();
        if (error) throw new Error(`Failed to update empreendimento: ${error.message}`);

        await empreendimentoAuditService.recordDiff(
            {
                empreendimentoId: id,
                organizationId: data.organization_id,
                entityType: 'empreendimento',
                entityId: id,
                entityLabel: data.name,
            },
            before as unknown as Record<string, unknown>,
            updates as unknown as Record<string, unknown>,
        );

        // Vínculo com obra é evento próprio — quem lê o histórico procura por
        // "vinculou a obra", não por "campo project_id mudou".
        if ('project_id' in updates && before?.project_id !== data.project_id) {
            await empreendimentoAuditService.record({
                empreendimentoId: id,
                organizationId: data.organization_id,
                entityType: 'obra_link',
                entityId: data.project_id ?? before?.project_id ?? null,
                entityLabel: 'Obra principal',
                action: data.project_id ? 'link' : 'unlink',
                oldValue: before?.project_id ?? null,
                newValue: data.project_id ?? null,
            });
        }

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
        // Nome/org antes da exclusão: depois do delete não há de onde tirar, e a
        // trilha continua existindo (não tem FK para `empreendimentos`).
        let label: string | null = null;
        let orgId: string | null = null;
        try {
            const { data } = await supabase
                .from('empreendimentos')
                .select('name, organization_id')
                .eq('id', id)
                .maybeSingle();
            label = (data as any)?.name ?? null;
            orgId = (data as any)?.organization_id ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { error } = await supabase.from('empreendimentos').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete empreendimento: ${error.message}`);

        await empreendimentoAuditService.record({
            empreendimentoId: id,
            organizationId: orgId,
            entityType: 'empreendimento',
            entityId: id,
            entityLabel: label,
            action: 'delete',
        });
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

        await empreendimentoAuditService.record({
            empreendimentoId: data.empreendimento_id,
            entityType: 'tower',
            entityId: data.id,
            entityLabel: data.name,
            action: 'create',
        });

        return data;
    },

    async updateTower(id: string, updates: EmpreendimentoTowerUpdate): Promise<EmpreendimentoTower> {
        let before: EmpreendimentoTower | null = null;
        try {
            const { data: prev } = await supabase
                .from('empreendimento_towers')
                .select(TOWER_COLS)
                .eq('id', id)
                .maybeSingle();
            before = (prev as unknown as EmpreendimentoTower) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { data, error } = await supabase
            .from('empreendimento_towers')
            .update(updates)
            .eq('id', id)
            .select(TOWER_COLS)
            .single();
        if (error) throw new Error(`Failed to update tower: ${error.message}`);

        // O nome pode ter mudado — o cache de contexto ficaria desatualizado.
        towerContextCache.delete(id);

        await empreendimentoAuditService.recordDiff(
            {
                empreendimentoId: data.empreendimento_id,
                entityType: 'tower',
                entityId: id,
                entityLabel: data.name,
            },
            before as unknown as Record<string, unknown>,
            updates as unknown as Record<string, unknown>,
        );

        return data;
    },

    async deleteTower(id: string): Promise<void> {
        const ctx = await towerContext(id);

        const { error } = await supabase.from('empreendimento_towers').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete tower: ${error.message}`);

        towerContextCache.delete(id);

        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'tower',
                entityId: id,
                entityLabel: ctx.towerName,
                action: 'delete',
            });
        }
    },

    /** `projectId` nulo desfaz o vínculo (a coluna não tem FK — ver 20270719000000). */
    async linkTowerToObra(towerId: string, projectId: string | null): Promise<void> {
        const ctx = await towerContext(towerId);

        const { error } = await supabase
            .from('empreendimento_towers')
            .update({ project_id: projectId })
            .eq('id', towerId);
        if (error) throw new Error(`Failed to link tower to obra: ${error.message}`);

        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'obra_link',
                entityId: towerId,
                entityLabel: ctx.towerName,
                action: projectId ? 'link' : 'unlink',
                newValue: projectId,
            });
        }
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

        const ctx = await towerContext(towerId);
        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'obra_link',
                entityId: created.id,
                entityLabel: towerName,
                action: 'create',
                newValue: created.id,
                metadata: { towerId },
            });
        }

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

    /**
     * Empreendimento → Comercial: publica as unidades.
     *
     * **Publicar é upsert, nunca duplicata.** Unidade já vinculada tem a property
     * existente SOBRESCRITA (mesmo id) — republicar é reenviar os dados do
     * Empreendimento por cima, não criar outro imóvel no Comercial. Só quem não tem
     * vínculo (ou tem vínculo órfão, apontando para property inexistente) ganha
     * registro novo.
     *
     * `unitIds` restringe o lote às unidades marcadas na coluna "Publicar" do Espelho
     * de Vendas; omitido = todas as unidades do empreendimento.
     */
    async publishAllToCommercial(
        empreendimentoId: string,
        organizationId: string,
        unitIds?: string[],
    ): Promise<CommercialPublishReport> {
        const emp = await this.getById(empreendimentoId) as Empreendimento | null;
        if (!emp) throw new Error('Empreendimento não encontrado.');

        // Revalida no banco: o estado da tela pode estar obsoleto, e é daqui que sai a
        // decisão entre sobrescrever (id existente) e criar.
        const all = await this.listAllUnitsForEmpreendimento(empreendimentoId);
        const scope = unitIds?.length ? new Set(unitIds) : null;
        const units = scope ? all.filter(u => scope.has(u.id)) : all;
        if (!units.length) return { published: 0, updated: 0, alreadyPublished: 0 };

        // Vínculo que aponta para property inexistente/de outra org é órfão: tratar como
        // não publicado (senão o update silencioso não afetaria linha nenhuma).
        const linkedIds = units.map(u => u.commercial_property_id).filter(Boolean) as string[];
        const alive = new Set<string>();
        if (linkedIds.length) {
            const { data } = await supabase
                .from('commercial_properties')
                .select('id')
                .eq('organization_id', organizationId)
                .in('id', linkedIds);
            (data || []).forEach(p => alive.add(p.id));
        }

        const buildingId = await this.ensureCommercialBuilding(emp, organizationId);
        const addressFields = buildCommercialAddressFields(emp);
        let created = 0;
        let updated = 0;

        for (const unit of units) {
            const existingId = unit.commercial_property_id && alive.has(unit.commercial_property_id)
                ? unit.commercial_property_id
                : null;
            const prop = await commercialService.saveProperty({
                ...(existingId ? { id: existingId } : {}),
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
                    suites: unit.suites,
                    ...(unit.floor_tipo ? { floorTipo: unit.floor_tipo } : {}),
                },
            } as any);
            if (existingId) {
                updated++;
            } else {
                created++;
                await this.updateUnit(unit.id, { commercial_property_id: prop.id });
            }
        }

        // Lote: um evento resumo, não um por unidade publicada.
        await empreendimentoAuditService.record({
            empreendimentoId,
            organizationId,
            entityType: 'commercial',
            entityId: null,
            entityLabel: 'Espelho de Vendas',
            action: 'publish',
            source: 'comercial',
            metadata: {
                emLote: true,
                publicadas: created,
                sobrescritas: updated,
            },
        });

        return { published: created, updated, alreadyPublished: updated };
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

        // Lote: um evento resumo do que voltou do Comercial.
        await empreendimentoAuditService.record({
            empreendimentoId,
            organizationId,
            entityType: 'commercial',
            entityId: null,
            entityLabel: 'Espelho de Vendas',
            action: 'pull',
            source: 'comercial',
            metadata: {
                emLote: true,
                statusAtualizados: report.statusUpdated,
                semEquivalente: report.skippedUnmappable,
                naoVinculadas: report.unlinked,
            },
        });

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
            return { published: 0, updated: 0, alreadyPublished: units.length };
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
                    suites: unit.suites,
                    ...(unit.floor_tipo ? { floorTipo: unit.floor_tipo } : {}),
                },
            } as any);
            await this.updateUnit(unit.id, { rental_property_id: prop.id });
        }

        // Lote: um evento resumo, não um por unidade publicada.
        await empreendimentoAuditService.record({
            empreendimentoId,
            organizationId,
            entityType: 'rental',
            entityId: null,
            entityLabel: 'Espelho de Locações',
            action: 'publish',
            source: 'locacao',
            metadata: {
                emLote: true,
                publicadas: unpublished.length,
                jaPublicadas: units.length - unpublished.length,
            },
        });

        return { published: unpublished.length, updated: 0, alreadyPublished: units.length - unpublished.length };
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
     * Varre TODOS os empreendimentos de uma vez (de uma org, ou de todas se
     * organizationId for omitido) procurando unidades com commercial_property_id/
     * rental_property_id órfão — mesma detecção usada em getCommercialDivergenceSummary/
     * getRentalDivergenceSummary e no Espelho de Vendas/Locações (EspelhoVendasTab/
     * EspelhoLocacoesTab), só que em lote para todos de uma vez. Existe para
     * alimentar um aviso proativo no dashboard do módulo — hoje um vínculo órfão só
     * aparece quando alguém abre a aba Espelho daquele empreendimento específico
     * (ver incidente Garden Cambuhy: 41 unidades ficaram órfãs sem nenhum aviso até
     * alguém entrar na aba certa).
     *
     * Agrupa os ids de property por organização do PRÓPRIO empreendimento (não a
     * `organizationId` do parâmetro) antes de checar existência em commercial_properties
     * — necessário para o caso "todas as organizações", onde a varredura cobre mais
     * de uma org ao mesmo tempo e cada uma só pode ver suas próprias properties.
     */
    async getOrphanLinksSummary(organizationId?: string): Promise<EmpreendimentoOrphanSummary[]> {
        const emps = await this.list(organizationId);
        if (emps.length === 0) return [];
        const empById = new Map(emps.map(e => [e.id, e]));

        const { data: towers } = await supabase
            .from('empreendimento_towers')
            .select('id, empreendimento_id')
            .in('empreendimento_id', emps.map(e => e.id));
        if (!towers || towers.length === 0) return [];
        const towerToEmpId = new Map(towers.map(t => [t.id, t.empreendimento_id]));

        const { data: units } = await supabase
            .from('empreendimento_units')
            .select('tower_id, commercial_property_id, rental_property_id')
            .in('tower_id', towers.map(t => t.id));
        if (!units || units.length === 0) return [];

        const idsByOrg = new Map<string, Set<string>>();
        for (const u of units) {
            const empId = towerToEmpId.get(u.tower_id);
            const orgId = empId ? empById.get(empId)?.organization_id : undefined;
            if (!orgId) continue;
            let set = idsByOrg.get(orgId);
            if (!set) { set = new Set(); idsByOrg.set(orgId, set); }
            if (u.commercial_property_id) set.add(u.commercial_property_id);
            if (u.rental_property_id) set.add(u.rental_property_id);
        }

        const existingIds = new Set<string>();
        for (const [orgId, ids] of idsByOrg) {
            if (ids.size === 0) continue;
            const { data } = await supabase
                .from('commercial_properties')
                .select('id')
                .eq('organization_id', orgId)
                .in('id', Array.from(ids));
            (data || []).forEach((p: any) => existingIds.add(p.id));
        }

        const countByEmpId = new Map<string, { commercialOrphans: number; rentalOrphans: number }>();
        for (const u of units) {
            const empId = towerToEmpId.get(u.tower_id);
            if (!empId) continue;
            const counts = countByEmpId.get(empId) || { commercialOrphans: 0, rentalOrphans: 0 };
            if (u.commercial_property_id && !existingIds.has(u.commercial_property_id)) counts.commercialOrphans++;
            if (u.rental_property_id && !existingIds.has(u.rental_property_id)) counts.rentalOrphans++;
            countByEmpId.set(empId, counts);
        }

        const result: EmpreendimentoOrphanSummary[] = [];
        for (const [empId, counts] of countByEmpId) {
            if (counts.commercialOrphans === 0 && counts.rentalOrphans === 0) continue;
            const emp = empById.get(empId);
            if (!emp) continue;
            result.push({ empreendimentoId: empId, empreendimentoName: emp.name, ...counts });
        }
        return result;
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

        // Lote: um evento resumo do que voltou de Locações.
        await empreendimentoAuditService.record({
            empreendimentoId,
            organizationId,
            entityType: 'rental',
            entityId: null,
            entityLabel: 'Espelho de Locações',
            action: 'pull',
            source: 'locacao',
            metadata: {
                emLote: true,
                statusAtualizados: report.statusUpdated,
                semEquivalente: report.skippedUnmappable,
                naoVinculadas: report.unlinked,
            },
        });

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

        const ctx = await towerContext(data.tower_id);
        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'floor',
                entityId: data.id,
                entityLabel: data.name,
                action: 'create',
                metadata: { torre: ctx.towerName },
            });
        }

        return data;
    },

    async updateFloor(id: string, updates: EmpreendimentoFloorUpdate): Promise<EmpreendimentoFloor> {
        let before: EmpreendimentoFloor | null = null;
        try {
            const { data: prev } = await supabase
                .from('empreendimento_floors')
                .select(FLOOR_COLS)
                .eq('id', id)
                .maybeSingle();
            before = (prev as unknown as EmpreendimentoFloor) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { data, error } = await supabase
            .from('empreendimento_floors')
            .update(updates)
            .eq('id', id)
            .select(FLOOR_COLS)
            .single();
        if (error) throw new Error(`Failed to update floor: ${error.message}`);

        const ctx = await towerContext(data.tower_id);
        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.recordDiff(
                {
                    empreendimentoId: ctx.empreendimentoId,
                    organizationId: ctx.organizationId,
                    entityType: 'floor',
                    entityId: id,
                    entityLabel: data.name,
                },
                before as unknown as Record<string, unknown>,
                updates as unknown as Record<string, unknown>,
            );
        }

        return data;
    },

    async deleteFloor(id: string): Promise<void> {
        const ctx = await floorContext(id);

        const { error } = await supabase.from('empreendimento_floors').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete floor: ${error.message}`);

        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'floor',
                entityId: id,
                entityLabel: ctx.floorName,
                action: 'delete',
                metadata: { torre: ctx.towerName },
            });
        }
    },

    async deleteUnitsByTower(towerId: string): Promise<void> {
        const ctx = await towerContext(towerId);
        // Operação em LOTE: um evento resumo com o contador, nunca N eventos.
        let removed = 0;
        try {
            const { count } = await supabase
                .from('empreendimento_units')
                .select('id', { count: 'exact', head: true })
                .eq('tower_id', towerId);
            removed = count ?? 0;
        } catch { /* histórico não bloqueia a operação */ }

        const { error } = await supabase.from('empreendimento_units').delete().eq('tower_id', towerId);
        if (error) throw new Error(`Failed to delete units: ${error.message}`);

        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'unit',
                entityId: towerId,
                entityLabel: ctx.towerName,
                action: 'delete',
                metadata: { emLote: true, unidadesExcluidas: removed, torre: ctx.towerName },
            });
        }
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

        // Operação em LOTE (geração de unidades a partir dos pavimentos, sync):
        // UM evento resumo. Uma linha por unidade tornaria a aba Histórico inútil.
        const rows = data || [];
        if (rows.length) {
            const ctx = await towerContext(rows[0].tower_id);
            if (ctx.empreendimentoId) {
                // Insert não declara `id`; quem já tinha id na entrada é atualização.
                const inputIds = new Set(units.map(i => (i as { id?: string }).id).filter(Boolean));
                const created = rows.filter(u => !inputIds.has(u.id)).length;
                await empreendimentoAuditService.record({
                    empreendimentoId: ctx.empreendimentoId,
                    organizationId: ctx.organizationId,
                    entityType: 'unit',
                    entityId: rows[0].tower_id,
                    entityLabel: ctx.towerName,
                    action: 'update',
                    metadata: {
                        emLote: true,
                        unidadesGravadas: rows.length,
                        unidadesCriadas: created,
                        unidadesAtualizadas: rows.length - created,
                        torre: ctx.towerName,
                    },
                });
            }
        }

        return rows;
    },

    async createUnit(unit: EmpreendimentoUnitInsert): Promise<EmpreendimentoUnit> {
        const { data, error } = await supabase
            .from('empreendimento_units')
            .insert(unit)
            .select(UNIT_COLS)
            .single();
        if (error) throw new Error(`Failed to create unit: ${error.message}`);

        const ctx = await towerContext(data.tower_id);
        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'unit',
                entityId: data.id,
                entityLabel: data.name,
                action: 'create',
                metadata: { torre: ctx.towerName },
            });
        }

        return data;
    },

    async updateUnit(id: string, updates: EmpreendimentoUnitUpdate): Promise<EmpreendimentoUnit> {
        let before: EmpreendimentoUnit | null = null;
        try {
            const { data: prev } = await supabase
                .from('empreendimento_units')
                .select(UNIT_COLS)
                .eq('id', id)
                .maybeSingle();
            before = (prev as unknown as EmpreendimentoUnit) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { data, error } = await supabase
            .from('empreendimento_units')
            .update(updates)
            .eq('id', id)
            .select(UNIT_COLS)
            .single();
        if (error) throw new Error(`Failed to update unit: ${error.message}`);
        // A propagação do FÍSICO para as cópias comerciais (Vendas + Locações) é
        // feita pelo TRIGGER de banco `trg_propagate_unit_to_commercial`
        // (migration 20270815000007) — dispara em QUALQUER update de
        // empreendimento_units, sem depender deste caminho. Por isso não há mais
        // push em TS aqui: seria escrita dupla e não cobriria os bypasses (sync
        // Imovib/Planta IA, aceite de proposta, SQL direto). Estado (status/ocupação)
        // continua NÃO propagando — o trigger também não toca nisso, de propósito.

        const ctx = await towerContext(data.tower_id);
        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.recordDiff(
                {
                    empreendimentoId: ctx.empreendimentoId,
                    organizationId: ctx.organizationId,
                    entityType: 'unit',
                    entityId: id,
                    entityLabel: data.name,
                },
                before as unknown as Record<string, unknown>,
                updates as unknown as Record<string, unknown>,
            );
        }

        return data;
    },

    async deleteUnit(id: string): Promise<void> {
        const ctx = await unitContext(id);

        const { error } = await supabase.from('empreendimento_units').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete unit: ${error.message}`);

        if (ctx.empreendimentoId) {
            await empreendimentoAuditService.record({
                empreendimentoId: ctx.empreendimentoId,
                organizationId: ctx.organizationId,
                entityType: 'unit',
                entityId: id,
                entityLabel: ctx.unitName,
                action: 'delete',
                metadata: { torre: ctx.towerName },
            });
        }
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

        await empreendimentoAuditService.record({
            empreendimentoId: data.empreendimento_id,
            entityType: 'common_area',
            entityId: data.id,
            entityLabel: data.name,
            action: 'create',
        });

        return data;
    },

    async upsertCommonAreas(areas: EmpreendimentoCommonAreaInsert[]): Promise<EmpreendimentoCommonArea[]> {
        if (!areas || areas.length === 0) return [];
        const { data, error } = await supabase
            .from('empreendimento_common_areas')
            .upsert(areas, { onConflict: 'id' })
            .select(COMMON_AREA_COLS);
        if (error) throw new Error(`Failed to upsert common areas: ${error.message}`);

        // Operação em LOTE: um evento resumo com o contador.
        const rows = data || [];
        if (rows.length) {
            await empreendimentoAuditService.record({
                empreendimentoId: rows[0].empreendimento_id,
                entityType: 'common_area',
                entityId: null,
                entityLabel: 'Áreas comuns',
                action: 'update',
                metadata: { emLote: true, areasGravadas: rows.length },
            });
        }

        return rows;
    },

    async deleteCommonArea(id: string): Promise<void> {
        let empId: string | null = null;
        let label: string | null = null;
        try {
            const { data } = await supabase
                .from('empreendimento_common_areas')
                .select('name, empreendimento_id')
                .eq('id', id)
                .maybeSingle();
            empId = (data as any)?.empreendimento_id ?? null;
            label = (data as any)?.name ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { error } = await supabase.from('empreendimento_common_areas').delete().eq('id', id);
        if (error) throw new Error(`Failed to delete common area: ${error.message}`);

        if (empId) {
            await empreendimentoAuditService.record({
                empreendimentoId: empId,
                entityType: 'common_area',
                entityId: id,
                entityLabel: label,
                action: 'delete',
            });
        }
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

        await empreendimentoAuditService.record({
            empreendimentoId: data.empreendimento_id,
            organizationId: data.organization_id,
            entityType: 'regulatory_zone',
            entityId: data.id,
            entityLabel: data.zona || data.macroarea || null,
            action: 'create',
        });

        return data;
    },

    async updateRegulatoryZone(id: string, updates: EmpreendimentoRegulatoryZoneUpdate): Promise<void> {
        let before: EmpreendimentoRegulatoryZone | null = null;
        try {
            const { data: prev } = await supabase
                .from('empreendimento_regulatory_zones')
                .select(REGULATORY_ZONE_COLS)
                .eq('id', id)
                .maybeSingle();
            before = (prev as unknown as EmpreendimentoRegulatoryZone) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { error } = await supabase.from('empreendimento_regulatory_zones').update(updates).eq('id', id);
        if (error) throw new Error(`Falha ao atualizar zona regulatória: ${error.message}`);

        if (before?.empreendimento_id) {
            await empreendimentoAuditService.recordDiff(
                {
                    empreendimentoId: before.empreendimento_id,
                    organizationId: before.organization_id,
                    entityType: 'regulatory_zone',
                    entityId: id,
                    entityLabel: before.zona || before.macroarea || null,
                },
                before as unknown as Record<string, unknown>,
                updates as unknown as Record<string, unknown>,
            );
        }
    },

    async deleteRegulatoryZone(id: string): Promise<void> {
        let before: { empreendimento_id?: string; organization_id?: string; zona?: string; macroarea?: string } | null = null;
        try {
            const { data } = await supabase
                .from('empreendimento_regulatory_zones')
                .select('empreendimento_id, organization_id, zona, macroarea')
                .eq('id', id)
                .maybeSingle();
            before = (data as any) ?? null;
        } catch { /* histórico não bloqueia a operação */ }

        const { error } = await supabase.from('empreendimento_regulatory_zones').delete().eq('id', id);
        if (error) throw new Error(`Falha ao excluir zona regulatória: ${error.message}`);

        if (before?.empreendimento_id) {
            await empreendimentoAuditService.record({
                empreendimentoId: before.empreendimento_id,
                organizationId: before.organization_id,
                entityType: 'regulatory_zone',
                entityId: id,
                entityLabel: before.zona || before.macroarea || null,
                action: 'delete',
            });
        }
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
        const report = planToReport(plan);

        // Sync mexe em centenas de linhas: UM evento resumo com os contadores.
        // As escritas de unidade em si passam por bulkUpsertUnits, que já resume.
        await empreendimentoAuditService.record({
            empreendimentoId,
            organizationId,
            entityType: 'study_link',
            entityId: null,
            entityLabel: 'Estudo de Viabilidade (Imovib)',
            action: 'sync',
            source: 'sync_imovib',
            metadata: {
                torresCriadas: report.towersCreated,
                torresAtualizadas: report.towersUpdated,
                unidadesCriadas: report.unitsCreated,
                unidadesAtualizadas: report.unitsUpdated,
                areasComuns: report.commonAreasUpserted,
                torresOrfas: report.orphanTowers.length,
                unidadesOrfas: report.orphanUnits.length,
                conflitosParaCuradoria: plan.conflicts.length,
                avisos: report.warnings.length,
            },
        });

        return report;
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

