// services/sync/relatorio.ts
//
// Relatório de um sync da Planta Inteligente (massa ou loteamento) → Empreendimento. Era
// duplicado em massaEmpreendimentoSync e blueprintEmpreendimentoSync, e os dois contavam os
// conflitos como "a atualizar" mesmo depois de irem para a Curadoria — a contagem nunca
// zerava (docs/planos/2026-10-20-empreendimento-aba-sincronizacao.md, item 1).

import { ArquiteturaSyncReport } from '../../types/empreendimento';
import type { ConflitosClassificados } from '../empreendimentoProposalService';
import { CanonicalSide, SyncPlan } from './types';

/**
 * "Atualizado" é a ENTIDADE com pelo menos um campo a gravar, não a soma dos campos: dizer
 * "12 unidades a atualizar" quando são 3 unidades com 4 campos cada faria o usuário conferir
 * doze coisas que não existem.
 *
 * "A atualizar" conta só os `fills` — o que o envio GRAVA. Conflito não é gravado (vira proposta
 * na Curadoria), então tem contagem própria, em campos: `conflitosNovos` (este envio manda à
 * Curadoria), `conflitosNaCuradoria` (já esperando decisão) e `conflitosRejeitados` (decididos:
 * fica o valor do empreendimento). Só os novos são trabalho a fazer. Sem `curadoria`, todo
 * conflito conta como novo.
 */
export function relatorioDoPlano(
  side: CanonicalSide,
  plan: SyncPlan,
  curadoria: ConflitosClassificados = { novos: plan.conflicts, pendentes: [], rejeitados: [] },
): ArquiteturaSyncReport {
  const tocadas = new Set<string>();
  for (const c of plan.fills) tocadas.add(`${c.entity}|${c.entityId}`);
  const contar = (e: 'tower' | 'unit') => [...tocadas].filter((k) => k.startsWith(`${e}|`)).length;
  return {
    towersCreated: plan.towerCreates.length,
    towersUpdated: contar('tower'),
    unitsCreated: plan.unitCreates.length + plan.towerCreates.reduce((s, t) => s + t.units.length, 0),
    unitsUpdated: contar('unit'),
    scenarioUnits: side.towers.reduce((s, t) => s + t.units.length, 0),
    orphanTowers: plan.orphanTowers,
    orphanUnits: plan.orphanUnits,
    // `plan.warnings` já começa com os da origem (o planner os copia): somar de novo duplicava.
    warnings: plan.warnings,
    conflitosNovos: curadoria.novos.length,
    conflitosNaCuradoria: curadoria.pendentes.length,
    conflitosRejeitados: curadoria.rejeitados.length,
  };
}
