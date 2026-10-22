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

import { Empreendimento, ArquiteturaSyncReport } from '../types/empreendimento';
import { empreendimentoService, loadTargetState } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { loadBlueprintSide } from './sync/blueprintAdapter';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import { relatorioDoPlano } from './sync/relatorio';
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

export const blueprintEmpreendimentoSync = {
  /** Vincula o empreendimento a um estudo da Planta Inteligente. */
  async linkStudy(empreendimentoId: string, blueprintStudyId: string): Promise<void> {
    await empreendimentoService.update(empreendimentoId, { blueprint_study_id: blueprintStudyId });
  },

  /** Ensaio: monta o plano e conta, sem escrever nada. O que já está na Curadoria não conta como "a trazer". */
  async previewSync(empreendimentoId: string): Promise<ArquiteturaSyncReport> {
    const sync = await planBlueprintSync(empreendimentoId);
    const curadoria = await empreendimentoProposalService.classificarConflitos(empreendimentoId, sync.plan.conflicts);
    return relatorioDoPlano(sync.side, sync.plan, curadoria);
  },

  /**
   * Aplica. Os conflitos NÃO são escritos: viram propostas na Curadoria, onde
   * alguém decide. Quem escreve é `applyPlan`, e só os `fills`.
   */
  async syncToEmpreendimento(empreendimentoId: string): Promise<ArquiteturaSyncReport> {
    const sync = await planBlueprintSync(empreendimentoId);
    const curadoria = await empreendimentoProposalService.classificarConflitos(empreendimentoId, sync.plan.conflicts);

    if (sync.plan.conflicts.length > 0) {
      await empreendimentoProposalService.materializeConflicts(
        empreendimentoId,
        sync.side.empreendimento.organization_id,
        sync.plan.conflicts,
      );
    }

    await applyPlan(sync.plan);
    // O que este envio gravou: os `fills`. Os conflitos novos agora esperam na Curadoria.
    const report: ArquiteturaSyncReport = {
      ...relatorioDoPlano(sync.side, sync.plan, { novos: [], pendentes: [...curadoria.pendentes, ...curadoria.novos], rejeitados: curadoria.rejeitados }),
      conflitosEnviados: curadoria.novos.length,
    };

    await empreendimentoAuditService.record({
      empreendimentoId,
      organizationId: sync.side.empreendimento.organization_id,
      entityType: 'study_link',
      entityId: sync.side.empreendimento.blueprint_study_id ?? null,
      // F15: a casa automática tem a torre e a unidade com a chave do próprio estudo.
      entityLabel: sync.side.towers.some((t) => t.sourceId === sync.side.empreendimento.blueprint_study_id) ? 'Casa da Planta Inteligente' : 'Loteamento da Planta Inteligente',
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
        conflitosParaCuradoria: curadoria.novos.length,
        conflitosJaNaCuradoria: curadoria.pendentes.length,
        conflitosRejeitados: curadoria.rejeitados.length,
      },
    });

    return report;
  },
};
