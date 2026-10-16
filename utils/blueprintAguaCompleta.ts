/**
 * A ÁGUA INTEIRA NUM CLIQUE (13/10/2026).
 *
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 5.3 — o
 * irmão do `planejarEsgotoCompleto`. Um lote só (um Ctrl+Z desfaz tudo), cada
 * etapa planejada sobre o modelo já com a anterior aplicada:
 *
 *   1. as PEÇAS DA CAIXA (torneira de boia, extravasor, limpeza) de cada
 *      reservatório — idempotente; é a boia que o alimentador procura;
 *   2. a REDE de água de cada origem, com o DN ajustado pela pressão (E1.4) — o
 *      mesmo critério do "Lançar em todas as origens": lança o que falta; sem
 *      nada novo, relança os sugeridos;
 *   3. o ALIMENTADOR, do hidrômetro à boia (o hidrômetro nasce na frente do
 *      lote se faltar);
 *   4. o RECALQUE, quando há reservatório inferior.
 *
 * O que foi presumido volta em texto; o que falta do mundo volta como
 * pendência e não impede as outras etapas.
 */
import { applyBatch, type BlueprintModel, type Command } from './blueprintKernel';
import { planejarAguaDoModelo, relancarAgua, type HipotesesDeAgua } from './blueprintAguaAutomatica';
import { comAjusteDePressao, type HipotesesDePressao } from './blueprintPressaoDaRede';
import { planejarPecasDaCaixa } from './blueprintPecasDaCaixa';
import { planejarAlimentador, type HipotesesDeAlimentacao } from './blueprintAlimentador';
import { planejarRecalque, type HipotesesDeRecalque } from './blueprintRecalque';
import type { HipotesesDeReservatorio } from './blueprintReservacao';
import type { LeitorDoTerreno } from './blueprintAncorasHidro';

export interface HipotesesDaAguaCompleta {
  agua: HipotesesDeAgua;
  pressao: HipotesesDePressao & { qMaxDoHidrometroM3h: number };
  alimentacao: HipotesesDeAlimentacao;
  reservatorio: HipotesesDeReservatorio;
  recalque: HipotesesDeRecalque;
}

export interface PlanoDaAguaCompleta {
  comandos: Command[];
  presumido: string[];
  pendencias: string[];
}

const m2 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function planejarAguaCompleta(model: BlueprintModel, hip: HipotesesDaAguaCompleta, terreno: LeitorDoTerreno | null = null): PlanoDaAguaCompleta {
  const comandos: Command[] = [];
  const presumido: string[] = [];
  const pendencias: string[] = [];
  let m = model;
  const aplicar = (cs: Command[]) => {
    if (cs.length === 0) return;
    comandos.push(...cs);
    m = applyBatch(m, cs).model;
  };

  // 1. As peças de cada caixa d'água.
  for (const caixa of (m.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA').sort((a, b) => a.id.localeCompare(b.id))) {
    const atual = (m.terminais ?? []).find((t) => t.id === caixa.id);
    if (atual) aplicar(planejarPecasDaCaixa(m, atual, hip.alimentacao.dnMinimoMm).comandos);
  }

  // 2. A rede de cada origem, com o ajuste de pressão — EM SEQUÊNCIA, cada uma sobre o modelo com as de antes (a mesma
  // ordem do lote: os ids batem). F14c: a pressão da QUENTE parte do que a fria entrega ao aquecedor; ajustada sobre o
  // modelo sem a fria ("a rede fria não chega ao aquecedor"), o diâmetro dela nunca aumentava — no sobrado, o chuveiro
  // de cima ficava abaixo do mínimo mesmo com o pressurizador e a caixa elevada.
  const planosBrutos = planejarAguaDoModelo(m, hip.agua);
  if (planosBrutos.length === 0) pendencias.push("Sem origem de água no desenho (caixa d'água ou aquecedor).");
  const daRede: Command[] = [];
  let mRede = m;
  for (const bruto of planosBrutos) {
    const p = comAjusteDePressao(mRede, bruto, hip.pressao);
    let cs = p.comandos;
    if (cs.length === 0 && p.sugeridos > 0) {
      const origem = (mRede.terminais ?? []).find((t) => t.id === p.origemId);
      cs = origem ? comAjusteDePressao(mRede, relancarAgua(mRede, origem, hip.agua), hip.pressao).comandos : [];
    }
    if (cs.length === 0) continue;
    daRede.push(...cs);
    mRede = applyBatch(mRede, cs).model;
  }
  aplicar(daRede);

  // 3. O alimentador (o hidrômetro, se faltar, nasce na frente do lote).
  const alim = planejarAlimentador(m, hip.alimentacao, hip.reservatorio, hip.pressao.qMaxDoHidrometroM3h, terreno);
  if (alim.motivo) pendencias.push(alim.motivo);
  else {
    if (alim.hidrometroProposto) presumido.push(`Hidrômetro posto no cavalete da frente do lote, a ${m2(alim.hidrometroProposto.cotaMm)} m.`);
    aplicar(alim.comandos);
  }

  // 4. O recalque, com reservatório inferior.
  const rec = planejarRecalque(m, hip.recalque, hip.reservatorio);
  if (rec.motivo) pendencias.push(rec.motivo);
  else if (rec.inferiorId) aplicar(rec.comandos);

  if (presumido.length > 0) presumido.push('Arraste as peças para onde estão de verdade (o plano recalcula).');
  return { comandos, presumido, pendencias };
}
