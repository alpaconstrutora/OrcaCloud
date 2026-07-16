// services/plantaAiMaterializeService.ts
//
// Materializa um PlantScenario em plant_floors/plant_units.
//
// Até 2027-02, plant_floors/plant_units existiam no banco (com RLS org-scoped) mas nunca eram
// populadas: a grade de unidades do 2D/3D era recalculada em memória a cada render por
// computeFloorLayout(), e nada era persistido. Isso impedia a ponte 1:1 com o Empreendimento —
// não havia "unidade do Planta IA" para uma unidade real apontar.
//
// A geometria continua vindo da MESMA fonte que alimenta a planta 2D e o 3D
// (PlantaAiEngine.getScenarioGeometry + computeFloorLayout), então materializar não introduz
// um segundo motor de layout que possa divergir do que o usuário vê na tela.

import { supabase } from '../lib/supabase';
import {
    PlantScenario, PlantTerrain, PlantUrbanRuleset, PlantBriefing,
    PlantFloor, PlantUnit, MaterializeReport,
} from '../types/plantaAi';
import { PlantaAiEngine } from './plantaAiEngine';
import { computeFloorLayout } from '../components/planta_ai/plantaGeometry';

const FLOOR_COLS = 'id, scenario_id, floor_number, floor_type, gross_area, private_area, common_area, circulation_area, geometry_json, created_at, updated_at';
const UNIT_COLS = 'id, floor_id, unit_code, unit_type, bedrooms, suites, bathrooms, parking_spaces, private_area, gross_area, has_balcony, has_suite, geometry_json, created_at, updated_at';

/** Térreo = 1. Mesma convenção de numeração do publishToCommercialInventory: andar*100 + índice. */
function unitCodeFor(floorNumber: number, unitIndex: number): string {
    return String(floorNumber * 100 + unitIndex + 1);
}

/** Área em m² com 2 casas. As áreas por unidade saem de divisões (total ÷ nº de unidades) e o
 *  float cru vaza 16 casas decimais para a tela ("129.3684210526316 m²"). Arredondar aqui, na
 *  origem, mantém o dado limpo em todo mundo que consome depois (tabela, sync, escrita reversa). */
function m2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Deriva dormitórios a partir da área privativa e do briefing.
 *  Heurística explícita: o Planta IA é paramétrico e não modela cômodos — o número serve como
 *  estimativa de produto (para o Empreendimento herdar), não como projeto arquitetônico. */
function inferBedrooms(privateArea: number, briefing: PlantBriefing | null): number {
    if (briefing?.allowed_typologies?.length) {
        // "2 dormitórios", "3 quartos", "Studio"...
        const match = briefing.allowed_typologies
            .map(t => /(\d+)\s*(dorm|quarto|suíte|suite)/i.exec(t))
            .find(Boolean);
        if (match) return parseInt(match[1], 10);
        if (briefing.allowed_typologies.some(t => /studio|kitnet/i.test(t))) return 1;
    }
    if (privateArea < 40) return 1;
    if (privateArea < 70) return 2;
    if (privateArea < 110) return 3;
    return 4;
}

export const plantaAiMaterializeService = {
    async listFloors(scenarioId: string): Promise<PlantFloor[]> {
        const { data, error } = await supabase
            .from('plant_floors')
            .select(FLOOR_COLS)
            .eq('scenario_id', scenarioId)
            .order('floor_number', { ascending: true });
        if (error) throw new Error(`Falha ao listar pavimentos: ${error.message}`);
        return data || [];
    },

    async listUnits(floorIds: string[]): Promise<PlantUnit[]> {
        if (!floorIds.length) return [];
        const { data, error } = await supabase
            .from('plant_units')
            .select(UNIT_COLS)
            .in('floor_id', floorIds)
            .order('unit_code', { ascending: true });
        if (error) throw new Error(`Falha ao listar unidades: ${error.message}`);
        return data || [];
    },

    /** Todas as unidades materializadas de um cenário, já com o pavimento junto. */
    async listUnitsForScenario(scenarioId: string): Promise<(PlantUnit & { _floor_number: number })[]> {
        const floors = await this.listFloors(scenarioId);
        if (!floors.length) return [];
        const byId = new Map(floors.map(f => [f.id, f]));
        const units = await this.listUnits(floors.map(f => f.id));
        return units.map(u => ({ ...u, _floor_number: byId.get(u.floor_id)?.floor_number ?? 0 }));
    },

    /**
     * Materializa (ou rematerializa) o cenário. Idempotente: reencontra pavimento por
     * (scenario_id, floor_number) e unidade por (floor_id, unit_code) — os índices únicos da
     * migration 20270209000000 — em vez de duplicar. Se o cenário encolheu (menos andares ou
     * menos unidades por andar), o excedente é removido.
     */
    async materializeScenario(
        scenario: PlantScenario,
        terrain: PlantTerrain,
        rules: PlantUrbanRuleset,
        briefing: PlantBriefing | null,
    ): Promise<MaterializeReport> {
        const report: MaterializeReport = {
            scenarioId: scenario.id,
            floorsCreated: 0, floorsUpdated: 0, unitsCreated: 0, unitsUpdated: 0,
            floorsRemoved: 0, unitsRemoved: 0, warnings: [],
        };

        const floorsCount = scenario.floors_count || 0;
        const unitsPerFloor = scenario.units_per_floor || 0;
        if (floorsCount < 1 || unitsPerFloor < 1) {
            throw new Error('Cenário sem pavimentos ou unidades por pavimento — nada a materializar.');
        }

        // Mesma geometria do 2D/3D — não recalcular por outro caminho.
        const geo = PlantaAiEngine.getScenarioGeometry(scenario, terrain, rules);
        const layout = computeFloorLayout(geo.buildingWidth, geo.buildingDepth, unitsPerFloor);

        const totalUnits = scenario.total_units || floorsCount * unitsPerFloor;
        const privPerUnit = totalUnits > 0 ? (scenario.total_private_area || 0) / totalUnits : 0;
        const commonPerUnit = totalUnits > 0 ? (scenario.total_common_area || 0) / totalUnits : 0;
        const grossPerFloor = floorsCount > 0 ? (scenario.total_built_area || 0) / floorsCount : 0;
        const parkingPerUnit = briefing?.parking_per_unit ?? rules.parking_spaces_per_unit ?? 0;

        if (totalUnits !== floorsCount * unitsPerFloor) {
            report.warnings.push(
                `O cenário declara ${totalUnits} unidades, mas a grade é ${floorsCount} × ${unitsPerFloor} = ${floorsCount * unitsPerFloor}. ` +
                `Materializado pela grade; o excedente do último pavimento foi ignorado.`,
            );
        }

        const existingFloors = await this.listFloors(scenario.id);
        const floorByNumber = new Map(existingFloors.map(f => [f.floor_number, f]));
        const existingUnits = await this.listUnits(existingFloors.map(f => f.id));
        const unitByKey = new Map(existingUnits.map(u => [`${u.floor_id}::${u.unit_code}`, u]));

        let materializedSoFar = 0;
        const keptFloorIds: string[] = [];
        const keptUnitIds: string[] = [];

        for (let floorNumber = 1; floorNumber <= floorsCount; floorNumber++) {
            const floorFields = {
                scenario_id: scenario.id,
                floor_number: floorNumber,
                floor_type: floorNumber === 1 ? 'Térreo' : floorNumber === floorsCount ? 'Cobertura' : 'Tipo',
                gross_area: m2(grossPerFloor),
                private_area: m2(privPerUnit * unitsPerFloor),
                common_area: m2(commonPerUnit * unitsPerFloor),
                circulation_area: m2(layout.core.width * layout.core.height),
                geometry_json: {
                    buildingWidth: geo.buildingWidth,
                    buildingDepth: geo.buildingDepth,
                    core: layout.core,
                    cols: layout.cols,
                    rows: layout.rows,
                },
            };

            let floorId: string;
            const existingFloor = floorByNumber.get(floorNumber);
            if (existingFloor) {
                floorId = existingFloor.id;
                const { error } = await supabase.from('plant_floors').update(floorFields).eq('id', floorId);
                if (error) throw new Error(`Falha ao atualizar pavimento ${floorNumber}: ${error.message}`);
                report.floorsUpdated++;
            } else {
                const { data, error } = await supabase.from('plant_floors').insert(floorFields).select('id').single();
                if (error) throw new Error(`Falha ao criar pavimento ${floorNumber}: ${error.message}`);
                floorId = data.id;
                report.floorsCreated++;
            }
            keptFloorIds.push(floorId);

            for (const cell of layout.units) {
                if (materializedSoFar >= totalUnits) break;
                const code = unitCodeFor(floorNumber, cell.index);
                const bedrooms = inferBedrooms(privPerUnit, briefing);
                const unitFields = {
                    floor_id: floorId,
                    unit_code: code,
                    unit_type: briefing?.allowed_typologies?.[0] || 'Apartamento',
                    bedrooms,
                    suites: briefing?.has_suite === 'Sim' ? 1 : 0,
                    bathrooms: Math.max(1, bedrooms - 1),
                    parking_spaces: parkingPerUnit,
                    private_area: m2(privPerUnit),
                    gross_area: m2(privPerUnit + commonPerUnit),
                    has_balcony: briefing?.has_balcony === 'Sim',
                    has_suite: briefing?.has_suite === 'Sim',
                    geometry_json: {
                        x: cell.x, y: cell.y, width: cell.width, height: cell.height, color: cell.color,
                    },
                };

                const existingUnit = unitByKey.get(`${floorId}::${code}`);
                if (existingUnit) {
                    const { error } = await supabase.from('plant_units').update(unitFields).eq('id', existingUnit.id);
                    if (error) throw new Error(`Falha ao atualizar unidade ${code}: ${error.message}`);
                    keptUnitIds.push(existingUnit.id);
                    report.unitsUpdated++;
                } else {
                    const { data, error } = await supabase.from('plant_units').insert(unitFields).select('id').single();
                    if (error) throw new Error(`Falha ao criar unidade ${code}: ${error.message}`);
                    keptUnitIds.push(data.id);
                    report.unitsCreated++;
                }
                materializedSoFar++;
            }
        }

        // Cenário encolheu: remove o que sobrou da materialização anterior.
        // Unidades primeiro (FK), depois pavimentos.
        const staleUnits = existingUnits.filter(u => !keptUnitIds.includes(u.id));
        if (staleUnits.length) {
            const { error } = await supabase.from('plant_units').delete().in('id', staleUnits.map(u => u.id));
            if (error) throw new Error(`Falha ao remover unidades obsoletas: ${error.message}`);
            report.unitsRemoved = staleUnits.length;
        }
        const staleFloors = existingFloors.filter(f => !keptFloorIds.includes(f.id));
        if (staleFloors.length) {
            const { error } = await supabase.from('plant_floors').delete().in('id', staleFloors.map(f => f.id));
            if (error) throw new Error(`Falha ao remover pavimentos obsoletos: ${error.message}`);
            report.floorsRemoved = staleFloors.length;
        }

        await supabase
            .from('plant_scenarios')
            .update({ materialized_at: new Date().toISOString() })
            .eq('id', scenario.id);

        return report;
    },
};

export default plantaAiMaterializeService;
