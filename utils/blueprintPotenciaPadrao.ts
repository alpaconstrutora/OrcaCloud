/**
 * A POTÊNCIA QUE A NORMA PREVÊ, já preenchida ao criar o ponto (13/09/2026).
 *
 * Pedido: *"ao incluir os pontos trazer essas características já definidas
 * por padrão. Se o usuário quiser alterar ele altera. Isso economiza tempo"*.
 * E, com o print dos pontos sem VA: *"verifique por que alguns pontos não têm
 * potência"* — eram pontos criados ANTES deste padrão. Daí
 * `comandosDePotenciaPadrao`, que preenche o legado no mesmo critério.
 *
 * ─── O QUE ENTRA, E DE ONDE ─────────────────────────────────────────────────
 *
 *   · TOMADA (TUG/TUE) — 9.5.2.2.2: 100 VA; em banheiro, cozinha, copa, área de
 *     serviço e afins, 600 VA até completar TRÊS pontos de 600 VA no ambiente
 *     (dois, se o conjunto desses ambientes já passa de seis tomadas) e 100 VA
 *     nos demais. Conta-se o que já TEM 600 VA — e não quantas tomadas há —
 *     porque a norma pede três pontos de 600, e num cômodo antigo com seis
 *     tomadas sem potência as três primeiras preenchidas têm de ser as de 600.
 *     O lote conta também: "distribuir 4" numa cozinha dá 600, 600, 600, 100.
 *   · LUZ (teto, parede, piso) — 9.5.2.1.2: o mínimo do cômodo (100 VA até
 *     6 m², +60 VA por 4 m² inteiros) menos o que as luzes do cômodo já
 *     declaram, nunca abaixo de 100 VA. A primeira luz leva o mínimo inteiro;
 *     as demais, 100 VA — a norma mínima é por cômodo, não por luminária.
 *   · INTERRUPTOR, DADOS, LIGAÇÃO DIRETA — sem padrão: a norma diz que é
 *     função do equipamento (chuveiro de 5.500 W e de 7.500 W são os dois
 *     "ligação direta"), e um número inventado aqui viraria carga no quadro.
 *
 * Ponto fora de qualquer ambiente fechado, ou em ambiente sem tipo, recebe o
 * mínimo genérico (100 VA) — nunca fica sem nada por falta de contexto.
 *
 * ⚠️ É PADRÃO, não decisão: o valor entra no campo e o projetista troca no
 * painel do ponto. Nada aqui sobrescreve potência já declarada. A conferência
 * 9.5.2.2.2 continua conferindo o declarado.
 */
import {
  areaRecuada,
  pointInPolygon,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Terminal,
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
  /** Tomadas do cômodo que JÁ têm 600 VA ou mais (existentes + as do lote). */
  tomadasDe600Ja: number;
  /** Soma das potências declaradas das luzes do cômodo (existentes + lote). */
  luzDeclaradaVA: number;
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
      return ctx.tomadasDe600Ja < k ? POTENCIA_TOMADA_MOLHADA_VA : POTENCIA_MINIMA_TOMADA_VA;
    }
    return POTENCIA_MINIMA_TOMADA_VA;
  }
  if (ehLuz(tipoEletrico)) {
    if (!ctx) return minimoDeIluminacaoVA(0);
    return Math.max(minimoDeIluminacaoVA(0), minimoDeIluminacaoVA(ctx.areaM2) - ctx.luzDeclaradaVA);
  }
  return null;
}

/** Um ponto já resolvido neste lote — conta para os seguintes. */
type PontoResolvido = { at: Point; tipoEletrico: TipoDePontoEletrico | null; potenciaW: number | null };

const dentroDe = (ring: Point[], holes: Point[][], p: Point) =>
  pointInPolygon(ring, p) && !holes.some((h) => pointInPolygon(h, p));

/**
 * O contexto do cômodo que contém `at` no pavimento — `null` fora de ambiente
 * fechado. `ignorar` tira da conta o próprio terminal quando ele já existe no
 * modelo (o legado sendo preenchido).
 */
export function contextoDoAmbiente(
  model: BlueprintModel,
  levelId: ObjectId,
  at: Point,
  resolvidos: readonly PontoResolvido[] = [],
  ignorar: ObjectId | null = null,
): ContextoDoAmbiente | null {
  const space = model.spaces.find((s) => s.levelId === levelId && dentroDe(s.ring, s.holes, at));
  if (!space) return null;
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const areaM2 = areaRecuada(space.ring, paredes).areaMm2 / 1_000_000;
  const tipo = etiquetaDoAmbiente(space, model.labels)?.tipoDeAmbiente ?? null;
  const existentes = (model.terminais ?? []).filter(
    (t) =>
      t.id !== ignorar && t.levelId === levelId && t.disciplina === 'ELETRICA' && dentroDe(space.ring, space.holes, t.at),
  );
  const novos = resolvidos.filter((c) => dentroDe(space.ring, space.holes, c.at));
  const todos: PontoResolvido[] = [
    ...existentes.map((t) => ({ at: t.at, tipoEletrico: t.tipoEletrico ?? null, potenciaW: t.potenciaW ?? null })),
    ...novos,
  ];
  return {
    tipo,
    areaM2,
    tomadasDe600Ja: todos.filter((p) => ehTomada(p.tipoEletrico) && (p.potenciaW ?? 0) >= POTENCIA_TOMADA_MOLHADA_VA).length,
    luzDeclaradaVA: todos.filter((p) => ehLuz(p.tipoEletrico)).reduce((s, p) => s + (p.potenciaW ?? 0), 0),
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
    if (molhados.some((s) => dentroDe(s.ring, s.holes, t.at))) n++;
  }
  return n > 6;
}

/**
 * Preenche `potenciaW` nos `AddTerminal` elétricos que vêm sem ela. Os que já
 * trazem potência (a luz sugerida, o que o projetista digitou) passam intactos.
 * A contagem do lote é sequencial: o que nasce antes conta para o de depois.
 */
export function aplicarPotenciaPadrao(model: BlueprintModel, comandos: readonly Command[]): Command[] {
  const resolvidos: PontoResolvido[] = [];
  const passaDeSeis = new Map<ObjectId, boolean>();
  return comandos.map((c) => {
    if (c.type !== 'AddTerminal') return c;
    const tipoEletrico = c.tipoEletrico ?? null;
    if (c.disciplina !== 'ELETRICA' || c.potenciaW != null) {
      resolvidos.push({ at: c.at, tipoEletrico, potenciaW: c.potenciaW ?? null });
      return c;
    }
    if (!passaDeSeis.has(c.levelId)) passaDeSeis.set(c.levelId, conjuntoMolhadoPassaDeSeis(model, c.levelId));
    const ctx = contextoDoAmbiente(model, c.levelId, c.at, resolvidos);
    const p = potenciaPadraoVA(tipoEletrico, ctx, passaDeSeis.get(c.levelId));
    resolvidos.push({ at: c.at, tipoEletrico, potenciaW: p });
    return p == null ? c : { ...c, potenciaW: p };
  });
}

/** Os pontos elétricos que a norma sabe valorar e que ainda estão sem potência. */
export function pontosSemPotencia(model: BlueprintModel, levelId: ObjectId | null): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) =>
      t.disciplina === 'ELETRICA' &&
      (!levelId || t.levelId === levelId) &&
      t.potenciaW == null &&
      (ehTomada(t.tipoEletrico) || ehLuz(t.tipoEletrico)),
  );
}

/**
 * O LEGADO: pontos criados antes do padrão (ou com potência apagada) recebem a
 * potência da norma pelo MESMO critério, na ordem do modelo, cada um contando
 * para o seguinte. Só toca em quem está sem potência — nunca sobrescreve.
 */
export function comandosDePotenciaPadrao(model: BlueprintModel, levelId: ObjectId | null): Command[] {
  const resolvidos: PontoResolvido[] = [];
  const passaDeSeis = new Map<ObjectId, boolean>();
  const comandos: Command[] = [];
  for (const t of pontosSemPotencia(model, levelId)) {
    if (!passaDeSeis.has(t.levelId)) passaDeSeis.set(t.levelId, conjuntoMolhadoPassaDeSeis(model, t.levelId));
    const ctx = contextoDoAmbiente(model, t.levelId, t.at, resolvidos, t.id);
    const p = potenciaPadraoVA(t.tipoEletrico, ctx, passaDeSeis.get(t.levelId));
    if (p == null) continue;
    resolvidos.push({ at: t.at, tipoEletrico: t.tipoEletrico ?? null, potenciaW: p });
    comandos.push({ type: 'SetTerminalProps', terminalId: t.id, potenciaW: p });
  }
  return comandos;
}
