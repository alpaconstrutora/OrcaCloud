// services/blueprintEmpreendimentoSync.ts
//
// Ponte LOTEAMENTO (Planta Inteligente) → Empreendimento, a terceira aresta do
// centro da verdade:
//
//   Imovib ──────────────► Empreendimento (empreendimentoService.syncFromStudy)
//   Planta IA ───────────► Empreendimento (plantaEmpreendimentoSync)
//   Planta Inteligente ──► Empreendimento (este arquivo)
//
// O motor de diff/plano/escrita vive em `services/sync/` e é COMPARTILHADO com
// as outras duas arestas — este arquivo é só a cola. Nenhuma lógica de
// comparação, adoção, órfão ou conflito é escrita aqui de novo.
//
// Proveniência (migration `aplicar_20270925000020`):
//   blueprint_studies → empreendimentos.blueprint_study_id
//   Quadra (uid)      → empreendimento_towers.blueprint_quadra_uid
//   Lote (uid)        → empreendimento_units.blueprint_lote_uid
//
// Regras herdadas, e que valem igual aqui: órfão é reportado e NUNCA deletado;
// o sync é ESTRUTURAL (preço e status são do Empreendimento, escritos só na
// criação); o nome da torre é dado local depois de criada.
//
// ⚠️ NÃO há write-back. O desenho é a origem: mudar a área de um lote é mover
// vértice na planta, não editar um número no cadastro. Escrever de volta exigiria
// reconstruir geometria a partir de uma área — o que não tem solução única.

import { Empreendimento, PlantaAiSyncReport } from '../types/empreendimento';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { loadBlueprintSide } from './sync/blueprintAdapter';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import { CanonicalSide, SyncPlan, TargetState } from './sync/types';

interface BlueprintSync {
  side: CanonicalSide;
  target: TargetState;
  plan: SyncPlan;
}

async function planBlueprintSync(empreendimentoId: string): Promise<BlueprintSync> {
  const empreendimento = (await empreendimentoService.getById(empreendimentoId)) as Empreendimento | null;
  if (!empreendimento) throw new Error('Empreendimento não encontrado.');

  const [side, target] = await Promise.all([
    loadBlueprintSide(empreendimento),
    loadTargetState(empreendimentoId),
  ]);
  return { side, target, plan: buildPlan(side, target) };
}

/**
 * "Atualizado" é a ENTIDADE com pelo menos um campo divergente, não a soma dos
 * campos: dizer "12 unidades a atualizar" quando são 3 unidades com 4 campos
 * cada faria o usuário conferir doze coisas que não existem.
 */
function planToReport(sync: BlueprintSync): PlantaAiSyncReport {
  const tocadas = new Set<string>();
  for (const c of [...sync.plan.fills, ...sync.plan.conflicts]) tocadas.add(`${c.entity}|${c.entityId}`);
  const contar = (entidade: 'tower' | 'unit') =>
    [...tocadas].filter((k) => k.startsWith(`${entidade}|`)).length;

  return {
    towersCreated: sync.plan.towerCreates.length,
    towersUpdated: contar('tower'),
    unitsCreated: sync.plan.unitCreates.length + sync.plan.towerCreates.reduce((s, t) => s + t.units.length, 0),
    unitsUpdated: contar('unit'),
    scenarioUnits: sync.side.towers.reduce((s, t) => s + t.units.length, 0),
    orphanTowers: sync.plan.orphanTowers,
    orphanUnits: sync.plan.orphanUnits,
    warnings: sync.plan.warnings.concat(sync.side.warnings),
  };
}

export const blueprintEmpreendimentoSync = {
  /** Vincula o empreendimento a um estudo da Planta Inteligente. */
  async linkStudy(empreendimentoId: string, blueprintStudyId: string): Promise<void> {
    await empreendimentoService.update(empreendimentoId, { blueprint_study_id: blueprintStudyId });
  },

  /** Ensaio: monta o plano e conta, sem escrever nada. */
  async previewSync(empreendimentoId: string): Promise<PlantaAiSyncReport> {
    return planToReport(await planBlueprintSync(empreendimentoId));
  },

  /**
   * Aplica. Os conflitos NÃO são escritos: viram propostas na Curadoria, onde
   * alguém decide. Quem escreve é `applyPlan`, e só os `fills`.
   */
  async syncToEmpreendimento(empreendimentoId: string): Promise<PlantaAiSyncReport> {
    const sync = await planBlueprintSync(empreendimentoId);

    if (sync.plan.conflicts.length > 0) {
      await empreendimentoProposalService.materializeConflicts(
        empreendimentoId,
        sync.side.empreendimento.organization_id,
        sync.plan.conflicts,
      );
    }

    await applyPlan(sync.plan);
    const report = planToReport(sync);

    await empreendimentoAuditService.record({
      empreendimentoId,
      organizationId: sync.side.empreendimento.organization_id,
      entityType: 'study_link',
      entityId: sync.side.empreendimento.blueprint_study_id ?? null,
      entityLabel: 'Loteamento da Planta Inteligente',
      action: 'sync',
      source: 'sync_blueprint',
      // Um evento resumo, como nas outras arestas: o sync mexe em centenas de
      // lotes, e um evento por lote afogaria o histórico.
      metadata: {
        quadrasCriadas: report.towersCreated,
        quadrasAtualizadas: report.towersUpdated,
        lotesCriados: report.unitsCreated,
        lotesAtualizados: report.unitsUpdated,
        lotesNoDesenho: report.scenarioUnits,
        quadrasOrfas: report.orphanTowers.length,
        lotesOrfaos: report.orphanUnits.length,
        conflitosParaCuradoria: sync.plan.conflicts.length,
      },
    });

    return report;
  },
};
