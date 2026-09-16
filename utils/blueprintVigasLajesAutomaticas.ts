import {
  applyBatch,
  contornoEmPlanta,
  interiorPoint,
  intersectSegments,
  pointInPolygon,
  polygonArea,
  projecaoNoSegmento,
  wallLength,
  DEFAULT_TOLERANCE_MM,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Structural,
} from './blueprintKernel';
import {
  cadeiasDeParedes,
  coordenadaNaCadeia,
  idsPrevistosDeEstrutura,
  nosDeParede,
  paredesDoNivel,
  pilaresExistentesNoNivel,
  proximoNumeroDoRotulo,
  type Cadeia,
} from './blueprintPilaresAutomaticos';

/**
 * LANÇAMENTO AUTOMÁTICO DE VIGAS E LAJES (16/09/2026).
 *
 * Pedido: *"aproveitar a experiência com a implementação do lançamento
 * automático de pilares e então implementar também Lançamento automático de
 * vigas e lajes"*.
 *
 * O mesmo molde dos pilares (`blueprintPilaresAutomaticos.ts`): o sistema
 * PROPÕE, quem projeta confirma, Ctrl+Z desfaz o lote inteiro; prévia na
 * gaveta e tracejada no desenho; um `runBatch` provado antes por simulação;
 * "Relançar" apaga as peças do tipo no pavimento e lança de novo. Sem campo
 * novo no kernel.
 *
 * ─── VIGAS (decidido com o usuário em 16/09/2026) ──────────────────────────
 *
 *  1. UMA viga por parede, de pilar a pilar: paredes emendadas em linha reta
 *     (cadeia colinear, a mesma dos pilares) viram uma viga contínua; canto, T
 *     e cruzamento terminam a viga.
 *  2. Largura = espessura da parede (a maior da cadeia), nunca abaixo de
 *     12 cm (NBR 6118 13.2.2). A viga fica no EIXO da parede — é embutida na
 *     alvenaria; se sobressai, é aviso, não deslocamento.
 *  3. Altura por PRÉ-DIMENSIONAMENTO de lançamento: h = maior vão entre apoios
 *     ÷ divisor (10, ou 12), arredondado a 5 cm, nunca abaixo do mínimo
 *     (30 cm). Apoios = pontas da cadeia, encontros ao longo dela e pilares
 *     JÁ DESENHADOS sobre ela — por isso a gaveta pede para lançar os pilares
 *     antes: um pilar intermediário divide o vão e baixa a viga.
 *  4. Topo da viga no pé-direito (`baseMm = pé-direito − h`); as paredes da
 *     cadeia passam a ceder o volume (a viga ocupa o topo da alvenaria).
 *  5. A viga RECUA até a face do pilar em cada ponta (16/09/2026, print do 3D
 *     do usuário: *"existem sobreposições"* — a viga atravessava o pilar e as
 *     duas vigas do canto se cruzavam dentro dele; medido na planta dele: 26
 *     pares pilar × viga e 10 viga × viga contados duas vezes). E a viga nasce
 *     marcada para CEDER: o que ainda sobrepõe um pilar intermediário no meio
 *     dela sai do concreto da viga, não do pilar — o pilar é contínuo.
 *
 * ─── LAJES ─────────────────────────────────────────────────────────────────
 *
 *  1. UMA laje por ambiente fechado (`Space`): o anel do ambiente, no eixo das
 *     paredes — o painel entre vigas.
 *  2. Espessura padrão 10 cm (mínimos da NBR 6118 13.2.4.1: 7 a 10 cm conforme
 *     o uso; 10 é o corrente em piso residencial), apoiada no topo das paredes
 *     (`baseMm = pé-direito`). Não atravessa parede: nada cede.
 *  3. Ambiente com ilha (buraco no anel): a laje cobre a ilha — o kernel só
 *     tem um anel por laje — e a linha avisa.
 *
 * ─── O QUE É NORMA E O QUE É HIPÓTESE ───────────────────────────────────────
 *
 * Norma: largura mínima 12 cm (13.2.2) e as espessuras mínimas de laje
 * (13.2.4.1). Hipótese: L/10, o mínimo de 30 cm, a espessura escolhida. Nada
 * disto é dimensionamento — cálculo, armadura e flecha são do responsável
 * técnico.
 */

// ─── Vigas ──────────────────────────────────────────────────────────────────

export interface HipotesesDeVigas {
  /** h = maior vão ÷ divisor (pré-dimensionamento de lançamento). */
  divisorDaAltura: number;
  /** h nunca abaixo disto, em mm. */
  alturaMinimaMm: number;
  /** Largura nunca abaixo disto, em mm (NBR 6118 13.2.2: 12 cm). */
  larguraMinimaMm: number;
  incluirInternas: boolean;
}

export const HIPOTESES_VIGAS_PADRAO: HipotesesDeVigas = {
  divisorDaAltura: 10,
  alturaMinimaMm: 300,
  larguraMinimaMm: 120,
  incluirInternas: true,
};
export const DIVISORES_DA_ALTURA = [10, 12] as const;
export const ALTURAS_MINIMAS_DE_VIGA = [300, 400, 500] as const;
/** A altura da viga anda de 5 em 5 cm. */
const PASSO_DA_ALTURA_MM = 50;

export interface VigaPrevista {
  idPrevisto: ObjectId;
  rotulo: string;
  a: Point;
  b: Point;
  comprimentoMm: number;
  larguraMm: number;
  alturaMm: number;
  baseMm: number;
  maiorVaoMm: number;
  /** Quantos apoios a cadeia tem (pontas incluídas). */
  apoios: number;
  wallIds: ObjectId[];
  aviso: string | null;
}

export interface PlanoDeVigas {
  levelId: ObjectId;
  vigas: VigaPrevista[];
  /** Todos os `AddStructural` (na ordem de `vigas`) e depois um `SetCedeSobreposicao` por parede. */
  comandos: Command[];
  paredesQueCedem: ObjectId[];
  /** Cadeias que já tinham viga — mantidas. */
  cadeiasComViga: number;
  foraDoPlano: { a: Point; b: Point; wallIds: ObjectId[]; motivo: string }[];
  avisos: string[];
  motivo: string | null;
}

export function vigasExistentesNoNivel(model: BlueprintModel, levelId: ObjectId): Structural[] {
  return (model.structures ?? []).filter((s) => s.levelId === levelId && s.kind === 'VIGA');
}

export function lajesExistentesNoNivel(model: BlueprintModel, levelId: ObjectId): Structural[] {
  return (model.structures ?? []).filter((s) => s.levelId === levelId && s.kind === 'LAJE');
}

const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** As duas pontas de uma cadeia, no sentido dela. */
export function pontasDaCadeia(c: Cadeia): { a: Point; b: Point } {
  const primeiro = c.elos[0];
  const ultimo = c.elos[c.elos.length - 1];
  const a = primeiro.invertida ? primeiro.wall.b : primeiro.wall.a;
  const b = ultimo.invertida ? ultimo.wall.a : ultimo.wall.b;
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

/**
 * A cadeia já tem viga quando uma VIGA existente é colinear com ela (as duas
 * pontas a ≤ tol do eixo da cadeia) e se sobrepõe a ela em mais de `tol`.
 */
export function cadeiaJaTemViga(c: Cadeia, existentes: readonly Structural[], tol: number): boolean {
  const { a, b } = pontasDaCadeia(c);
  const L = dist(a, b);
  if (L <= 0) return false;
  for (const v of existentes) {
    const [p, q] = v.pontos;
    const pp = projecaoNoSegmento(p, a, b);
    const pq = projecaoNoSegmento(q, a, b);
    if (!pp || !pq) continue;
    // Colinear: as duas pontas coladas na RETA da cadeia (distância medida ao
    // pé RECORTADO; fora do segmento a distância cresce e o teste falha, o que
    // é o que se quer — viga só na extensão não conta).
    if (pp.distanciaMm > tol || pq.distanciaMm > tol) continue;
    const u0 = Math.max(0, Math.min(pp.u, pq.u));
    const u1 = Math.min(1, Math.max(pp.u, pq.u));
    if ((u1 - u0) * L > tol) return true;
  }
  return false;
}

/**
 * Recua a ponta `ponta` da viga (que segue para `outra`) até a face do pilar
 * que a contém: o ponto em que o eixo sai da pegada do pilar. Sem pilar na
 * ponta, fica onde está. Serve à viga e à baldrame (`blueprintFundacoesAutomaticas`).
 */
export function recuarAteAFaceDoPilar(pilares: readonly Structural[], ponta: Point, outra: Point): Point {
  const pilar = pilares.find((p) => pointInPolygon(contornoEmPlanta(p), ponta));
  if (!pilar) return ponta;
  const anel = contornoEmPlanta(pilar);
  let melhor: Point | null = null;
  let melhorT = -1;
  for (let k = 0; k < anel.length; k++) {
    const r = intersectSegments({ a: ponta, b: outra }, { a: anel[k], b: anel[(k + 1) % anel.length] });
    if (r.kind !== 'point' || !r.at) continue;
    const t = dist(ponta, r.at);
    if (t > melhorT) {
      melhorT = t;
      melhor = { x: r.at.x, y: r.at.y };
    }
  }
  return melhor ?? ponta;
}

/** h = maior vão ÷ divisor, arredondado para cima a 5 cm, nunca abaixo do mínimo. */
export function alturaDaViga(maiorVaoMm: number, hip: Pick<HipotesesDeVigas, 'divisorDaAltura' | 'alturaMinimaMm'>): number {
  const bruta = maiorVaoMm / Math.max(1, hip.divisorDaAltura);
  const arredondada = Math.ceil(bruta / PASSO_DA_ALTURA_MM) * PASSO_DA_ALTURA_MM;
  return Math.max(Math.round(hip.alturaMinimaMm), arredondada);
}

export function planejarVigas(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeVigas = HIPOTESES_VIGAS_PADRAO,
): PlanoDeVigas {
  const vazio = (motivo: string, extras: Partial<PlanoDeVigas> = {}): PlanoDeVigas => ({
    levelId,
    vigas: [],
    comandos: [],
    paredesQueCedem: [],
    cadeiasComViga: 0,
    foraDoPlano: [],
    avisos: [],
    motivo,
    ...extras,
  });
  const level = model.levels.find((l) => l.id === levelId);
  if (!level) return vazio('pavimento não encontrado');
  const todas = paredesDoNivel(model, levelId, true);
  if (todas.length === 0) return vazio('sem parede no pavimento');
  const walls = hip.incluirInternas ? todas : paredesDoNivel(model, levelId, false);
  if (walls.length === 0) return vazio('nenhuma parede externa no pavimento');

  const tol = DEFAULT_TOLERANCE_MM;
  const { nos, sobrepostas } = nosDeParede(model, levelId, tol, walls);
  const avisos: string[] = sobrepostas.map(([p, q]) => `paredes ${p} e ${q} sobrepostas — confira o desenho`);
  const cadeias = cadeiasDeParedes(walls, nos);
  const existentes = vigasExistentesNoNivel(model, levelId);
  const pilares = pilaresExistentesNoNivel(model, levelId);
  const porId = new Map(walls.map((w) => [w.id, w]));

  const recuarAteAFace = (ponta: Point, outra: Point) => recuarAteAFaceDoPilar(pilares, ponta, outra);

  interface Candidata {
    a: Point;
    b: Point;
    comprimentoMm: number;
    larguraMm: number;
    alturaMm: number;
    maiorVaoMm: number;
    apoios: number;
    wallIds: ObjectId[];
    aviso: string | null;
  }
  const candidatas: Candidata[] = [];
  const foraDoPlano: PlanoDeVigas['foraDoPlano'] = [];
  let cadeiasComViga = 0;

  for (const c of cadeias) {
    const { a, b } = pontasDaCadeia(c);
    const wallIds = c.elos.map((e) => e.wall.id);
    if (c.comprimentoMm <= tol) {
      foraDoPlano.push({ a, b, wallIds, motivo: 'parede de comprimento nulo' });
      continue;
    }
    if (cadeiaJaTemViga(c, existentes, tol)) {
      cadeiasComViga++;
      continue;
    }
    // Apoios: pontas, encontros ao longo da cadeia, pilares existentes sobre ela.
    const apoios = new Set<number>([0, c.comprimentoMm]);
    for (const no of nos) {
      if (no.tipo === 'EMENDA' || no.tipo === 'PONTA') continue;
      for (const i of no.incidencias) {
        const s = coordenadaNaCadeia(c, i.wallId, i.tMm);
        if (s != null) apoios.add(Math.round(s));
      }
    }
    for (const p of pilares) {
      const meiaDiag = Math.hypot(p.larguraMm, p.circular ? p.larguraMm : p.profundidadeMm) / 2;
      for (const e of c.elos) {
        const pr = projecaoNoSegmento(p.pontos[0], e.wall.a, e.wall.b);
        if (!pr || pr.u < 0 || pr.u > 1 || pr.distanciaMm > meiaDiag + tol) continue;
        const s = coordenadaNaCadeia(c, e.wall.id, Math.round(pr.u * wallLength(e.wall)));
        if (s != null) apoios.add(Math.round(s));
      }
    }
    const ordenados = [...apoios].sort((p, q) => p - q);
    let maiorVao = 0;
    for (let k = 0; k + 1 < ordenados.length; k++) maiorVao = Math.max(maiorVao, ordenados[k + 1] - ordenados[k]);
    const espessuras = wallIds.map((id) => porId.get(id)!.thicknessMm);
    const larguraMm = Math.max(Math.round(hip.larguraMinimaMm), Math.max(...espessuras));
    const alturaMm = alturaDaViga(maiorVao, hip);
    const fina = Math.min(...espessuras);
    const aviso = larguraMm > fina + 40 ? `${larguraMm - fina} mm mais larga que a parede de ${fina} mm` : null;
    // As pontas recuam até a face dos pilares (o vão e a altura já foram medidos de eixo a eixo).
    const a2 = recuarAteAFace(a, b);
    const b2 = recuarAteAFace(b, a);
    const comprimento = Math.round(dist(a2, b2));
    if (comprimento <= tol) {
      foraDoPlano.push({ a, b, wallIds, motivo: 'viga inteira dentro do pilar' });
      continue;
    }
    candidatas.push({ a: a2, b: b2, comprimentoMm: comprimento, larguraMm, alturaMm, maiorVaoMm: maiorVao, apoios: ordenados.length, wallIds, aviso });
  }

  if (candidatas.length === 0) {
    return vazio(cadeiasComViga > 0 ? 'todas as paredes já têm viga' : 'nenhuma parede para receber viga', {
      cadeiasComViga,
      foraDoPlano,
      avisos,
    });
  }

  candidatas.sort((p, q) => p.a.x - q.a.x || p.a.y - q.a.y || p.b.x - q.b.x || p.b.y - q.b.y);
  const n0 = proximoNumeroDoRotulo(model, 'V');
  const ids = idsPrevistosDeEstrutura(model, candidatas.length);
  const vigas: VigaPrevista[] = candidatas.map((c, k) => ({
    idPrevisto: ids[k],
    rotulo: `V${n0 + k}`,
    ...c,
    baseMm: level.defaultHeightMm - c.alturaMm,
  }));
  const paredesQueCedem = [...new Set(vigas.flatMap((v) => v.wallIds))]
    .filter((id) => porId.get(id)?.cedeSobreposicao !== true)
    .sort();
  const comandos: Command[] = [
    ...vigas.map(
      (v): Command => ({
        type: 'AddStructural',
        levelId,
        kind: 'VIGA',
        pontos: [v.a, v.b],
        larguraMm: v.larguraMm,
        alturaMm: v.alturaMm,
        baseMm: v.baseMm,
        rotulo: v.rotulo,
      }),
    ),
    // A viga CEDE: o que ela sobrepõe num pilar intermediário sai do concreto
    // dela (o pilar é contínuo). Parede × viga continua descontando da parede —
    // quando os dois cedem, o kernel desempata pela parede.
    ...vigas.map((v): Command => ({ type: 'SetCedeSobreposicao', id: v.idPrevisto, cede: true })),
    ...paredesQueCedem.map((id): Command => ({ type: 'SetCedeSobreposicao', id, cede: true })),
  ];
  return { levelId, vigas, comandos, paredesQueCedem, cadeiasComViga, foraDoPlano, avisos, motivo: null };
}

/** Apaga as VIGAS do pavimento e lança de novo — ver `relancarPilares`. */
export function relancarVigas(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeVigas = HIPOTESES_VIGAS_PADRAO,
): PlanoDeVigas & { apagados: ObjectId[] } {
  const apagados = vigasExistentesNoNivel(model, levelId).map((s) => s.id);
  if (apagados.length === 0) return { ...planejarVigas(model, levelId, hip), apagados };
  const sem: BlueprintModel = { ...model, structures: (model.structures ?? []).filter((s) => !apagados.includes(s.id)) };
  const plano = planejarVigas(sem, levelId, hip);
  const deletes: Command[] = apagados.map((structuralId) => ({ type: 'DeleteStructural', structuralId }));
  return { ...plano, comandos: plano.comandos.length > 0 ? [...deletes, ...plano.comandos] : [], apagados };
}

export function conferirPlanoDeVigas(
  model: BlueprintModel,
  plano: PlanoDeVigas,
): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: plano.motivo ?? 'nada a lançar' };
  try {
    const r = applyBatch(model, plano.comandos);
    const criados = r.diff.created.filter((id) => id.startsWith('str_'));
    const previstos = plano.vigas.map((v) => v.idPrevisto);
    if (criados.length !== previstos.length || criados.some((id, i) => id !== previstos[i])) {
      return { ok: false, motivo: `ids previstos (${previstos.join(', ')}) diferem dos criados (${criados.join(', ')})` };
    }
    for (const id of plano.paredesQueCedem) {
      const w = r.model.walls.find((x) => x.id === id);
      if (!w) return { ok: false, motivo: `parede ${id} não existe` };
      if (w.cedeSobreposicao !== true) return { ok: false, motivo: `parede ${id} não passou a ceder` };
    }
    for (const id of previstos) {
      if (r.model.structures.find((x) => x.id === id)?.cedeSobreposicao !== true) {
        return { ok: false, motivo: `viga ${id} não nasceu cedendo` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Lajes ──────────────────────────────────────────────────────────────────

export interface HipotesesDeLajes {
  espessuraMm: number;
}
export const HIPOTESES_LAJES_PADRAO: HipotesesDeLajes = { espessuraMm: 100 };
export const ESPESSURAS_DE_LAJE = [80, 100, 120, 150] as const;
/** Abaixo disto o "ambiente" é fresta de desenho, não cômodo — fica fora do plano. */
export const AREA_MINIMA_DE_LAJE_MM2 = 500_000;

export interface LajePrevista {
  idPrevisto: ObjectId;
  rotulo: string;
  spaceId: ObjectId;
  ambiente: string | null;
  pontos: Point[];
  areaMm2: number;
  espessuraMm: number;
  baseMm: number;
  aviso: string | null;
}

export interface PlanoDeLajes {
  levelId: ObjectId;
  lajes: LajePrevista[];
  comandos: Command[];
  /** Ambientes que já tinham laje — mantidos. */
  ambientesComLaje: number;
  foraDoPlano: { spaceId: ObjectId; motivo: string }[];
  motivo: string | null;
}

export function planejarLajes(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeLajes = HIPOTESES_LAJES_PADRAO,
): PlanoDeLajes {
  const vazio = (motivo: string, extras: Partial<PlanoDeLajes> = {}): PlanoDeLajes => ({
    levelId,
    lajes: [],
    comandos: [],
    ambientesComLaje: 0,
    foraDoPlano: [],
    motivo,
    ...extras,
  });
  const level = model.levels.find((l) => l.id === levelId);
  if (!level) return vazio('pavimento não encontrado');
  const spaces = model.spaces.filter((s) => s.levelId === levelId && s.ring.length >= 3);
  if (spaces.length === 0) return vazio('nenhum ambiente fechado no pavimento');

  const existentes = lajesExistentesNoNivel(model, levelId);
  const espessura = Math.max(10, Math.round(hip.espessuraMm));
  const foraDoPlano: PlanoDeLajes['foraDoPlano'] = [];
  let ambientesComLaje = 0;
  const candidatas: Omit<LajePrevista, 'idPrevisto' | 'rotulo'>[] = [];
  for (const sp of spaces) {
    const areaMm2 = Math.abs(polygonArea(sp.ring));
    if (areaMm2 < AREA_MINIMA_DE_LAJE_MM2) {
      foraDoPlano.push({ spaceId: sp.id, motivo: 'ambiente com menos de 0,5 m²' });
      continue;
    }
    const dentro = interiorPoint(sp.ring, sp.holes);
    if (existentes.some((l) => pointInPolygon(l.pontos, dentro))) {
      ambientesComLaje++;
      continue;
    }
    candidatas.push({
      spaceId: sp.id,
      ambiente: sp.name?.trim() ? sp.name.trim() : null,
      pontos: sp.ring.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      areaMm2,
      espessuraMm: espessura,
      baseMm: level.defaultHeightMm,
      aviso: sp.holes.length > 0 ? 'ambiente com ilha: a laje cobre a ilha' : null,
    });
  }
  if (candidatas.length === 0) {
    return vazio(ambientesComLaje > 0 ? 'todos os ambientes já têm laje' : 'nenhum ambiente para receber laje', {
      ambientesComLaje,
      foraDoPlano,
    });
  }
  candidatas.sort((p, q) => p.pontos[0].x - q.pontos[0].x || p.pontos[0].y - q.pontos[0].y || q.areaMm2 - p.areaMm2);
  const n0 = proximoNumeroDoRotulo(model, 'L');
  const ids = idsPrevistosDeEstrutura(model, candidatas.length);
  const lajes: LajePrevista[] = candidatas.map((c, k) => ({ idPrevisto: ids[k], rotulo: `L${n0 + k}`, ...c }));
  const comandos: Command[] = lajes.map(
    (l): Command => ({
      type: 'AddStructural',
      levelId,
      kind: 'LAJE',
      pontos: l.pontos,
      alturaMm: l.espessuraMm,
      baseMm: l.baseMm,
      rotulo: l.rotulo,
    }),
  );
  return { levelId, lajes, comandos, ambientesComLaje, foraDoPlano, motivo: null };
}

/** Apaga as LAJES do pavimento e lança de novo — ver `relancarPilares`. */
export function relancarLajes(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDeLajes = HIPOTESES_LAJES_PADRAO,
): PlanoDeLajes & { apagados: ObjectId[] } {
  const apagados = lajesExistentesNoNivel(model, levelId).map((s) => s.id);
  if (apagados.length === 0) return { ...planejarLajes(model, levelId, hip), apagados };
  const sem: BlueprintModel = { ...model, structures: (model.structures ?? []).filter((s) => !apagados.includes(s.id)) };
  const plano = planejarLajes(sem, levelId, hip);
  const deletes: Command[] = apagados.map((structuralId) => ({ type: 'DeleteStructural', structuralId }));
  return { ...plano, comandos: plano.comandos.length > 0 ? [...deletes, ...plano.comandos] : [], apagados };
}

export function conferirPlanoDeLajes(
  model: BlueprintModel,
  plano: PlanoDeLajes,
): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: plano.motivo ?? 'nada a lançar' };
  try {
    const r = applyBatch(model, plano.comandos);
    const criados = r.diff.created.filter((id) => id.startsWith('str_'));
    const previstos = plano.lajes.map((l) => l.idPrevisto);
    if (criados.length !== previstos.length || criados.some((id, i) => id !== previstos[i])) {
      return { ok: false, motivo: `ids previstos (${previstos.join(', ')}) diferem dos criados (${criados.join(', ')})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
