/**
 * Prédio automático — a ESTRUTURA (PA4 do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026). Os mesmos
 * planejadores da casa (pilares, vigas, lajes, fundações, eixos), com a regra do prédio:
 *
 * - Pilares, vigas e lajes no TIPO, sobre o esqueleto da montagem (perímetro, corredor, divisas das unidades, núcleo) —
 *   a etapa roda ANTES das plantas, para os pilares não caírem nas divisórias internas dos apartamentos. As cópias vivas
 *   recebem a estrutura do tipo; vigas e lajes de um pavimento são o teto dele (o piso do de cima), então a laje do
 *   último andar é a da cobertura.
 * - O térreo recebe a MESMA malha (as peças do tipo coladas por `DuplicateEntities`): pilar em prumada do térreo ao
 *   último andar, e a laje do térreo é o piso do tipo.
 * - Fundação sob os pilares do pavimento que assenta no chão — marcada pelas hipóteses da gaveta, com a pendência de que
 *   a de um prédio exige cálculo (a hipótese da casa não serve para N pavimentos).
 * - Eixos por último: documentam a malha lançada (a lição da casa — antes dos pilares, eles a ditavam).
 */
import type { ObjectId } from '../blueprintKernel';
import { HIPOTESES_EIXOS_PADRAO, propostaDeEixos } from '../blueprintEixosAutomaticos';
import { HIPOTESES_FUNDACOES_PADRAO, planejarFundacoes } from '../blueprintFundacoesAutomaticas';
import { HIPOTESES_PILARES_PADRAO, planejarPilares } from '../blueprintPilaresAutomaticos';
import { HIPOTESES_LAJES_PADRAO, HIPOTESES_VIGAS_PADRAO, planejarLajes, planejarVigas } from '../blueprintVigasLajesAutomaticas';
import type { ContextoDoPredio } from './terreoECobertura';

export interface EstruturaLancada {
  comandos: number;
  pilares: number;
  vigas: number;
  lajes: number;
  eixos: number;
  /** As peças do tipo coladas no térreo (0 sem térreo). */
  noTerreo: number;
  avisos: string[];
  /** O que os planejadores pularam (pilar a menos de uma seção de outro, viga já existente…). */
  foraDoPlano: string[];
}

/** Pilares, vigas e lajes no tipo; a mesma malha no térreo; os eixos do tipo. */
export function lancarEstrutura(ctx: ContextoDoPredio, tipoLevelId: ObjectId, terreoLevelId: ObjectId | null): EstruturaLancada {
  const avisos: string[] = [];
  const foraDoPlano: string[] = [];
  let comandos = 0;
  const pil = planejarPilares(ctx.m, tipoLevelId, HIPOTESES_PILARES_PADRAO);
  if (pil.motivo && !pil.comandos.length) avisos.push(`Pilares: ${pil.motivo}`);
  comandos += ctx.aplicar(pil.comandos);
  foraDoPlano.push(...pil.foraDoPlano.map((f) => `Pilares: ${f.motivo}`));
  const vig = planejarVigas(ctx.m, tipoLevelId, HIPOTESES_VIGAS_PADRAO);
  if (vig.motivo && !vig.comandos.length) avisos.push(`Vigas: ${vig.motivo}`);
  comandos += ctx.aplicar(vig.comandos);
  foraDoPlano.push(...vig.foraDoPlano.map((f) => `Vigas: ${f.motivo}`));
  const laj = planejarLajes(ctx.m, tipoLevelId, HIPOTESES_LAJES_PADRAO);
  if (laj.motivo && !laj.comandos.length) avisos.push(`Lajes: ${laj.motivo}`);
  comandos += ctx.aplicar(laj.comandos);
  foraDoPlano.push(...laj.foraDoPlano.map((f) => `Lajes: ${f.motivo}`));
  avisos.push(...(pil.avisos ?? []).map((a) => `Pilares: ${a}`), ...(vig.avisos ?? []).map((a) => `Vigas: ${a}`));

  // A mesma malha no térreo: as peças do tipo, no mesmo lugar.
  let noTerreo = 0;
  if (terreoLevelId) {
    const doTipo = ctx.m.structures.filter((s) => s.levelId === tipoLevelId).map((s) => s.id);
    if (doTipo.length) {
      comandos += ctx.aplicar([{ type: 'DuplicateEntities', levelId: terreoLevelId, wallIds: [], boundaryIds: [], structuralIds: doTipo, openings: [], delta: { x: 0, y: 0 } }]);
      noTerreo = doTipo.length;
    }
  }

  const eix = propostaDeEixos(ctx.m, tipoLevelId, HIPOTESES_EIXOS_PADRAO);
  comandos += ctx.aplicar(eix.comandos);
  if (eix.paredesObliquas) avisos.push(`Eixos: ${eix.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos.`);
  return { comandos, pilares: pil.pilares.length, vigas: vig.vigas.length, lajes: laj.lajes.length, eixos: eix.novos, noTerreo, avisos, foraDoPlano };
}

export interface FundacaoLancada {
  comandos: number;
  blocos: number;
  estacas: number;
  baldrames: number;
  motivo: string | null;
  avisos: string[];
}

/** A fundação sob os pilares do pavimento que assenta no chão (o térreo, ou o tipo quando ele É o térreo). */
export function lancarFundacao(ctx: ContextoDoPredio, levelId: ObjectId): FundacaoLancada {
  const f = planejarFundacoes(ctx.m, levelId, HIPOTESES_FUNDACOES_PADRAO);
  const comandos = ctx.aplicar(f.comandos);
  return { comandos, blocos: f.blocos.length, estacas: f.estacas.length, baldrames: f.baldrames.length, motivo: f.comandos.length ? null : f.motivo, avisos: f.avisos ?? [] };
}

/** A pendência que a fundação do prédio sempre leva — as dimensões são hipóteses de gaveta, não cálculo. */
export function pendenciaDaFundacao(pavimentos: number): string {
  const h = HIPOTESES_FUNDACOES_PADRAO;
  return `Fundações: marcadas pelas hipóteses da gaveta (${h.estacasPorBloco} estaca(s) Ø ${h.diametroDaEstacaMm} mm × ${(h.comprimentoDaEstacaMm / 1000).toLocaleString('pt-BR')} m por bloco) — é pré-dimensionamento: a fundação de um prédio de ${pavimentos} pavimentos exige cálculo com a sondagem (NBR 6122).`;
}
