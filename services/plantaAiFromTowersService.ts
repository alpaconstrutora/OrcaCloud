// services/plantaAiFromTowersService.ts
//
// Gera a PLANTA (plant_scenarios + plant_floors + plant_units) a partir das
// Torres & Unidades REAIS do empreendimento vinculado, em vez das Premissas
// Arquitetônicas (briefing).
//
// Motivação: o caminho do briefing (PlantaAiEngine.generateScenarios +
// plantaAiMaterializeService) é paramétrico — floors/units uniformes derivados
// de agregados, dormitórios inferidos por faixa de área. Quando o usuário já
// modelou as torres e unidades exatas (área privativa, tipologia, dorm/banho/
// vagas por unidade), essa é a fonte mais precisa: aqui cada plant_unit sai
// direto da unidade real, não de uma heurística.
//
// Modelo: 1 torre → 1 cenário (mesmo vínculo tower.planta_ai_scenario_id que o
// write-back e refreshRealTowerData já usam). Idempotente: reencontra o cenário
// pela torre e os pavimentos/unidades por (scenario_id, floor_number) /
// (floor_id, unit_code), atualizando em vez de duplicar; remove o excedente
// quando a torre encolheu.

import { supabase } from '../lib/supabase';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { PlantaAiEngine } from './plantaAiEngine';
import { computeFloorLayout } from '../components/planta_ai/plantaGeometry';
import { PlantTerrain, PlantUrbanRuleset } from '../types/plantaAi';

export interface FromTowersReport {
    towersProcessed: number;
    scenariosCreated: number;
    scenariosUpdated: number;
    floorsUpserted: number;
    unitsUpserted: number;
    floorsRemoved: number;
    unitsRemoved: number;
    warnings: string[];
}

/** Área em m² com 2 casas — mesmo tratamento do plantaAiMaterializeService (evita float cru na tela). */
function m2(value: number): number {
    return Math.round(value * 100) / 100;
}

export const plantaAiFromTowersService = {
    /**
     * Gera/atualiza um cenário preciso por torre do empreendimento vinculado.
     * terrain/rules são opcionais: quando presentes, a geometria da planta (largura/
     * profundidade do prédio) sai do envelope construtivo; sem eles, usa um default
     * só para o 2D/3D não quebrar — as ÁREAS e a contagem continuam vindo das unidades.
     */
    async generateFromTowers(
        studyId: string,
        empreendimentoId: string,
        terrain: PlantTerrain | null,
        rules: PlantUrbanRuleset | null,
    ): Promise<FromTowersReport> {
        const report: FromTowersReport = {
            towersProcessed: 0, scenariosCreated: 0, scenariosUpdated: 0,
            floorsUpserted: 0, unitsUpserted: 0, floorsRemoved: 0, unitsRemoved: 0, warnings: [],
        };

        const { towers, units } = await loadTargetState(empreendimentoId);
        const towersWithUnits = towers.filter(t => units.some(u => u.tower_id === t.id));
        if (towersWithUnits.length === 0) {
            throw new Error('Nenhuma torre com unidades em Torres & Unidades. Cadastre as torres e suas unidades antes de gerar a planta a partir delas.');
        }

        for (const tower of towersWithUnits) {
            report.towersProcessed++;
            const towerUnits = units.filter(u => u.tower_id === tower.id);

            // ── Agregados reais da torre ──────────────────────────────────────
            const floorNumbers = [...new Set(towerUnits.map(u => u.floor ?? 1))].sort((a, b) => a - b);
            const floorsCount = floorNumbers.length || tower.floors_count || 1;
            const totalUnits = towerUnits.length;
            const unitsPerFloor = Math.max(1, Math.round(totalUnits / floorsCount));
            const totalPrivate = towerUnits.reduce((s, u) => s + (u.private_area || 0), 0);
            const totalCommon = towerUnits.reduce((s, u) => s + (u.common_area || 0), 0);
            const totalBuilt = (totalPrivate + totalCommon) || towerUnits.reduce((s, u) => s + (u.total_area || 0), 0);
            const sumPrice = towerUnits.reduce((s, u) => s + (u.price || 0), 0);
            // VGV: soma dos preços reais das unidades; se ninguém precificou, cai no preço/m² da torre.
            const vgv = sumPrice > 0 ? sumPrice : totalPrivate * (tower.sales_price_sqm || 0);
            const cost = totalBuilt * (tower.construction_cost_sqm || 0);
            const efficiency = totalBuilt > 0 ? (totalPrivate / totalBuilt) * 100 : 0;

            const scenarioFields = {
                study_id: studyId,
                name: tower.name || 'Torre',
                // scenario_type tem CHECK constraint no banco (valores do tipo PlantScenario).
                // Um cenário vindo das Torres & Unidades reais é "Customizado" — não é um dos
                // 3 presets paramétricos do briefing. A origem fica clara em generation_method.
                scenario_type: 'Customizado',
                status: 'Gerado',
                generation_method: 'A partir de Torres & Unidades',
                floors_count: floorsCount,
                units_per_floor: unitsPerFloor,
                total_units: totalUnits,
                total_built_area: m2(totalBuilt),
                total_private_area: m2(totalPrivate),
                total_common_area: m2(totalCommon),
                estimated_vgv: Math.round(vgv),
                estimated_cost: Math.round(cost),
                general_score: 100,
                efficiency_ratio: efficiency,
                selected: false,
                materialized_at: new Date().toISOString(),
            };

            // ── Cenário: reusa o vínculo da torre ou cria um novo ─────────────
            let scenarioId: string | null = tower.planta_ai_scenario_id || null;
            if (scenarioId) {
                const { data: exists } = await supabase.from('plant_scenarios').select('id').eq('id', scenarioId).maybeSingle();
                if (!exists) scenarioId = null; // vínculo apontando para cenário apagado
            }
            if (scenarioId) {
                const { error } = await supabase.from('plant_scenarios').update(scenarioFields).eq('id', scenarioId);
                if (error) throw new Error(`Falha ao atualizar cenário da torre ${tower.name}: ${error.message}`);
                report.scenariosUpdated++;
            } else {
                const { data, error } = await supabase.from('plant_scenarios').insert(scenarioFields).select('id').single();
                if (error) throw new Error(`Falha ao criar cenário da torre ${tower.name}: ${error.message}`);
                scenarioId = data.id;
                report.scenariosCreated++;
                await empreendimentoService.updateTower(tower.id, { planta_ai_scenario_id: scenarioId });
            }

            // ── Geometria do prédio (só para posicionar a grade do 2D/3D) ─────
            let buildingWidth = 24;
            let buildingDepth = 16;
            if (terrain && rules) {
                const geo = PlantaAiEngine.getScenarioGeometry({ ...scenarioFields, id: scenarioId } as any, terrain, rules);
                buildingWidth = geo.buildingWidth;
                buildingDepth = geo.buildingDepth;
            }

            // ── Materializa pavimentos + unidades a partir das unidades reais ──
            const unitsByFloor = new Map<number, typeof towerUnits>();
            for (const u of towerUnits) {
                const fn = u.floor ?? 1;
                if (!unitsByFloor.has(fn)) unitsByFloor.set(fn, []);
                unitsByFloor.get(fn)!.push(u);
            }

            const { data: existingFloors } = await supabase
                .from('plant_floors').select('id, floor_number').eq('scenario_id', scenarioId);
            const floorByNumber = new Map((existingFloors || []).map((f: any) => [f.floor_number, f]));
            const keptFloorIds: string[] = [];

            for (const fn of floorNumbers) {
                const fUnits = (unitsByFloor.get(fn) || [])
                    .slice()
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || ''));
                const fPrivate = fUnits.reduce((s, u) => s + (u.private_area || 0), 0);
                const fCommon = fUnits.reduce((s, u) => s + (u.common_area || 0), 0);
                const layout = computeFloorLayout(buildingWidth, buildingDepth, Math.max(1, fUnits.length));

                const floorFields = {
                    scenario_id: scenarioId,
                    floor_number: fn,
                    floor_type: fn === floorNumbers[0] ? 'Térreo' : fn === floorNumbers[floorNumbers.length - 1] ? 'Cobertura' : 'Tipo',
                    gross_area: m2(fPrivate + fCommon),
                    private_area: m2(fPrivate),
                    common_area: m2(fCommon),
                    circulation_area: m2(layout.core.width * layout.core.height),
                    geometry_json: {
                        buildingWidth, buildingDepth, core: layout.core, cols: layout.cols, rows: layout.rows,
                    },
                };

                let floorId: string;
                const existingFloor = floorByNumber.get(fn);
                if (existingFloor) {
                    const { error } = await supabase.from('plant_floors').update(floorFields).eq('id', existingFloor.id);
                    if (error) throw new Error(`Falha ao atualizar pavimento ${fn} (torre ${tower.name}): ${error.message}`);
                    floorId = existingFloor.id;
                } else {
                    const { data, error } = await supabase.from('plant_floors').insert(floorFields).select('id').single();
                    if (error) throw new Error(`Falha ao criar pavimento ${fn} (torre ${tower.name}): ${error.message}`);
                    floorId = data.id;
                }
                report.floorsUpserted++;
                keptFloorIds.push(floorId);

                const { data: exUnits } = await supabase.from('plant_units').select('id, unit_code').eq('floor_id', floorId);
                const exByCode = new Map((exUnits || []).map((u: any) => [u.unit_code, u]));
                const keptUnitIds: string[] = [];

                for (let i = 0; i < fUnits.length; i++) {
                    const u = fUnits[i];
                    const cell = layout.units[i] || layout.units[layout.units.length - 1] || { x: 0, y: 0, width: 5, height: 5, color: '#e5e7eb' };
                    const code = u.name || String(fn * 100 + i + 1);
                    const unitFields = {
                        floor_id: floorId,
                        unit_code: code,
                        unit_type: u.typology || 'Apartamento',
                        bedrooms: u.bedrooms ?? 0,
                        suites: u.suites ?? 0,
                        bathrooms: u.bathrooms ?? 0,
                        parking_spaces: u.parking_spaces ?? 0,
                        private_area: m2(u.private_area || 0),
                        gross_area: m2((u.private_area || 0) + (u.common_area || 0)) || m2(u.total_area || 0),
                        has_balcony: false,
                        has_suite: (u.suites ?? 0) > 0,
                        geometry_json: { x: cell.x, y: cell.y, width: cell.width, height: cell.height, color: cell.color },
                    };

                    const existingUnit = exByCode.get(code);
                    if (existingUnit) {
                        const { error } = await supabase.from('plant_units').update(unitFields).eq('id', existingUnit.id);
                        if (error) throw new Error(`Falha ao atualizar unidade ${code} (torre ${tower.name}): ${error.message}`);
                        keptUnitIds.push(existingUnit.id);
                    } else {
                        const { data, error } = await supabase.from('plant_units').insert(unitFields).select('id').single();
                        if (error) throw new Error(`Falha ao criar unidade ${code} (torre ${tower.name}): ${error.message}`);
                        keptUnitIds.push(data.id);
                    }
                    report.unitsUpserted++;
                }

                // Unidades que sobraram de uma materialização anterior deste pavimento.
                const staleUnits = (exUnits || []).filter((u: any) => !keptUnitIds.includes(u.id));
                if (staleUnits.length) {
                    const { error } = await supabase.from('plant_units').delete().in('id', staleUnits.map((u: any) => u.id));
                    if (error) throw new Error(`Falha ao remover unidades obsoletas (torre ${tower.name}): ${error.message}`);
                    report.unitsRemoved += staleUnits.length;
                }
            }

            // Pavimentos que sobraram (torre encolheu). Unidades caem por FK/cascade ou já foram tratadas.
            const staleFloors = (existingFloors || []).filter((f: any) => !keptFloorIds.includes(f.id));
            if (staleFloors.length) {
                const staleFloorIds = staleFloors.map((f: any) => f.id);
                await supabase.from('plant_units').delete().in('floor_id', staleFloorIds);
                const { error } = await supabase.from('plant_floors').delete().in('id', staleFloorIds);
                if (error) throw new Error(`Falha ao remover pavimentos obsoletos (torre ${tower.name}): ${error.message}`);
                report.floorsRemoved += staleFloors.length;
            }
        }

        return report;
    },
};

export default plantaAiFromTowersService;
