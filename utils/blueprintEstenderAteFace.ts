// utils/blueprintEstenderAteFace.ts
//
// ESTENDER A PAREDE ATÉ A FACE DO QUE ESTÁ NA FRENTE (P2.58, 24/09/2026).
//
// ─── O QUE JÁ EXISTIA, E POR QUE NÃO BASTA ──────────────────────────────────
//
// `extensoesAteEncontrar` (P2.42) estica a ponta solta até o **EIXO** da parede
// da frente, em lote, para fechar o contorno — é diagnóstico de topologia, e
// parar no eixo é o certo lá: é ali que o arranjo enxerga o encontro.
//
// Só que quem está desenhando pede outra coisa: *"estender a parede até a FACE
// de outra parede ou de um componente"*. Duas diferenças que importam:
//
//   • **Face, não eixo.** A face é o que se vê e o que se constrói: a alvenaria
//     nova morre encostada na alvenaria existente, não no meio dela. Parar no
//     eixo faz a parede invadir meia espessura da outra.
//   • **Não só parede.** O caso clássico de obra é a parede que morre num
//     PILAR. `extensoesAteEncontrar` só olha parede; aqui entram as peças
//     estruturais pelo contorno em planta (retângulo, círculo ou polígono).
//
// ⚠️ AS DUAS PARADAS SÃO LEGÍTIMAS, E A TELA TEM DE DIZER QUAL É QUAL. Encostar
// na face é o correto para o desenho; o arranjo, porém, só fecha o ambiente
// quando a ponta alcança o eixo (é o que `encostosSemJuncao` resolve depois).
// Por isso o resultado carrega os DOIS pontos — `to` (face) e `noEixo` — e quem
// chama escolhe, sabendo o que ganha e o que perde.

import {
  cantosDaParede,
  contornoEmPlanta,
  type BlueprintModel,
  type Command,
  type Level,
  type ObjectId,
  type Point,
} from './blueprintKernel';

/** Até onde procurar, em milímetro. 3 m cobre um vão de sala inteiro. */
export const ALCANCE_PADRAO_MM = 3000;

/** Abaixo disto o avanço é ruído de arredondamento, não extensão. */
const AVANCO_MINIMO_MM = 1;

export type TipoDoAlvo = 'PAREDE' | 'ESTRUTURA';

export interface ExtensaoAteFace {
  wallId: ObjectId;
  end: 'a' | 'b';
  /** Onde a ponta está hoje. */
  de: Point;
  /** Onde ela para: a FACE do que está na frente. */
  to: Point;
  /**
   * Onde ela pararia indo até o EIXO do alvo — `null` para estrutura, que não
   * tem eixo no sentido do arranjo.
   *
   * Existe porque encostar na face é o certo para o desenho e não basta para o
   * arranjo fechar o ambiente. Quem chama decide, e a tela diz a diferença.
   */
  noEixo: Point | null;
  alvoId: ObjectId;
  tipo: TipoDoAlvo;
  /** Quanto a ponta avança até a face, em mm. */
  distanciaMm: number;
}

/** Aresta de um corpo desenhado, com quem é o dono. */
interface Aresta {
  a: Point;
  b: Point;
  alvoId: ObjectId;
  tipo: TipoDoAlvo;
  /** Eixo do alvo, quando ele tem um (parede). */
  eixo: { a: Point; b: Point } | null;
}

/** O contorno vira arestas: é contra elas que o raio da ponta é lançado. */
function arestasDoContorno(pontos: readonly Point[], alvoId: ObjectId, tipo: TipoDoAlvo, eixo: Aresta['eixo']): Aresta[] {
  const saida: Aresta[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    if (a.x === b.x && a.y === b.y) continue;
    saida.push({ a, b, alvoId, tipo, eixo });
  }
  return saida;
}

/**
 * Tudo em que uma ponta pode esbarrar: as faces das paredes e o contorno das
 * peças estruturais do pavimento.
 */
export function facesDoNivel(model: BlueprintModel, level: Level, exceto?: ObjectId): Aresta[] {
  const saida: Aresta[] = [];
  for (const w of model.walls) {
    if (w.levelId !== level.id || w.id === exceto) continue;
    // Sem avanço de canto: o que interessa é o corpo desenhado da parede, e a
    // mitra do canto pertence ao encontro dela com a vizinha, não a este raio.
    saida.push(...arestasDoContorno(cantosDaParede(w.a, w.b, w.thicknessMm), w.id, 'PAREDE', { a: w.a, b: w.b }));
  }
  for (const s of model.structures ?? []) {
    if (s.levelId !== level.id) continue;
    const contorno = contornoEmPlanta(s);
    if (contorno.length >= 3) saida.push(...arestasDoContorno(contorno, s.id, 'ESTRUTURA', null));
  }
  return saida;
}

/**
 * O ponto está DENTRO deste contorno fechado? (par-ímpar por raio horizontal)
 *
 * ⚠️ Sem esta pergunta a ferramenta propunha atravessar. Medido na planta real
 * do usuário: **273 das 367 extensões eram de ~75 mm** — exatamente meia
 * espessura. Era a ponta que JÁ encosta no eixo da parede vizinha, e o raio,
 * partindo de dentro dela, achava a face de SAÍDA como se fosse um alvo. O
 * botão convidaria a empurrar a parede para dentro da outra, onde não há nada a
 * estender.
 */
function dentroDoContorno(p: Point, pontos: readonly Point[]): boolean {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const a = pontos[i];
    const b = pontos[j];
    const cruzaY = a.y > p.y !== b.y > p.y;
    if (!cruzaY) continue;
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < x) dentro = !dentro;
  }
  return dentro;
}

/** Distância de um ponto ao segmento `a`–`b`. */
function distanciaAoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * A ponta JÁ CHEGOU em alguma coisa?
 *
 * ⚠️ Para PAREDE a conta é a distância ao eixo contra meia espessura, e não o
 * teste par-ímpar no contorno: no canto em L a ponta cai exatamente sobre a
 * BORDA do corpo vizinho, onde par-ímpar é instável — e aí a ferramenta voltava
 * a propor os 75 mm de atravessar meia parede. Medido na planta real: sobravam
 * propostas de 75 mm em paredes que já formavam canto.
 */
function pontaJaChegou(p: Point, model: BlueprintModel, level: Level, exceto?: ObjectId): boolean {
  for (const w of model.walls) {
    if (w.levelId !== level.id || w.id === exceto) continue;
    if (distanciaAoSegmento(p, w.a, w.b) <= w.thicknessMm / 2 + 1) return true;
  }
  for (const s of model.structures ?? []) {
    if (s.levelId !== level.id) continue;
    const c = contornoEmPlanta(s);
    if (c.length >= 3 && dentroDoContorno(p, c)) return true;
  }
  return false;
}

/** Onde o raio `p + t·u` cruza o segmento `a`–`b`; `null` se não cruza à frente. */
function cruzamento(p: Point, ux: number, uy: number, a: Point, b: Point): number | null {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = ux * sy - uy * sx;
  // Paralelos: ou não se tocam, ou se tocam ao longo — e "ao longo" não é uma
  // parada, é a mesma linha.
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const s = ((a.x - p.x) * uy - (a.y - p.y) * ux) / den;
  if (t <= AVANCO_MINIMO_MM) return null;
  if (s < 0 || s > 1) return null;
  return t;
}

/**
 * Até onde esta ponta vai, seguindo a própria direção, até a primeira face.
 *
 * `null` quando não há nada à frente dentro do alcance — e isso é resposta, não
 * falha: a tela diz "nada à frente" em vez de esticar a parede para o vazio.
 */
export function extensaoAteFace(
  model: BlueprintModel,
  level: Level,
  wallId: ObjectId,
  end: 'a' | 'b',
  alcanceMm = ALCANCE_PADRAO_MM,
): ExtensaoAteFace | null {
  const parede = model.walls.find((w) => w.id === wallId && w.levelId === level.id);
  if (!parede) return null;
  const p = end === 'a' ? parede.a : parede.b;
  const oposta = end === 'a' ? parede.b : parede.a;
  const dx = p.x - oposta.x;
  const dy = p.y - oposta.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  const ux = dx / L;
  const uy = dy / L;

  // ⚠️ PONTA QUE JÁ CHEGOU NÃO TEM O QUE ESTENDER. Se ela está dentro do corpo
  // de alguma parede ou peça, a extensão só a empurraria para dentro — ver
  // `dentroDoContorno`.
  if (pontaJaChegou(p, model, level, wallId)) return null;

  let melhor: { t: number; aresta: Aresta } | null = null;
  for (const aresta of facesDoNivel(model, level, wallId)) {
    const t = cruzamento(p, ux, uy, aresta.a, aresta.b);
    if (t === null || t > alcanceMm) continue;
    if (!melhor || t < melhor.t) melhor = { t, aresta };
  }
  if (!melhor) return null;

  const to = { x: Math.round(p.x + ux * melhor.t), y: Math.round(p.y + uy * melhor.t) };
  // O EIXO do alvo, quando existe: é a parada que fecha o ambiente.
  let noEixo: Point | null = null;
  if (melhor.aresta.eixo) {
    const t = cruzamento(p, ux, uy, melhor.aresta.eixo.a, melhor.aresta.eixo.b);
    if (t !== null && t <= alcanceMm * 2) noEixo = { x: Math.round(p.x + ux * t), y: Math.round(p.y + uy * t) };
  }

  return {
    wallId,
    end,
    de: { x: p.x, y: p.y },
    to,
    noEixo,
    alvoId: melhor.aresta.alvoId,
    tipo: melhor.aresta.tipo,
    distanciaMm: Math.round(melhor.t),
  };
}

/** As duas pontas de uma parede, para a tela oferecer a que tem alvo. */
export function extensoesDaParede(
  model: BlueprintModel,
  level: Level,
  wallId: ObjectId,
  alcanceMm = ALCANCE_PADRAO_MM,
): ExtensaoAteFace[] {
  return (['a', 'b'] as const)
    .map((end) => extensaoAteFace(model, level, wallId, end, alcanceMm))
    .filter((x): x is ExtensaoAteFace => x !== null);
}

/** O comando: mover a ponta para a face (ou para o eixo, se for o pedido). */
export function comandoDeEstender(e: ExtensaoAteFace, ateOEixo = false): Command {
  const to = ateOEixo && e.noEixo ? e.noEixo : e.to;
  return { type: 'MoveVertex', wallId: e.wallId, end: e.end, to };
}
