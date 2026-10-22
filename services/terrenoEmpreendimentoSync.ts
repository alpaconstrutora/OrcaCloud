// services/terrenoEmpreendimentoSync.ts
//
// TERRENO da Planta Inteligente → ficha do Empreendimento, pela aba Sincronização (22/10/2026 —
// plano docs/planos/2026-10-22-planta-empreendimento-pendencias.md, item 5).
//
// Mesma cola das outras arestas (`blueprintEmpreendimentoSync`): o motor de diff/plano/escrita é o
// de `services/sync/`; aqui só se monta o lado canônico — sem torres nem unidades, só os campos do
// próprio empreendimento (`empreendimentoFields`). As regras são as de toda a sincronização:
//   - fonte = versão PUBLICADA (o rascunho muda a cada gesto; quem compara o rascunho é a tela
//     Torres & Unidades › Terreno e o "Levar à ficha" da Planta);
//   - ficha vazia → preenche direto; valor diferente → proposta na Curadoria; igual → nada;
//   - medidas DESENHADAS, profundidade = média das laterais, tipo Regular/Irregular (decisões do
//     usuário de 21/10/2026, em `utils/blueprintTerrenoDaFicha.ts`).

import { supabase } from '../lib/supabase';
import type { Empreendimento } from '../types/empreendimento';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoProposalService } from './empreendimentoProposalService';
import { empreendimentoAuditService } from './empreendimentoAuditService';
import { getSnapshot, listSnapshots } from './blueprintService';
import { modeloDoPayloadPublicado } from './sync/modeloPublicado';
import { buildPlan } from './sync/planner';
import { applyPlan } from './sync/applier';
import type { CanonicalSide, FieldChange, SyncPlan } from './sync/types';
import { medirTerreno } from '../utils/blueprintTerreno';
import { divisasDoLoteDoModelo, medidasDaPlantaParaFicha } from '../utils/blueprintTerrenoDaFicha';

export interface TerrenoSyncReport {
  /** Preenchem campo vazio da ficha — aplicam direto. */
  fills: FieldChange[];
  /** Divergem do que a ficha tem e ainda não têm decisão — o próximo envio os manda à Curadoria.
   *  No resultado do envio: os que ESTE envio mandou. */
  conflicts: FieldChange[];
  /** Divergências já na Curadoria, esperando decisão — não são trabalho desta aba (ausente = []). */
  naCuradoria?: FieldChange[];
  /** Rejeitadas na Curadoria: a ficha fica como está, por decisão do usuário (ausente = []). */
  rejeitados?: FieldChange[];
  /** Por que não há o que comparar (sem versão publicada, sem lote fechado); `null` = comparou. */
  motivo: string | null;
}

interface TerrenoSync {
  empreendimento: Empreendimento;
  plan: SyncPlan | null;
  motivo: string | null;
}

async function planTerrenoSync(empreendimentoId: string): Promise<TerrenoSync> {
  const empreendimento = (await empreendimentoService.getById(empreendimentoId)) as Empreendimento | null;
  if (!empreendimento) throw new Error('Empreendimento não encontrado.');
  const studyId = empreendimento.blueprint_study_id;
  if (!studyId) return { empreendimento, plan: null, motivo: 'Este empreendimento não está vinculado a uma planta.' };

  const { data: study, error } = await supabase.from('blueprint_studies').select('id, organization_id').eq('id', studyId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar a planta vinculada: ${error.message}`);
  if (!study) throw new Error('A planta vinculada não foi encontrada.');
  // Blindagem multi-tenant, como nas outras arestas.
  if ((study as { organization_id: string }).organization_id !== empreendimento.organization_id) {
    throw new Error('A planta vinculada pertence a outra organização. Sincronização bloqueada.');
  }

  const snapshots = await listSnapshots(studyId);
  if (snapshots.length === 0) return { empreendimento, plan: null, motivo: 'A planta ainda não tem versão publicada — o terreno vem da versão publicada.' };
  const maisRecente = snapshots.reduce((a, b) => (b.revision > a.revision ? b : a));
  const snapshot = await getSnapshot(maisRecente.id);
  if (!snapshot) throw new Error('A versão publicada da planta não pôde ser carregada.');
  const model = modeloDoPayloadPublicado(snapshot.payload);

  const limites = divisasDoLoteDoModelo(model.boundaries ?? [], model.levels ?? []);
  const terreno = medirTerreno(limites);
  if (!terreno?.fechado) return { empreendimento, plan: null, motivo: 'A versão publicada não tem lote fechado.' };
  const m = medidasDaPlantaParaFicha(terreno, limites);

  const side: CanonicalSide = {
    origin: 'blueprint',
    empreendimento,
    towers: [],
    commonAreaCandidates: [],
    liveTowerSourceIds: new Set(),
    liveUnitSourceIds: new Set(),
    warnings: [],
    empreendimentoFields: {
      terreno_tipo: m.tipo,
      terreno_area: m.areaM2,
      terreno_frente: m.frenteM,
      terreno_fundos: m.fundosM,
      terreno_profundidade: m.profundidadeM,
      terreno_lateral_direita: m.lateralDireitaM,
      terreno_lateral_esquerda: m.lateralEsquerdaM,
    },
  };
  // Destino vazio de torres/unidades de propósito: este plano só fala do terreno, e com as torres
  // reais aqui o planner acusaria todas as do loteamento como órfãs deste "lado".
  return { empreendimento, plan: buildPlan(side, { towers: [], units: [], commonAreas: [] }), motivo: null };
}

export const terrenoEmpreendimentoSync = {
  /** Ensaio: o que preencheria e o que iria à Curadoria, sem escrever nada. O que já está na
   *  Curadoria (ou foi rejeitado lá) sai de `conflicts` — senão seria contado para sempre
   *  (docs/planos/2026-10-20-empreendimento-aba-sincronizacao.md, item 1). */
  async previewSync(empreendimentoId: string): Promise<TerrenoSyncReport> {
    const s = await planTerrenoSync(empreendimentoId);
    if (!s.plan) return { fills: [], conflicts: [], naCuradoria: [], rejeitados: [], motivo: s.motivo };
    const c = await empreendimentoProposalService.classificarConflitos(empreendimentoId, s.plan.conflicts);
    return { fills: s.plan.fills, conflicts: c.novos, naCuradoria: c.pendentes, rejeitados: c.rejeitados, motivo: s.motivo };
  },

  /** Aplica: vazios entram na ficha; divergências viram propostas na Curadoria. */
  async syncToEmpreendimento(empreendimentoId: string): Promise<TerrenoSyncReport> {
    const s = await planTerrenoSync(empreendimentoId);
    if (!s.plan) return { fills: [], conflicts: [], naCuradoria: [], rejeitados: [], motivo: s.motivo };
    const c = await empreendimentoProposalService.classificarConflitos(empreendimentoId, s.plan.conflicts);
    if (s.plan.conflicts.length > 0) {
      await empreendimentoProposalService.materializeConflicts(empreendimentoId, s.empreendimento.organization_id, s.plan.conflicts);
    }
    await applyPlan(s.plan);
    await empreendimentoAuditService.record({
      empreendimentoId,
      organizationId: s.empreendimento.organization_id,
      entityType: 'study_link',
      entityId: s.empreendimento.blueprint_study_id ?? null,
      entityLabel: 'Terreno da Planta Inteligente',
      action: 'sync',
      source: 'sync_blueprint',
      metadata: {
        camposPreenchidos: s.plan.fills.map((c) => c.field),
        conflitosParaCuradoria: c.novos.map((x) => x.field),
        conflitosJaNaCuradoria: c.pendentes.map((x) => x.field),
        conflitosRejeitados: c.rejeitados.map((x) => x.field),
      },
    });
    return { fills: s.plan.fills, conflicts: c.novos, naCuradoria: [...c.pendentes, ...c.novos], rejeitados: c.rejeitados, motivo: null };
  },
};
