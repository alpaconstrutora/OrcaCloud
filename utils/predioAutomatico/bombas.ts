/**
 * As BOMBAS de um poço da garagem no quadro dela (PA8c, extraído na PE6b — 18/11/2026 — para o esgoto da torre abaixo
 * da rua usar o mesmo): duas bombas (uma reserva) ao lado do poço, os circuitos pelo planejador do quadro da garagem
 * daquele subsolo (o QDG, filho do quadro de serviço), a seção pela queda de tensão e o DR que a NBR 5410 pedir.
 */
import type { Command, ObjectId, Point } from '../blueprintKernel';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, preDimensionarCircuito } from '../blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, sugerirDRs } from '../blueprintNbr5410';
import type { ContextoDoPredio } from './terreoECobertura';

const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;

/** `null` = o subsolo não tem o quadro da garagem (sem a elétrica): as bombas ficam sem ponto de força. */
export function ligarBombasNoQuadroDaGaragem(
  ctx: ContextoDoPredio,
  levelId: ObjectId,
  poco: Point,
  potenciaW: number,
  rotulos: readonly [string, string],
): number | null {
  const qdg = ctx.m.quadros.find((q) => q.levelId === levelId && /^QDG/.test(q.nome));
  if (!qdg) return null;
  let comandos = 0;
  const motores: Command[] = [-450, 450].map((dx, i): Command => ({ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Bomba', at: inteiro({ x: poco.x + dx, y: poco.y }), cotaMm: 300, tipoEletrico: 'MOTOR_BOMBA', potenciaW, rotulo: rotulos[i], sugerida: true }));
  comandos += ctx.aplicar(motores);
  const antes = new Set(ctx.m.circuitos.map((c) => c.id));
  const plano = planejarCircuitos(ctx.m, levelId, qdg.id, HIPOTESES_CIRCUITOS_PADRAO, HIPOTESES_ELETRICAS_PADRAO);
  comandos += ctx.aplicar(plano.comandos);
  const novos = ctx.m.circuitos.filter((c) => !antes.has(c.id));
  comandos += ctx.aplicar([
    ...novos.map((c) => ({ c, s: preDimensionarCircuito(ctx.m, c, HIPOTESES_ELETRICAS_PADRAO).secaoParaQuedaMm2 })).filter((x) => x.s != null).map((x): Command => ({ type: 'SetCircuitoProps', circuitoId: x.c.id, secaoMm2: x.s! })),
  ]);
  comandos += ctx.aplicar(comandosDasSugestoesDeDR(sugerirDRs(ctx.m, qdg.id, HIPOTESES_ELETRICAS_PADRAO)));
  return comandos;
}
