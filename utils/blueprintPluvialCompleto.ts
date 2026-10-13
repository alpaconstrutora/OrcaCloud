/**
 * A ÁGUA DA CHUVA INTEIRA NUM CLIQUE (13/10/2026).
 *
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 5.3 — o
 * irmão do `planejarEsgotoCompleto`. Um lote só (um Ctrl+Z desfaz tudo):
 *
 *   1. as CALHAS de cada beiral, com os bocais;
 *   2. os CONDUTORES, do bocal à caixa de areia e à saída (a saída nasce na
 *      frente do lote se não houver caixa nem saída).
 *
 * Os condutores são planejados sobre o modelo já com as calhas — é delas que
 * saem os bocais.
 */
import { applyBatch, type BlueprintModel, type Command } from './blueprintKernel';
import { planejarCalhas } from './blueprintCalhas';
import { planejarCondutores } from './blueprintCondutoresPluviais';
import type { HipotesesPluviais } from './blueprintPluvial';
import type { LeitorDoTerreno } from './blueprintAncorasHidro';

export interface PlanoDaPluvialCompleta {
  comandos: Command[];
  presumido: string[];
  pendencias: string[];
}

/** Calhas e depois condutores, sobre o modelo dado. */
function calhasECondutores(model: BlueprintModel, hip: HipotesesPluviais, terreno: LeitorDoTerreno | null) {
  const calhas = planejarCalhas(model, hip);
  const c1 = calhas.motivo ? [] : calhas.comandos;
  const condutores = planejarCondutores(c1.length > 0 ? applyBatch(model, c1).model : model, hip, terreno);
  return { calhas, c1, condutores, c2: condutores.motivo ? [] : condutores.comandos };
}

export function planejarPluvialCompleta(model: BlueprintModel, hip: HipotesesPluviais, terreno: LeitorDoTerreno | null = null): PlanoDaPluvialCompleta {
  let r = calhasECondutores(model, hip, terreno);
  let comandos = [...r.c1, ...r.c2];
  // ⚠️ DUAS PASSADAS quando a saída é PROPOSTA. A calha põe o bocal na ponta mais
  // perto do destino (caixa de areia ou saída) — e na 1ª passada a saída ainda não
  // existe: o bocal cairia na ponta errada, e o 2º clique o mudaria de lado. Então a
  // saída entra PRIMEIRO, e calhas e condutores são refeitos com ela no desenho.
  const proposta = r.condutores.saidaProposta && r.c2.length > 0 ? r.c2[0] : null;
  const aviso = r.condutores.saidaProposta ? r.condutores.avisos[0] : null;
  if (proposta) {
    r = calhasECondutores(applyBatch(model, [proposta]).model, hip, terreno);
    comandos = [proposta, ...r.c1, ...r.c2];
  }
  const pendencias = [r.calhas.motivo, r.condutores.motivo].filter((x): x is string => !!x);
  const presumido = proposta && aviso
    ? [aviso.replace(/^saída/, 'Saída') + '.', 'Arraste a saída para onde a água realmente deixa o lote (o plano recalcula).']
    : [];
  return { comandos, presumido, pendencias };
}
