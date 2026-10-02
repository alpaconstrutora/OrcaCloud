// services/massaEmpreendimentoSync.ts
//
// Ponte ESTUDO DE MASSA (Planta Inteligente) → Empreendimento, a quarta aresta
// do centro da verdade (fase M3 do plano `2026-10-01-estudo-de-massa.md`):
//
//   Imovib ──────────────► Empreendimento (empreendimentoService.syncFromStudy)
//   Planta IA ───────────► Empreendimento (plantaEmpreendimentoSync)
//   Loteamento ──────────► Empreendimento (blueprintEmpreendimentoSync)
//   Estudo de Massa ─────► Empreendimento (este arquivo)
//
// Só a cola: diff, adoção por nome, órfão, conflito → Curadoria e escrita são do
// motor em `services/sync/`, compartilhado. Daí em diante a Viabilidade (Imovib)
// recebe pelo caminho que já existe (Empreendimento ↔ Imovib).
//
// Proveniência (migration `aplicar_20271002000020`):
//   blueprint_studies → empreendimentos.blueprint_study_id (o mesmo do loteamento)
//   Bloco (uid)       → empreendimento_towers.blueprint_bloco_uid
//   Unidade derivada  → empreendimento_units.blueprint_massa_chave
//
// Regras herdadas: órfão é reportado e NUNCA apagado; o sync é estrutural (preço
// e status são do Empreendimento, escritos só na criação); sem write-back.

import { Empreendimento, PlantaAiSyncReport } from '../types/empreendimento';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { loadMassaSide } from './sync/massaAdapter';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import { CanonicalSide, SyncPlan, TargetState } from './sync/types';

interface MassaSync {
  side: CanonicalSide;
  target: TargetState;
  plan: SyncPlan;
}

async function planMassaSync(empreendimentoId: string): Promise<MassaSync> {
  const empreendimento = (await empreendimentoService.getById(empreendimentoId)) as Empreendimento | null;
  if (!empreendimento) throw new Error('Empreendimento não encontrado.');
  const [side, target] = await Promise.all([loadMassaSide(empreendimento), loadTargetState(empreendimentoId)]);
  return { side, target, plan: buildPlan(side, target) };
}

/** "Atualizado" é a ENTIDADE com campo divergente, não a soma dos campos. */
export function relatorioDoPlano(side: CanonicalSide, plan: SyncPlan): PlantaAiSyncReport {
  const tocadas = new Set<string>();
  for (const c of [...plan.fills, ...plan.conflicts]) tocadas.add(`${c.entity}|${c.entityId}`);
  const contar = (e: 'tower' | 'unit') => [...tocadas].filter((k) => k.startsWith(`${e}|`)).length;
  return {
    towersCreated: plan.towerCreates.length,
    towersUpdated: contar('tower'),
    unitsCreated: plan.unitCreates.length + plan.towerCreates.reduce((s, t) => s + t.units.length, 0),
    unitsUpdated: contar('unit'),
    scenarioUnits: side.towers.reduce((s, t) => s + t.units.length, 0),
    orphanTowers: plan.orphanTowers,
    orphanUnits: plan.orphanUnits,
    warnings: plan.warnings.concat(side.warnings),
  };
}

export const massaEmpreendimentoSync = {
  /** Vincula o empreendimento ao estudo (o mesmo vínculo do loteamento). */
  async linkStudy(empreendimentoId: string, blueprintStudyId: string): Promise<void> {
    await empreendimentoService.update(empreendimentoId, { blueprint_study_id: blueprintStudyId });
  },

  /** Ensaio: monta o plano e conta, sem escrever nada. */
  async previewSync(empreendimentoId: string): Promise<PlantaAiSyncReport> {
    const s = await planMassaSync(empreendimentoId);
    return relatorioDoPlano(s.side, s.plan);
  },

  /** Aplica: `fills` escritos; conflitos viram propostas na Curadoria. */
  async syncToEmpreendimento(empreendimentoId: string): Promise<PlantaAiSyncReport> {
    const s = await planMassaSync(empreendimentoId);
    if (s.plan.conflicts.length > 0) {
      await empreendimentoProposalService.materializeConflicts(empreendimentoId, s.side.empreendimento.organization_id, s.plan.conflicts);
    }
    await applyPlan(s.plan);
    const report = relatorioDoPlano(s.side, s.plan);
    await empreendimentoAuditService.record({
      empreendimentoId,
      organizationId: s.side.empreendimento.organization_id,
      entityType: 'study_link',
      entityId: s.side.empreendimento.blueprint_study_id ?? null,
      entityLabel: 'Estudo de Massa da Planta Inteligente',
      action: 'sync',
      source: 'sync_massa',
      metadata: {
        torresCriadas: report.towersCreated,
        torresAtualizadas: report.towersUpdated,
        unidadesCriadas: report.unitsCreated,
        unidadesAtualizadas: report.unitsUpdated,
        unidadesNaMassa: report.scenarioUnits,
        torresOrfas: report.orphanTowers.length,
        unidadesOrfas: report.orphanUnits.length,
        conflitosParaCuradoria: s.plan.conflicts.length,
      },
    });
    return report;
  },
};
