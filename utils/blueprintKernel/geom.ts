/**
 * Primitivas geométricas exatas sobre coordenadas inteiras em milímetros.
 *
 * Todos os predicados de decisão (orientação, colinearidade, "está entre") são
 * calculados em ARITMÉTICA INTEIRA e são exatos — não usam epsilon. Epsilon só
 * aparece onde a resposta é genuinamente contínua (o ponto de interseção), e ali
 * o resultado volta a inteiro por `roundToMm`.
 *
 * Essa separação é o que torna o kernel determinístico: a topologia (quantas faces,
 * quem toca quem) nunca depende de um comparador de ponto flutuante.
 */

import { DEFAULT_TOLERANCE_MM, KernelError, assertIntegerMm, roundToMm } from './units';

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export function point(x: number, y: number): Point {
  return { x: assertIntegerMm(x, 'x'), y: assertIntegerMm(y, 'y') };
}

export function pointsEqual(p: Point, q: Point): boolean {
  return p.x === q.x && p.y === q.y;
}

/**
 * Chave textual estável de um ponto. Usada para deduplicar vértices sem depender
 * de ordem de inserção em Map.
 */
export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Predicados exatos (inteiros)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produto vetorial (b−a) × (c−a). Exato para coordenadas até ±1e6 mm.
 *
 * > 0  → c está à esquerda de a→b (anti-horário)
 * < 0  → c está à direita (horário)
 * = 0  → colineares
 */
export function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function orientation(a: Point, b: Point, c: Point): -1 | 0 | 1 {
  const v = cross(a, b, c);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function areCollinear(a: Point, b: Point, c: Point): boolean {
  return cross(a, b, c) === 0;
}

/** Quadrado da distância. Inteiro, exato — evita a raiz e o float que vem com ela. */
export function distanceSq(p: Point, q: Point): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

export function withinTolerance(p: Point, q: Point, toleranceMm = DEFAULT_TOLERANCE_MM): boolean {
  return distanceSq(p, q) <= toleranceMm * toleranceMm;
}

/** `c` está no segmento a→b, assumindo os três já colineares. Fronteiras inclusas. */
export function isBetween(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** `c` está no interior aberto do segmento a→b (colinear e distinto das pontas). */
export function isStrictlyOnSegment(a: Point, b: Point, c: Point): boolean {
  if (!areCollinear(a, b, c)) return false;
  if (pointsEqual(a, c) || pointsEqual(b, c)) return false;
  return isBetween(a, b, c);
}

/**
 * `c` é um corte válido no interior de a→b, sabendo que `c` VEIO de uma interseção
 * calculada sobre este próprio segmento e depois arredondada para mm inteiro.
 *
 * Não exige colinearidade exata de propósito. O arredondamento desloca o ponto em
 * até 0,5 mm por eixo, então `cross(a, b, c)` deixa de ser zero e um teste exato
 * rejeitaria o corte — o que só não quebra geometria ortogonal porque ali a
 * interseção cai em coordenada inteira por sorte. Em paredes oblíquas o teste exato
 * descartava TODOS os cortes, o grafo planar nunca fechava e a planta não produzia
 * nenhum ambiente.
 *
 * O que precisa ser verdade é só: o ponto está dentro da caixa do segmento e não
 * coincide com uma das pontas. A pertinência à reta já foi estabelecida por
 * construção, por quem calculou a interseção.
 */
export function isInteriorCut(a: Point, b: Point, c: Point): boolean {
  if (pointsEqual(a, c) || pointsEqual(b, c)) return false;
  return isBetween(a, b, c);
}

export function segmentLengthSq(s: Segment): number {
  return distanceSq(s.a, s.b);
}

export function isDegenerate(s: Segment): boolean {
  return pointsEqual(s.a, s.b);
}

/** Dois segmentos apontam na mesma direção ou na oposta (mesma reta suporte). */
export function areParallel(s: Segment, t: Segment): boolean {
  const d1x = s.b.x - s.a.x;
  const d1y = s.b.y - s.a.y;
  const d2x = t.b.x - t.a.x;
  const d2y = t.b.y - t.a.y;
  return d1x * d2y - d1y * d2x === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interseção
// ─────────────────────────────────────────────────────────────────────────────

export type IntersectionKind = 'none' | 'point' | 'overlap';

export interface IntersectionResult {
  kind: IntersectionKind;
  /** Preenchido em 'point'. Já arredondado para mm inteiro. */
  at?: Point;
  /** Preenchido em 'overlap': o trecho comum às duas retas colineares. */
  overlap?: Segment;
}

/**
 * Interseção de dois segmentos fechados.
 *
 * O caso colinear devolve 'overlap' em vez de um ponto arbitrário. Isso importa:
 * duas paredes desenhadas por cima uma da outra não têm "um" ponto de cruzamento, e
 * fingir que têm produziria faces fantasma no arranjo planar.
 */
export function intersectSegments(s: Segment, t: Segment): IntersectionResult {
  if (isDegenerate(s) || isDegenerate(t)) return { kind: 'none' };

  const d1 = orientation(s.a, s.b, t.a);
  const d2 = orientation(s.a, s.b, t.b);
  const d3 = orientation(t.a, t.b, s.a);
  const d4 = orientation(t.a, t.b, s.b);

  // Colineares: procurar sobreposição projetando na direção dominante.
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const horizontal = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y);
    const key = (p: Point) => (horizontal ? p.x : p.y);

    const sLo = key(s.a) <= key(s.b) ? s.a : s.b;
    const sHi = key(s.a) <= key(s.b) ? s.b : s.a;
    const tLo = key(t.a) <= key(t.b) ? t.a : t.b;
    const tHi = key(t.a) <= key(t.b) ? t.b : t.a;

    const lo = key(sLo) >= key(tLo) ? sLo : tLo;
    const hi = key(sHi) <= key(tHi) ? sHi : tHi;

    if (key(lo) > key(hi)) return { kind: 'none' };
    if (pointsEqual(lo, hi)) return { kind: 'point', at: lo };
    return { kind: 'overlap', overlap: { a: lo, b: hi } };
  }

  // Cruzamento próprio ou toque em ponta.
  const proper = d1 !== d2 && d3 !== d4;
  const touches =
    (d1 === 0 && isBetween(s.a, s.b, t.a)) ||
    (d2 === 0 && isBetween(s.a, s.b, t.b)) ||
    (d3 === 0 && isBetween(t.a, t.b, s.a)) ||
    (d4 === 0 && isBetween(t.a, t.b, s.b));

  if (!proper && !touches) return { kind: 'none' };

  // Toque exato numa ponta: devolver a ponta em si, sem passar pela divisão.
  // Além de mais rápido, evita que o arredondamento desloque um vértice que já
  // era exato — origem clássica de junção que "quase" fecha.
  if (d1 === 0 && isBetween(s.a, s.b, t.a)) return { kind: 'point', at: t.a };
  if (d2 === 0 && isBetween(s.a, s.b, t.b)) return { kind: 'point', at: t.b };
  if (d3 === 0 && isBetween(t.a, t.b, s.a)) return { kind: 'point', at: s.a };
  if (d4 === 0 && isBetween(t.a, t.b, s.b)) return { kind: 'point', at: s.b };

  const r1x = s.b.x - s.a.x;
  const r1y = s.b.y - s.a.y;
  const r2x = t.b.x - t.a.x;
  const r2y = t.b.y - t.a.y;

  const denom = r1x * r2y - r1y * r2x;
  if (denom === 0) return { kind: 'none' }; // já coberto acima; guarda defensiva

  const num = (t.a.x - s.a.x) * r2y - (t.a.y - s.a.y) * r2x;
  const u = num / denom;

  return {
    kind: 'point',
    at: { x: roundToMm(s.a.x + u * r1x), y: roundToMm(s.a.y + u * r1y) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Polígonos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Área com sinal pelo laço do agrimensor, em mm².
 *
 * Devolve o DOBRO da área como inteiro exato e só então divide por 2 — assim a
 * soma inteira acumula sem erro e a divisão acontece uma única vez no fim.
 * Positivo = anti-horário.
 */
export function signedArea(ring: Point[]): number {
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

export function polygonArea(ring: Point[]): number {
  return Math.abs(signedArea(ring));
}

export function polygonPerimeter(ring: Point[]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    total += Math.sqrt(distanceSq(p, q));
  }
  return roundToMm(total);
}

export function isCounterClockwise(ring: Point[]): boolean {
  return signedArea(ring) > 0;
}

/** Ponto-em-polígono por ray casting, com fronteira contando como dentro. */
export function pointInPolygon(ring: Point[], p: Point): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (areCollinear(a, b, p) && isBetween(a, b, p)) return true;
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < xCross) inside = !inside;
  }
  return inside;
}

/**
 * Um ponto garantidamente DENTRO do polígono, respeitando os buracos.
 *
 * Serve de âncora para a etiqueta de ambiente. O centroide resolve o caso comum
 * e falha justamente nos que interessam: num "L" ele cai fora, e num ambiente
 * com vazio central ele cai dentro do vazio. Nos dois casos a etiqueta ficaria
 * ancorada onde o ambiente não está, e o nome sumiria na próxima rederivação.
 *
 * O plano B varre uma linha horizontal e escolhe o MEIO do maior trecho
 * interno — que é onde a etiqueta cabe, e não por acaso onde um projetista a
 * colocaria.
 */
export function interiorPoint(ring: Point[], holes: Point[][] = []): Point {
  const dentro = (p: Point) =>
    pointInPolygon(ring, p) && !holes.some((h) => pointInPolygon(h, p));

  // Plano A: centroide de área.
  let duasVezes = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const f = a.x * b.y - b.x * a.y;
    duasVezes += f;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  if (duasVezes !== 0) {
    const centroide = point(Math.round(cx / (3 * duasVezes)), Math.round(cy / (3 * duasVezes)));
    if (dentro(centroide)) return centroide;
  }

  // Plano B: varredura horizontal, no meio do maior trecho interno.
  const ys = [...new Set([...ring, ...holes.flat()].map((p) => p.y))].sort((a, b) => a - b);
  let melhor: Point | null = null;
  let maiorVao = -1;

  for (let i = 0; i + 1 < ys.length; i++) {
    const y = Math.round((ys[i] + ys[i + 1]) / 2);
    const xs: number[] = [];
    for (const anel of [ring, ...holes]) {
      for (let j = 0; j < anel.length; j++) {
        const a = anel[j];
        const b = anel[(j + 1) % anel.length];
        if (a.y > y === b.y > y) continue;
        xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const vao = xs[k + 1] - xs[k];
      if (vao <= maiorVao) continue;
      const candidato = point(Math.round((xs[k] + xs[k + 1]) / 2), y);
      if (!dentro(candidato)) continue;
      maiorVao = vao;
      melhor = candidato;
    }
  }

  // Degenerado (anel com menos de 3 pontos, área nula): devolve o primeiro
  // vértice em vez de mentir com um ponto inventado.
  return melhor ?? ring[0] ?? point(0, 0);
}

/** Auto-interseção: qualquer par de arestas não adjacentes que se cruzam. */
export function isSimplePolygon(ring: Point[]): boolean {
  const n = ring.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const s: Segment = { a: ring[i], b: ring[(i + 1) % n] };
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const t: Segment = { a: ring[j], b: ring[(j + 1) % n] };
      const hit = intersectSegments(s, t);

      if (adjacent) {
        // Vizinhas podem tocar no vértice comum, mas não sobrepor.
        if (hit.kind === 'overlap') return false;
        continue;
      }
      if (hit.kind !== 'none') return false;
    }
  }
  return true;
}

/**
 * Rotaciona o anel para começar pelo vértice lexicograficamente menor e o orienta
 * anti-horário. Dois anéis com a mesma forma geométrica passam a ter exatamente a
 * mesma lista de pontos — é isso que permite comparar faces por igualdade estrutural
 * em vez de por tolerância.
 */
export function canonicalizeRing(ring: Point[]): Point[] {
  if (ring.length === 0) return [];

  let start = 0;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    const best = ring[start];
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) start = i;
  }

  const rotated = [...ring.slice(start), ...ring.slice(0, start)];
  if (!isCounterClockwise(rotated)) {
    // Inverter mantendo o primeiro vértice na frente.
    return [rotated[0], ...rotated.slice(1).reverse()];
  }
  return rotated;
}

export function assertFiniteRing(ring: Point[]): void {
  for (const p of ring) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      throw new KernelError('NOT_INTEGER_MM', `Anel com vértice não inteiro: ${pointKey(p)}`);
    }
  }
}
