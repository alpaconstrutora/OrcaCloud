// services/plantaEmpreendimentoSync.ts
//
// Ponte DIRETA Planta IA ↔ Empreendimento — o elo que fecha o ciclo:
//
//   Imovib ──────────► Planta IA      (PlantaAiIntegration.createPlantaAiFromImovib)
//   Planta IA ───────► Imovib         (PlantaAiIntegration.sendToViabilidade)
//   Imovib ──────────► Empreendimento (empreendimentoService.syncFromStudy)
//   Empreendimento ──► Imovib         (empreendimentoService.writeBackToStudy)
//   Planta IA ───────► Empreendimento (syncToEmpreendimento)      ← este arquivo
//   Empreendimento ──► Planta IA      (writeBackToPlantaScenario) ← este arquivo
//
// O motor de diff/plano/escrita vive em services/sync/ e é COMPARTILHADO com a aresta do
// Imovib — este arquivo é só a cola da aresta do Planta IA. Antes, cada aresta tinha seu
// próprio `SyncContext`/`SyncPlan`/`UnitPlan` homônimos e incompatíveis, e só uma das duas
// sabia reconhecer "nada mudou".
//
// Proveniência (migration 20270209000000), no mesmo padrão das colunas imovib_*:
//   plant_studies   → empreendimentos.planta_ai_study_id
//   plant_scenarios → empreendimento_towers.planta_ai_scenario_id   (1 cenário = 1 torre)
//   plant_units     → empreendimento_units.planta_ai_unit_id        (1:1)
//
// Regras (as duas primeiras agora são do motor, não deste arquivo):
//   · Órfãos (proveniência sumiu) são REPORTADOS, nunca auto-deletados.
//   · O sync cuida só do ESTRUTURAL. Preço e status entram uma vez, na criação, e nunca mais:
//     o Planta IA é estudo de arquitetura e não tem estado comercial — não há o que preservar
//     nem sobrescrever (ver createOnly em sync/plantaAdapter.ts).
//   · A escrita reversa propaga só agregados ESTRUTURAIS — nunca VGV/custo/status de venda,
//     para o cenário simulado permanecer independente do realizado.
//   · Nome da torre é dado LOCAL: definido na criação, nunca propagado do cenário.

import { supabase } from '../lib/supabase';
import { Empreendimento, PlantaAiSyncReport, PlantaAiWriteBackReport } from '../types/empreendimento';
import { PlantScenario } from '../types/plantaAi';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import { loadPlantaSide } from './sync/plantaAdapter';
import { CanonicalSide, SyncPlan, TargetState } from './sync/types';

interface PlantaSync {
    side: CanonicalSide;
    target: TargetState;
    plan: SyncPlan;
}

async function planPlantaSync(empreendimentoId: string): Promise<PlantaSync> {
    const empreendimento = await empreendimentoService.getById(empreendimentoId) as Empreendimento | null;
    if (!empreendimento) throw new Error('Empreendimento não encontrado.');
    const [side, target] = await Promise.all([
        loadPlantaSide(empreendimento),
        loadTargetState(empreendimentoId),
    ]);
    return { side, target, plan: buildPlan(side, target) };
}

function planToReport(sync: PlantaSync): PlantaAiSyncReport {
    const { plan, side } = sync;
    const touched = new Set([...plan.fills, ...plan.conflicts].map(c => `${c.entity}|${c.entityId}`));
    const countTouched = (entity: 'tower' | 'unit') =>
        [...touched].filter(k => k.startsWith(`${entity}|`)).length;

    return {
        towersCreated: plan.towerCreates.length,
        // "Atualizado" = tem pelo menos um campo divergindo de fato — não "existe e tem
        // proveniência", que era o critério antigo do lado do Imovib.
        towersUpdated: countTouched('tower'),
        unitsCreated: plan.towerCreates.reduce((s, tc) => s + tc.units.length, 0) + plan.unitCreates.length,
        unitsUpdated: countTouched('unit'),
        // Tamanho do lado Planta IA — independe de haver algo a sincronizar.
        scenarioUnits: side.towers.reduce((s, t) => s + t.units.length, 0),
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
        return planToReport(await planPlantaSync(empreendimentoId));
    },

    /**
     * Aplica a sincronização: cria/atualiza torres e unidades a partir do cenário selecionado.
     * Conflitos não sobrescrevem o Empreendimento — viram propostas de curadoria.
     */
    async syncToEmpreendimento(empreendimentoId: string): Promise<PlantaAiSyncReport> {
        const sync = await planPlantaSync(empreendimentoId);
        // Materializa antes de aplicar: falha cedo se a curadoria não estiver disponível.
        await empreendimentoProposalService.materializeConflicts(
            empreendimentoId, sync.side.empreendimento.organization_id, sync.plan.conflicts,
        );
        await applyPlan(sync.plan);
        return planToReport(sync);
    },

    // ── Empreendimento → Planta IA (só agregados estruturais) ───────────────

    /** Dry-run da escrita reversa: mostra os campos que divergem, sem escrever. */
    async previewWriteBack(empreendimentoId: string): Promise<PlantaAiWriteBackReport[]> {
        const { side, target } = await planPlantaSync(empreendimentoId);
        return buildWriteBackReports(side, target);
    },

    /**
     * Escreve de volta no cenário os agregados recalculados a partir das torres/unidades reais.
     * NUNCA propaga estimated_vgv/estimated_cost nem status de venda — o cenário é a simulação
     * arquitetônica e permanece independente do realizado (mesma regra do writeBackToStudy).
     */
    async writeBackToPlantaScenario(empreendimentoId: string): Promise<PlantaAiWriteBackReport[]> {
        const { side, target } = await planPlantaSync(empreendimentoId);
        const reports = buildWriteBackReports(side, target);

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

/**
 * Agregados do cenário recalculados a partir das torres/unidades reais.
 * Direção oposta ao planner: aqui o Empreendimento é a origem e o cenário é o destino.
 */
function buildWriteBackReports(side: CanonicalSide, target: TargetState): PlantaAiWriteBackReport[] {
    const reports: PlantaAiWriteBackReport[] = [];

    for (const ct of side.towers) {
        const tower = target.towers.find(t => t.planta_ai_scenario_id === ct.sourceId);
        if (!tower) continue;

        const units = target.units.filter(u => u.tower_id === tower.id);
        if (units.length === 0) continue;

        const distinctFloors = new Set(units.map(u => u.floor).filter(f => f != null));
        const floorsCount = distinctFloors.size || tower.floors_count || 0;
        const totalUnits = units.length;
        const unitsPerFloor = floorsCount > 0 ? Math.round(totalUnits / floorsCount) : totalUnits;
        const totalPrivate = units.reduce((s, u) => s + (u.private_area || 0), 0);
        const totalCommon = units.reduce((s, u) => s + (u.common_area || 0), 0);

        // O cenário cru: o write-back compara contra os agregados da origem, não contra a
        // projeção canônica que o planner usa.
        const sc = ct.sourceRaw as PlantScenario;
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

        reports.push({
            scenarioId: sc.id,
            scenarioName: sc.name,
            changes,
            unitsWithoutPlantaOrigin: units.filter(u => !u.planta_ai_unit_id).length,
        });
    }

    return reports;
}
