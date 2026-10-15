/**
 * OS PONTOS ELÉTRICOS PELA NORMA, por ambiente e por pavimento (F9 da casa automática, 15/10/2026).
 *
 * Tomadas (NBR 5410 9.5.2.2.1 — só no ambiente com tipo) e luz de teto com interruptor (9.5.2.1 — todo
 * ambiente). Era o mesmo encadeamento em dois lugares — o "Completar pela norma" do editor e o automático
 * "tomadas e luz" do gerador E6.2 —, e a casa automática seria o terceiro: aqui fica um só.
 *
 *   conferirTomadas → distribuirAoLongo (o déficit, pelos lados de piso) → comandosParaCompletar
 *   conferirIluminacao → comandosDeIluminacao
 *
 * Por ambiente, os comandos SEM potência (quem chama aplica `aplicarPotenciaPadrao` no lote todo, com o
 * modelo de ANTES — a contagem das 3 primeiras de 600 VA é sequencial). Por pavimento, já com a potência.
 */
import type { BlueprintModel, Command, ObjectId, Point, Space } from './blueprintKernel';
import { areaRecuada } from './blueprintKernel';
import { comandosDeIluminacao, comandosParaCompletar, conferirIluminacao, conferirTomadas, distribuirAoLongo, etiquetaDoAmbiente, ladosDePiso } from './blueprintDistribuicao';
import { aplicarPotenciaPadrao } from './blueprintPotenciaPadrao';

export interface OpcoesDosPontosEletricos {
  /** O pé-direito do pavimento (a luz de teto). */
  peDireitoMm: number;
  /** E6.3: uma luz de teto a cada tantos m² (null = uma por ambiente). */
  areaPorLuminariaM2?: number | null;
  /** Posições já ocupadas na parede, que as tomadas novas evitam. Ausente = nenhuma. */
  ocupados?: readonly Point[];
}

/** Os comandos que completam um ambiente pela norma — sem potência. */
export function comandosDePontosDoAmbiente(model: BlueprintModel, levelId: ObjectId, space: Space, op: OpcoesDosPontosEletricos): Command[] {
  const paredes = model.walls.filter((w) => w.levelId === space.levelId);
  const terminais = model.terminais ?? [];
  const tipo = etiquetaDoAmbiente(space, model.labels)?.tipoDeAmbiente ?? null;
  const areaM2 = areaRecuada(space.ring, paredes).areaMm2 / 1e6;
  const comandos: Command[] = [];
  const conferencia = conferirTomadas(space, tipo, paredes, terminais, areaM2);
  if (conferencia) {
    // O PILAR também ocupa a parede: a tomada não vai no concreto (casa automática F9, 15/10/2026 — a tomada caía
    // dentro do pilar do encontro e o eletroduto descia por ele). O centro dele bloqueia o trecho em volta, como
    // a tomada que já existe.
    const pilares = (model.structures ?? []).filter((x) => x.kind === 'PILAR' && x.levelId === space.levelId).map((x) => x.pontos[0]);
    const pontos = distribuirAoLongo(ladosDePiso(space, paredes), Math.max(conferencia.deficit, conferencia.deficitMedias), model.walls, model.openings, 150, [...(op.ocupados ?? []), ...pilares]);
    comandos.push(...comandosParaCompletar(levelId, pontos, conferencia));
  }
  comandos.push(...comandosDeIluminacao(levelId, space, model.walls, model.openings, op.peDireitoMm, conferirIluminacao(space, terminais, areaM2, tipo), terminais, op.areaPorLuminariaM2 ?? null));
  return comandos;
}

/** Todos os ambientes do pavimento, num lote só, já com a potência padrão. */
export function comandosDePontosDoNivel(model: BlueprintModel, levelId: ObjectId, op: OpcoesDosPontosEletricos): Command[] {
  const comandos = model.spaces.filter((s) => s.levelId === levelId).flatMap((s) => comandosDePontosDoAmbiente(model, levelId, s, op));
  return aplicarPotenciaPadrao(model, comandos);
}
