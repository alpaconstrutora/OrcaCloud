// services/plantaEmpreendimentoSync.ts
//
// Ponte DIRETA Planta IA ↔ Empreendimento — o elo que faltava para fechar o ciclo:
//
//   Imovib ──────────► Planta IA      (PlantaAiIntegration.createPlantaAiFromImovib)
//   Planta IA ───────► Imovib         (PlantaAiIntegration.sendToViabilidade)
//   Imovib ──────────► Empreendimento (empreendimentoService.syncFromStudy)
//   Empreendimento ──► Imovib         (empreendimentoService.writeBackToStudy)
//   Planta IA ───────► Empreendimento (syncToEmpreendimento)      ← este arquivo
//   Empreendimento ──► Planta IA      (writeBackToPlantaScenario) ← este arquivo
//
// Proveniência (migration 20270209000000), no mesmo padrão das colunas imovib_*:
//   plant_studies   → empreendimentos.planta_ai_study_id
//   plant_scenarios → empreendimento_towers.planta_ai_scenario_id   (1 cenário = 1 torre)
//   plant_units     → empreendimento_units.planta_ai_unit_id        (1:1)
//
// Regras:
//   · Órfãos (proveniência sumiu) são REPORTADOS, nunca auto-deletados — como no sync do Imovib.
//   · A escrita reversa propaga só agregados ESTRUTURAIS — nunca VGV/custo/status de venda,
//     para o cenário simulado permanecer independente do realizado.
//   · O sync cuida só do ESTRUTURAL. Preço e status entram uma vez, na criação, e nunca mais.
//     Diferente do Imovib (cujas instâncias carregam preço e status do estudo), o Planta IA é um
//     estudo de arquitetura e não tem estado comercial — não há o que "preservar" nem sobrescrever.
//   · Nome da torre é dado LOCAL: definido na criação, nunca propagado do cenário.

import { supabase } from '../lib/supabase';
import {
    Empreendimento, EmpreendimentoTower, EmpreendimentoUnit,
    EmpreendimentoTowerInsert, EmpreendimentoUnitInsert, EmpreendimentoTowerUpdate,
    PlantaAiSyncReport, PlantaAiWriteBackReport,
} from '../types/empreendimento';
import { PlantScenario, PlantUnit } from '../types/plantaAi';
import { empreendimentoService } from './empreendimentoService';
import { plantaAiMaterializeService } from './plantaAiMaterializeService';

interface SyncContext {
    empreendimento: Empreendimento;
    scenarios: PlantScenario[];
    /** Unidades materializadas por cenário. */
    unitsByScenario: Map<string, (PlantUnit & { _floor_number: number })[]>;
    existingTowers: EmpreendimentoTower[];
    existingUnits: EmpreendimentoUnit[];
}

interface UnitPlan {
    existingUnitId?: string;
    fields: Partial<EmpreendimentoUnitInsert>;
}

interface ScenarioPlan {
    existingTowerId?: string;
    towerInsert?: EmpreendimentoTowerInsert;
    towerUpdates: EmpreendimentoTowerUpdate;
    isNewTower: boolean;
    units: UnitPlan[];
}

interface SyncPlan {
    scenarios: ScenarioPlan[];
    orphanTowers: EmpreendimentoTower[];
    orphanUnits: EmpreendimentoUnit[];
    warnings: string[];
    /** Tamanho do lado Planta IA — independe de haver algo a sincronizar. */
    scenarioUnits: number;
}

async function loadSyncContext(empreendimentoId: string): Promise<SyncContext> {
    const empreendimento = await empreendimentoService.getById(empreendimentoId) as Empreendimento | null;
    if (!empreendimento) throw new Error('Empreendimento não encontrado.');
    if (!empreendimento.planta_ai_study_id) {
        throw new Error('Este empreendimento não está vinculado a um estudo de arquitetura (Planta IA).');
    }

    // Blindagem multi-tenant — mesmo critério do loadSyncContext do Imovib.
    const { data: study, error: studyErr } = await supabase
        .from('plant_studies')
        .select('id, organization_id, name, selected_scenario_id')
        .eq('id', empreendimento.planta_ai_study_id)
        .maybeSingle();
    if (studyErr) throw new Error(`Falha ao carregar o estudo do Planta IA: ${studyErr.message}`);
    if (!study) throw new Error('Estudo do Planta IA vinculado não foi encontrado.');
    if (study.organization_id !== empreendimento.organization_id) {
        throw new Error('O estudo vinculado pertence a outra organização. Sincronização bloqueada.');
    }

    // Só o cenário escolhido vira torre — os demais são alternativas descartadas do estudo,
    // e sincronizá-las todas criaria torres fantasma para cenários que o usuário não escolheu.
    //
    // A escolha vem de plant_studies.selected_scenario_id, NÃO de plant_scenarios.selected:
    // esse booleano existe na tabela mas nada no app jamais o escreve (nasce false em
    // generateScenarios e fica assim) — filtrar por ele nunca retornaria nada.
    if (!study.selected_scenario_id) {
        throw new Error('Nenhum cenário escolhido no estudo. Abra o Planta IA, na aba Cenários, e clique em "Escolher este cenário".');
    }

    const { data: scenarioRows, error: scErr } = await supabase
        .from('plant_scenarios')
        .select('id, study_id, name, scenario_type, status, generation_method, floors_count, units_per_floor, total_units, total_built_area, total_private_area, total_common_area, total_sellable_area, total_parking_spaces, estimated_vgv, estimated_cost, selected, materialized_at, created_at, updated_at')
        .eq('study_id', empreendimento.planta_ai_study_id)
        .eq('id', study.selected_scenario_id);
    if (scErr) throw new Error(`Falha ao carregar cenários: ${scErr.message}`);

    const scenarios = (scenarioRows || []) as PlantScenario[];

    const unitsByScenario = new Map<string, (PlantUnit & { _floor_number: number })[]>();
    for (const sc of scenarios) {
        unitsByScenario.set(sc.id, await plantaAiMaterializeService.listUnitsForScenario(sc.id));
    }

    const existingTowers = await empreendimentoService.listTowers(empreendimentoId);
    let existingUnits: EmpreendimentoUnit[] = [];
    for (const t of existingTowers) {
        existingUnits = existingUnits.concat(await empreendimentoService.listUnits(t.id));
    }

    return { empreendimento, scenarios, unitsByScenario, existingTowers, existingUnits };
}

/** Área em m² com 2 casas — mesma régua do plantaAiMaterializeService, para o valor que chega
 *  na unidade do Empreendimento não trazer 16 casas decimais da divisão de origem. */
function m2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Nome da torre nova: próxima letra livre ("Torre A", "Torre B"...). O nome do cenário é um
 *  rótulo de análise ("Cenário Equilibrado") e ficaria absurdo ao lado das torres reais. Só
 *  vale na criação — depois o nome é do usuário (ver buildSyncPlan). */
function nextTowerName(existingTowers: EmpreendimentoTower[], offset: number): string {
    const taken = new Set(existingTowers.map(t => t.name.trim().toUpperCase()));
    for (let i = 0; i < 26; i++) {
        const candidate = `Torre ${String.fromCharCode(65 + i)}`;
        if (!taken.has(candidate.toUpperCase())) {
            if (offset === 0) return candidate;
            offset--;
        }
    }
    return `Torre ${existingTowers.length + offset + 1}`;
}

/** Compara só os campos estruturais que o sync escreve. Tolerância de centavo de m² nos
 *  numéricos — sem isso, ruído de ponto flutuante marcaria divergência eterna. */
function unitFieldsDiffer(existing: EmpreendimentoUnit, next: Partial<EmpreendimentoUnitInsert>): boolean {
    const numDiffers = (a?: number | null, b?: number | null) =>
        Math.abs((a ?? 0) - (b ?? 0)) > 0.01;
    return (
        existing.name !== next.name
        || existing.floor !== next.floor
        || (existing.typology ?? null) !== (next.typology ?? null)
        || numDiffers(existing.private_area, next.private_area)
        || numDiffers(existing.common_area, next.common_area)
        || numDiffers(existing.total_area, next.total_area)
        || (existing.bedrooms ?? null) !== (next.bedrooms ?? null)
        || (existing.bathrooms ?? null) !== (next.bathrooms ?? null)
        || (existing.parking_spaces ?? null) !== (next.parking_spaces ?? null)
    );
    // price/status ficam de fora de propósito: o sync não os atualiza (só semeia na criação),
    // então diferença neles é o Empreendimento sendo dono do comercial — não é divergência.
}

function buildSyncPlan(ctx: SyncContext): SyncPlan {
    const { empreendimento, scenarios, unitsByScenario, existingTowers, existingUnits } = ctx;

    const towerByScenarioId = new Map<string, EmpreendimentoTower>();
    for (const t of existingTowers) if (t.planta_ai_scenario_id) towerByScenarioId.set(t.planta_ai_scenario_id, t);

    const unitByPlantaUnitId = new Map<string, EmpreendimentoUnit>();
    for (const u of existingUnits) if (u.planta_ai_unit_id) unitByPlantaUnitId.set(u.planta_ai_unit_id, u);

    const plan: SyncPlan = {
        scenarios: [], orphanTowers: [], orphanUnits: [], warnings: [],
        scenarioUnits: 0,
    };

    if (scenarios.length === 0) {
        plan.warnings.push('O cenário escolhido no estudo não foi encontrado — pode ter sido excluído. Escolha outro no Planta IA.');
    }

    for (const sc of scenarios) {
        const plantUnits = unitsByScenario.get(sc.id) || [];
        plan.scenarioUnits += plantUnits.length;
        if (plantUnits.length === 0) {
            plan.warnings.push(`Cenário "${sc.name}": ainda não materializado. Clique em "Materializar unidades" no Planta IA — sem isso não há unidades para espelhar.`);
            continue;
        }

        const existingTower = towerByScenarioId.get(sc.id);
        const towerUpdates: EmpreendimentoTowerUpdate = {};
        const salesPriceSqm = (sc.total_private_area || 0) > 0 ? (sc.estimated_vgv || 0) / (sc.total_private_area || 1) : undefined;
        const costSqm = (sc.total_built_area || 0) > 0 ? (sc.estimated_cost || 0) / (sc.total_built_area || 1) : undefined;

        if (existingTower) {
            // Nome NÃO é propagado: é dado local do empreendimento. O nome do cenário
            // ("Cenário Equilibrado") é um rótulo de análise, não um nome de torre — quem
            // renomeia para "Torre C" tem que continuar com "Torre C" no sync seguinte.
            if (existingTower.floors_count !== sc.floors_count) towerUpdates.floors_count = sc.floors_count;
            if (existingTower.units_per_floor !== sc.units_per_floor) towerUpdates.units_per_floor = sc.units_per_floor;
            if (costSqm != null && existingTower.construction_cost_sqm !== costSqm) towerUpdates.construction_cost_sqm = costSqm;
            if (salesPriceSqm != null && existingTower.sales_price_sqm !== salesPriceSqm) towerUpdates.sales_price_sqm = salesPriceSqm;
        }

        const unitPlans: UnitPlan[] = [];
        for (const pu of plantUnits) {
            const priv = pu.private_area ?? 0;
            // Subtração de dois arredondados reintroduz ruído de float (25.87000000000001) —
            // arredondar o resultado, não só as parcelas.
            const common = m2(Math.max(0, (pu.gross_area ?? priv) - priv));
            const structural: Partial<EmpreendimentoUnitInsert> = {
                planta_ai_unit_id: pu.id,
                name: `Apto ${pu.unit_code}`,
                floor: pu._floor_number,
                typology: pu.unit_type,
                private_area: priv,
                common_area: common,
                total_area: priv + common,
                bedrooms: pu.bedrooms,
                bathrooms: pu.bathrooms,
                parking_spaces: pu.parking_spaces,
                is_vendavel: true,
            };

            const existingUnit = unitByPlantaUnitId.get(pu.id);
            if (existingUnit) {
                // Preço e status NÃO entram no update — só na criação (ver o else abaixo).
                //
                // Diferente do sync do Imovib, aqui não existe "preservar estado comercial":
                // o Planta IA é um estudo de ARQUITETURA e não tem preço por unidade nem
                // status de venda. Não há nada do outro lado para sobrescrever, então o
                // comercial é sempre do Empreendimento e o sync só cuida do estrutural.
                if (!unitFieldsDiffer(existingUnit, structural)) continue;
                unitPlans.push({ existingUnitId: existingUnit.id, fields: structural });
            } else {
                // Só na criação: preço-semente (VGV do cenário ÷ unidades) e status inicial.
                // É uma estimativa uniforme e grosseira — a partir daqui quem manda no preço
                // é o Empreendimento, e o sync nunca mais toca nele.
                const totalUnits = sc.total_units || plantUnits.length;
                if (sc.estimated_vgv && totalUnits > 0) {
                    structural.price = Math.round((sc.estimated_vgv / totalUnits) * 100) / 100;
                }
                structural.status = 'DISPONIVEL';
                unitPlans.push({ fields: structural });
            }
        }

        plan.scenarios.push({
            existingTowerId: existingTower?.id,
            towerInsert: existingTower ? undefined : {
                empreendimento_id: empreendimento.id,
                planta_ai_scenario_id: sc.id,
                name: nextTowerName(existingTowers, plan.scenarios.filter(s => s.isNewTower).length),
                floors_count: sc.floors_count,
                units_per_floor: sc.units_per_floor,
                construction_cost_sqm: costSqm,
                sales_price_sqm: salesPriceSqm,
                sort_order: existingTowers.length + plan.scenarios.length,
            },
            towerUpdates,
            isNewTower: !existingTower,
            units: unitPlans,
        });
    }

    // Órfãos: proveniência que sumiu do estudo. Reportados, nunca deletados.
    const scenarioIds = new Set(scenarios.map(s => s.id));
    const allPlantUnitIds = new Set<string>();
    for (const list of unitsByScenario.values()) for (const u of list) allPlantUnitIds.add(u.id);

    plan.orphanTowers = existingTowers.filter(t => t.planta_ai_scenario_id && !scenarioIds.has(t.planta_ai_scenario_id));
    plan.orphanUnits = existingUnits.filter(u => u.planta_ai_unit_id && !allPlantUnitIds.has(u.planta_ai_unit_id));

    return plan;
}

function planToReport(plan: SyncPlan): PlantaAiSyncReport {
    let towersCreated = 0, towersUpdated = 0, unitsCreated = 0, unitsUpdated = 0;
    for (const sp of plan.scenarios) {
        if (sp.isNewTower) towersCreated++;
        else if (Object.keys(sp.towerUpdates).length > 0) towersUpdated++;
        for (const u of sp.units) {
            if (u.existingUnitId) unitsUpdated++;
            else unitsCreated++;
        }
    }
    return {
        towersCreated, towersUpdated, unitsCreated, unitsUpdated,
        scenarioUnits: plan.scenarioUnits,
        orphanTowers: plan.orphanTowers,
        orphanUnits: plan.orphanUnits,
        warnings: plan.warnings,
    };
}

export const plantaEmpreendimentoSync = {
    /** Vincula um empreendimento a um estudo do Planta IA (proveniência direta). */
    async linkStudy(empreendimentoId: string, plantaAiStudyId: string): Promise<void> {
        await empreendimentoService.update(empreendimentoId, { planta_ai_study_id: plantaAiStudyId });
    },

    // ── Planta IA → Empreendimento ──────────────────────────────────────────

    /** Dry-run: calcula o que seria criado/atualizado, sem escrever. */
    async previewSync(empreendimentoId: string): Promise<PlantaAiSyncReport> {
        const ctx = await loadSyncContext(empreendimentoId);
        return planToReport(buildSyncPlan(ctx));
    },

    /** Aplica a sincronização: cria/atualiza torres e unidades a partir do cenário selecionado. */
    async syncToEmpreendimento(empreendimentoId: string): Promise<PlantaAiSyncReport> {
        const ctx = await loadSyncContext(empreendimentoId);
        const plan = buildSyncPlan(ctx);

        for (const sp of plan.scenarios) {
            let towerId: string;
            if (sp.existingTowerId) {
                towerId = sp.existingTowerId;
                if (Object.keys(sp.towerUpdates).length > 0) {
                    await empreendimentoService.updateTower(towerId, sp.towerUpdates);
                }
            } else {
                const created = await empreendimentoService.createTower(sp.towerInsert!);
                towerId = created.id;
            }

            for (const u of sp.units) {
                if (u.existingUnitId) {
                    await empreendimentoService.updateUnit(u.existingUnitId, u.fields);
                } else {
                    await empreendimentoService.createUnit({
                        tower_id: towerId, status: 'DISPONIVEL', ...u.fields,
                    } as EmpreendimentoUnitInsert);
                }
            }
        }

        await empreendimentoService.update(empreendimentoId, { last_synced_at: new Date().toISOString() });
        return planToReport(plan);
    },

    // ── Empreendimento → Planta IA (só agregados estruturais) ───────────────

    /** Dry-run da escrita reversa: mostra os campos que divergem, sem escrever. */
    async previewWriteBack(empreendimentoId: string): Promise<PlantaAiWriteBackReport[]> {
        const ctx = await loadSyncContext(empreendimentoId);
        return buildWriteBackReports(ctx);
    },

    /**
     * Escreve de volta no cenário os agregados recalculados a partir das torres/unidades reais.
     * NUNCA propaga estimated_vgv/estimated_cost nem status de venda — o cenário é a simulação
     * arquitetônica e permanece independente do realizado (mesma regra do writeBackToStudy).
     */
    async writeBackToPlantaScenario(empreendimentoId: string): Promise<PlantaAiWriteBackReport[]> {
        const ctx = await loadSyncContext(empreendimentoId);
        const reports = buildWriteBackReports(ctx);

        for (const r of reports) {
            if (r.changes.length === 0) continue;
            const patch: Record<string, number> = {};
            for (const c of r.changes) patch[c.field] = c.to;
            const { error } = await supabase.from('plant_scenarios').update(patch).eq('id', r.scenarioId);
            if (error) throw new Error(`Falha ao atualizar o cenário "${r.scenarioName}": ${error.message}`);
        }
        return reports;
    },
};

function buildWriteBackReports(ctx: SyncContext): PlantaAiWriteBackReport[] {
    const reports: PlantaAiWriteBackReport[] = [];

    for (const sc of ctx.scenarios) {
        const tower = ctx.existingTowers.find(t => t.planta_ai_scenario_id === sc.id);
        if (!tower) continue;

        const units = ctx.existingUnits.filter(u => u.tower_id === tower.id);
        if (units.length === 0) continue;

        const distinctFloors = new Set(units.map(u => u.floor).filter(f => f != null));
        const floorsCount = distinctFloors.size || tower.floors_count || 0;
        const totalUnits = units.length;
        const unitsPerFloor = floorsCount > 0 ? Math.round(totalUnits / floorsCount) : totalUnits;
        const totalPrivate = units.reduce((s, u) => s + (u.private_area || 0), 0);
        const totalCommon = units.reduce((s, u) => s + (u.common_area || 0), 0);

        const candidates: { field: string; from: number | null; to: number }[] = [
            { field: 'floors_count', from: sc.floors_count ?? null, to: floorsCount },
            { field: 'units_per_floor', from: sc.units_per_floor ?? null, to: unitsPerFloor },
            { field: 'total_units', from: sc.total_units ?? null, to: totalUnits },
            { field: 'total_private_area', from: sc.total_private_area ?? null, to: totalPrivate },
            { field: 'total_common_area', from: sc.total_common_area ?? null, to: totalCommon },
            { field: 'total_built_area', from: sc.total_built_area ?? null, to: totalPrivate + totalCommon },
        ];

        // Tolerância de centavo de m² — evita marcar divergência por ruído de ponto flutuante.
        const changes = candidates.filter(c => c.from == null || Math.abs(c.from - c.to) > 0.01);

        const unitsWithoutPlantaOrigin = units.filter(u => !u.planta_ai_unit_id).length;

        reports.push({
            scenarioId: sc.id,
            scenarioName: sc.name,
            changes,
            unitsWithoutPlantaOrigin,
        });
    }

    return reports;
}

export default plantaEmpreendimentoSync;
