/**
 * A REDE ANTIGA NO FORRO É DA CASA AUTOMÁTICA? — uma decisão só para os eletrodutos e para a água (correção 2 da F3 do
 * plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026).
 *
 * Contexto: rede lançada no forro ANTES de existir o registro do lançamento não diz com que faixa foi lançada. O editor
 * relança essa rede no forro da casa (as premissas da Casa Automática do estudo, `forroDaCasa`) — pedido do usuário na
 * planta "Garden": *"alterei e não ficou disponível para relançamento"*. Mas a revisão achou o furo: uma planta SEM casa,
 * com forro de verdade e um ramal desenhado à mão acima da face, também "tem rede no forro sem registro" — e relançava no
 * forro da casa, perpetuado depois pelo registro.
 *
 * Por isso o forro da casa só entra quando a rede antiga tem a ASSINATURA da casa:
 *   (b) todo horizontal detectado no forro está EXATAMENTE (±2 mm) numa cota de faixa do forro da casa — `teto −
 *       abaixoDoTetoMm`, ou o degrau dela na parede (`teto − abaixoDoTetoMm − degrauNaParedeMm`);
 *   (c) todo ambiente com forro nos pavimentos dessa rede tem o REBAIXO do forro da casa (`rebaixoDoForroMm`).
 * Sem a assinatura, a rede antiga continua bloqueada, com o motivo.
 *
 * A detecção (o trecho que conta como "no forro") também mora aqui, com o critério que os dois motores já usavam.
 *
 * Puro: sem React, sem banco.
 */
import type { BlueprintModel, ObjectId, Trecho } from './blueprintKernel';
import type { FaixaDoForro } from './blueprintRotaPeloForro';

/** A folga da assinatura: a casa lança em milímetro inteiro; 2 mm cobre o arredondamento do caminho. */
export const TOLERANCIA_DA_ASSINATURA_MM = 2;

/** O que o forro da casa deixa de assinatura na rede: as faixas de cota (das redes do motor) e o rebaixo do forro. */
export interface AssinaturaDoForroDaCasa {
  faixas: readonly FaixaDoForro[];
  rebaixoMm: number;
}

/** O teto, a face mais baixa do forro e o rebaixo de cada ambiente com forro, por pavimento (`null` = sem forro). */
function forroDoNivel(model: BlueprintModel, levelId: ObjectId): { teto: number; face: number; rebaixos: number[] } | null {
  const nivel = model.levels.find((l) => l.id === levelId);
  if (!nivel) return null;
  const forros = (model.labels ?? []).filter((l) => l.levelId === levelId && l.acabamentos?.forro && l.acabamentos.forro.rebaixoMm > 0).map((l) => l.acabamentos!.forro!);
  if (!forros.length) return null;
  const faces = forros.map((f) => nivel.defaultHeightMm - f.rebaixoMm - f.camadas.reduce((n, x) => n + x.espessuraMm, 0));
  return { teto: nivel.defaultHeightMm, face: Math.min(...faces), rebaixos: forros.map((f) => f.rebaixoMm) };
}

/**
 * Os trechos HORIZONTAIS de `trechos` que correm no forro: num pavimento com forro de verdade (ambiente com rebaixo),
 * acima da face mais baixa dele, a menos de 60 cm do teto (estrito), fora da cota em que o próprio motor lança sem forro
 * (`cotaForaDoForro`) e sem terminar num terminal na mesma cota (a saída até a face da peça).
 */
export function horizontaisNoForro(
  model: BlueprintModel,
  trechos: readonly Trecho[],
  cotaForaDoForro: (levelId: ObjectId, tetoMm: number) => number | null,
): Trecho[] {
  const porNivel = new Map<ObjectId, ReturnType<typeof forroDoNivel>>();
  const doNivel = (id: ObjectId) => {
    if (!porNivel.has(id)) porNivel.set(id, forroDoNivel(model, id));
    return porNivel.get(id)!;
  };
  const terminais = new Set((model.terminais ?? []).map((x) => `${x.levelId}|${x.at.x},${x.at.y},${x.cotaMm}`));
  return trechos.filter((t) => {
    if (t.cotaAMm !== t.cotaBMm || (t.a.x === t.b.x && t.a.y === t.b.y)) return false;
    const c = doNivel(t.levelId);
    if (!c) return false;
    const z = t.cotaAMm;
    if (terminais.has(`${t.levelId}|${t.a.x},${t.a.y},${z}`) || terminais.has(`${t.levelId}|${t.b.x},${t.b.y},${z}`)) return false;
    return z !== cotaForaDoForro(t.levelId, c.teto) && z > c.face && z < c.teto && z > c.teto - 600;
  });
}

/** (b) + (c): a rede antiga detectada no forro (`horizontais`, de `horizontaisNoForro`) é da casa? */
export function temAssinaturaDaCasa(model: BlueprintModel, horizontais: readonly Trecho[], assinatura: AssinaturaDoForroDaCasa): boolean {
  if (horizontais.length === 0 || assinatura.faixas.length === 0) return false;
  const tol = TOLERANCIA_DA_ASSINATURA_MM;
  for (const levelId of new Set(horizontais.map((t) => t.levelId))) {
    const c = forroDoNivel(model, levelId);
    if (!c || c.rebaixos.some((r) => Math.abs(r - assinatura.rebaixoMm) > tol)) return false;
  }
  const tetoDe = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm]));
  return horizontais.every((t) => {
    const teto = tetoDe.get(t.levelId)!;
    return assinatura.faixas.some((f) => [teto - f.abaixoDoTetoMm, teto - f.abaixoDoTetoMm - (f.degrauNaParedeMm ?? 0)].some((z) => Math.abs(t.cotaAMm - z) <= tol));
  });
}
