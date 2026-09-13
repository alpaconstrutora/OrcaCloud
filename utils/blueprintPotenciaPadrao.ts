/**
 * A POTÊNCIA QUE A NORMA PREVÊ, já preenchida ao criar o ponto (13/09/2026).
 *
 * Pedido: *"ao incluir os pontos trazer essas características já definidas
 * por padrão. Se o usuário quiser alterar ele altera. Isso economiza tempo"*.
 *
 * ─── O QUE ENTRA, E DE ONDE ─────────────────────────────────────────────────
 *
 *   · TOMADA (TUG/TUE) — 9.5.2.2.2: 100 VA; em banheiro, cozinha, copa, área de
 *     serviço e afins, 600 VA nos três primeiros pontos do ambiente (dois, se
 *     o conjunto desses ambientes já passa de seis tomadas) e 100 VA nos
 *     excedentes. A contagem inclui o que já existe no cômodo E o que nasce no
 *     mesmo lote: "distribuir 4" numa cozinha dá 600, 600, 600, 100.
 *   · LUZ (teto, parede, piso) — 9.5.2.1.2: a primeira luz do cômodo leva o
 *     mínimo da área (100 VA até 6 m², +60 VA por 4 m² inteiros); as demais,
 *     100 VA — a norma mínima é por cômodo, não por luminária.
 *   · INTERRUPTOR, DADOS, LIGAÇÃO DIRETA — sem padrão: a norma diz que é
 *     função do equipamento (chuveiro de 5.500 W e de 7.500 W são os dois
 *     "ligação direta"), e um número inventado aqui viraria carga no quadro.
 *
 * Ponto fora de qualquer ambiente fechado, ou em ambiente sem tipo, recebe o
 * mínimo genérico (100 VA) — nunca fica sem nada por falta de contexto.
 *
 * ⚠️ É PADRÃO, não decisão: o valor entra no campo e o projetista troca no
 * painel do ponto. A conferência 9.5.2.2.2 continua conferindo o declarado.
 */
import {
  areaRecuada,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type TipoDeAmbiente,
  type TipoDePontoEletrico,
} from './blueprintKernel';
import { etiquetaDoAmbiente, minimoDeIluminacaoVA } from './blueprintDistribuicao';

export const POTENCIA_MINIMA_TOMADA_VA = 100;
export const POTENCIA_TOMADA_MOLHADA_VA = 600;

const MOLHADOS: ReadonlySet<TipoDeAmbiente> = new Set(['BANHEIRO', 'COZINHA_SERVICO']);
const ehTomada = (t: TipoDePontoEletrico | null | undefined) => t === 'TUG' || t === 'TUE';
const ehLuz = (t: TipoDePontoEletrico | null | undefined) => !!t && t.startsWith('ILUMINACAO');

/** O que se sabe do cômodo em que o ponto cai — o que a regra precisa. */
export interface ContextoDoAmbiente {
  tipo: TipoDeAmbiente | null;
  areaM2: number;
  /** Tomadas já no cômodo (existentes + as criadas antes no mesmo lote). */
  tomadasJa: number;
  /** Luzes já no cômodo (idem). */
  luzesJa: number;
}

/** A potência padrão, em VA, ou `null` quando a norma não dá número. */
export function potenciaPadraoVA(
  tipoEletrico: TipoDePontoEletrico | null | undefined,
  ctx: ContextoDoAmbiente | null,
  conjuntoMolhadoPassaDeSeis = false,
): number | null {
  if (!tipoEletrico) return null;
  if (ehTomada(tipoEletrico)) {
    if (ctx?.tipo && MOLHADOS.has(ctx.tipo)) {
      const k = conjuntoMolhadoPassaDeSeis ? 2 : 3;
      return ctx.tomadasJa < k ? POTENCIA_TOMADA_MOLHADA_VA : POTENCIA_MINIMA_TOMADA_VA;
    }
    return POTENCIA_MINIMA_TOMADA_VA;
  }
  if (ehLuz(tipoEletrico)) {
    if (!ctx) return minimoDeIluminacaoVA(0);
    return ctx.luzesJa === 0 ? minimoDeIluminacaoVA(ctx.areaM2) : minimoDeIluminacaoVA(0);
  }
  return null;
}

type PontoCriado = { at: Point; tipoEletrico: TipoDePontoEletrico | null };

/** O contexto do cômodo que contém `at` no pavimento — `null` fora de ambiente fechado. */
export function contextoDoAmbiente(
  model: BlueprintModel,
  levelId: ObjectId,
  at: Point,
  jaCriados: readonly PontoCriado[] = [],
): ContextoDoAmbiente | null {
  const dentroDe = (ring: Point[], holes: Point[][], p: Point) =>
    pointInPolygon(ring, p) && !holes.some((h) => pointInPolygon(h, p));
  const space = model.spaces.find((s) => s.levelId === levelId && dentroDe(s.ring, s.holes, at));
  if (!space) return null;
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const areaM2 = areaRecuada(space.ring, paredes).areaMm2 / 1_000_000;
  const tipo = etiquetaDoAmbiente(space, model.labels)?.tipoDeAmbiente ?? null;
  const existentes = (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && dentroDe(space.ring, space.holes, t.at),
  );
  const novos = jaCriados.filter((c) => dentroDe(space.ring, space.holes, c.at));
  return {
    tipo,
    areaM2,
    tomadasJa:
      existentes.filter((t) => ehTomada(t.tipoEletrico)).length + novos.filter((c) => ehTomada(c.tipoEletrico)).length,
    luzesJa: existentes.filter((t) => ehLuz(t.tipoEletrico)).length + novos.filter((c) => ehLuz(c.tipoEletrico)).length,
  };
}

/** 9.5.2.2.2 a: o conjunto banheiro + cozinha/serviço do pavimento já passa de seis tomadas? */
export function conjuntoMolhadoPassaDeSeis(model: BlueprintModel, levelId: ObjectId): boolean {
  const molhados = model.spaces.filter(
    (s) => s.levelId === levelId && MOLHADOS.has(etiquetaDoAmbiente(s, model.labels)?.tipoDeAmbiente as TipoDeAmbiente),
  );
  let n = 0;
  for (const t of model.terminais ?? []) {
    if (t.levelId !== levelId || t.disciplina !== 'ELETRICA' || !ehTomada(t.tipoEletrico)) continue;
    if (molhados.some((s) => pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at)))) n++;
  }
  return n > 6;
}

/**
 * Preenche `potenciaW` nos `AddTerminal` elétricos que vêm sem ela. Os que já
 * trazem potência (a luz sugerida, o que o projetista digitou) passam intactos.
 * A contagem do lote é sequencial: o que nasce antes conta para o de depois.
 */
export function aplicarPotenciaPadrao(model: BlueprintModel, comandos: readonly Command[]): Command[] {
  const criados: PontoCriado[] = [];
  const passaDeSeis = new Map<ObjectId, boolean>();
  return comandos.map((c) => {
    if (c.type !== 'AddTerminal') return c;
    const tipoEletrico = c.tipoEletrico ?? null;
    if (c.disciplina !== 'ELETRICA' || c.potenciaW != null) {
      criados.push({ at: c.at, tipoEletrico });
      return c;
    }
    if (!passaDeSeis.has(c.levelId)) passaDeSeis.set(c.levelId, conjuntoMolhadoPassaDeSeis(model, c.levelId));
    const ctx = contextoDoAmbiente(model, c.levelId, c.at, criados);
    const p = potenciaPadraoVA(tipoEletrico, ctx, passaDeSeis.get(c.levelId));
    criados.push({ at: c.at, tipoEletrico });
    return p == null ? c : { ...c, potenciaW: p };
  });
}
