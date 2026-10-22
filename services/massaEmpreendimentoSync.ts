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

import { Empreendimento, ArquiteturaSyncReport } from '../types/empreendimento';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { loadMassaSide } from './sync/massaAdapter';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import { relatorioDoPlano } from './sync/relatorio';
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

// O relatório é o mesmo do loteamento — mora em `sync/relatorio.ts`; re-exportado aqui
// porque a trava `syncPlantaInteligenteTravas.test.ts` o importa deste arquivo.
export { relatorioDoPlano };

export const massaEmpreendimentoSync = {
  /** Vincula o empreendimento ao estudo (o mesmo vínculo do loteamento). */
  async linkStudy(empreendimentoId: string, blueprintStudyId: string): Promise<void> {
    await empreendimentoService.update(empreendimentoId, { blueprint_study_id: blueprintStudyId });
  },

  /** Ensaio: monta o plano e conta, sem escrever nada. O que já está na Curadoria não conta como "a trazer". */
  async previewSync(empreendimentoId: string): Promise<ArquiteturaSyncReport> {
    const s = await planMassaSync(empreendimentoId);
    const curadoria = await empreendimentoProposalService.classificarConflitos(empreendimentoId, s.plan.conflicts);
    return relatorioDoPlano(s.side, s.plan, curadoria);
  },

  /** Aplica: `fills` escritos; conflitos viram propostas na Curadoria. */
  async syncToEmpreendimento(empreendimentoId: string): Promise<ArquiteturaSyncReport> {
    const s = await planMassaSync(empreendimentoId);
    const curadoria = await empreendimentoProposalService.classificarConflitos(empreendimentoId, s.plan.conflicts);
    if (s.plan.conflicts.length > 0) {
      await empreendimentoProposalService.materializeConflicts(empreendimentoId, s.side.empreendimento.organization_id, s.plan.conflicts);
    }
    await applyPlan(s.plan);
    // O que este envio gravou: os `fills`. Os conflitos novos agora esperam na Curadoria.
    const report: ArquiteturaSyncReport = {
      ...relatorioDoPlano(s.side, s.plan, { novos: [], pendentes: [...curadoria.pendentes, ...curadoria.novos], rejeitados: curadoria.rejeitados }),
      conflitosEnviados: curadoria.novos.length,
    };
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
        conflitosParaCuradoria: curadoria.novos.length,
        conflitosJaNaCuradoria: curadoria.pendentes.length,
        conflitosRejeitados: curadoria.rejeitados.length,
      },
    });
    return report;
  },
};
