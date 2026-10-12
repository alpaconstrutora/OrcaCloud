/**
 * CONTORNO DE TRABALHO DO GERADOR (12/10/2026 — F11 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`): gerar a planta DENTRO de um contorno
 * desenhado, e não só no maior retângulo inscrito nele.
 *
 * O gerador (E6.2) trabalha em retângulos. Num contorno em L, o "maior inscrito" jogava
 * fora uma ala inteira (o L de 10 × 10 sem o canto 5 × 5 virava 50 de 75 m²). Aqui o
 * contorno ORTOGONAL é decomposto em retângulos — o maior vira o principal (zonas,
 * recozimento) e os outros, anexos — e as perguntas "este lado é fachada?" e "esta parede
 * é externa?" passam a ser respondidas pelo CONTORNO, não pelo retângulo.
 *
 * Contorno oblíquo (lote torto) segue no maior retângulo inscrito — o gerador avisa quanto
 * da área ficou de fora.
 */
import type { Point } from './blueprintKernel';

export interface RetanguloDoContorno {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export type LadoNoDesenho = 'S' | 'N' | 'L' | 'O';
export interface TrechoNaBorda {
  a: Point;
  b: Point;
  /** Para onde a borda olha (normal EXTERNA), no desenho: S = −Y, N = +Y, L = +X, O = −X. */
  lado: LadoNoDesenho;
}

const TOL = 1;

/** Todas as arestas em X ou Y (tolerância de 1 mm), e pelo menos 4 vértices. */
export function ehOrtogonal(anel: readonly Point[]): boolean {
  if (anel.length < 4) return false;
  return anel.every((p, i) => {
    const q = anel[(i + 1) % anel.length];
    return Math.abs(p.x - q.x) < TOL || Math.abs(p.y - q.y) < TOL;
  });
}

function areaComSinal(anel: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export const areaDoRetangulo = (r: RetanguloDoContorno) => (r.x1 - r.x0) * (r.y1 - r.y0);

/** Fatias perpendiculares a `eixo` entre coordenadas consecutivas dos vértices, fundidas quando contínuas. */
function fatias(anel: readonly Point[], eixo: 'x' | 'y'): RetanguloDoContorno[] {
  const outro = eixo === 'x' ? 'y' : 'x';
  const cs = [...new Set(anel.map((p) => Math.round(p[eixo])))].sort((a, b) => a - b);
  const pedacos: RetanguloDoContorno[] = [];
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i];
    const b = cs[i + 1];
    if (b - a < TOL) continue;
    const m = (a + b) / 2;
    // A linha `eixo = m` cruza as arestas paralelas ao OUTRO eixo — onde ela entra e sai do contorno.
    const cortes: number[] = [];
    for (let k = 0; k < anel.length; k++) {
      const p = anel[k];
      const q = anel[(k + 1) % anel.length];
      if (Math.abs(p[outro] - q[outro]) >= TOL) continue; // só arestas "ao longo" do eixo
      const lo = Math.min(p[eixo], q[eixo]);
      const hi = Math.max(p[eixo], q[eixo]);
      if (m > lo && m < hi) cortes.push(Math.round(p[outro]));
    }
    cortes.sort((u, v) => u - v);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      pedacos.push(eixo === 'x' ? { x0: a, x1: b, y0: cortes[k], y1: cortes[k + 1] } : { y0: a, y1: b, x0: cortes[k], x1: cortes[k + 1] });
    }
  }
  // Funde fatias vizinhas com o mesmo intervalo no outro eixo (o retângulo inteiro de um lado do L).
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i < pedacos.length && !mudou; i++) {
      for (let j = 0; j < pedacos.length && !mudou; j++) {
        if (i === j) continue;
        const r = pedacos[i];
        const s = pedacos[j];
        const encosta = eixo === 'x' ? Math.abs(r.x1 - s.x0) < TOL && Math.abs(r.y0 - s.y0) < TOL && Math.abs(r.y1 - s.y1) < TOL : Math.abs(r.y1 - s.y0) < TOL && Math.abs(r.x0 - s.x0) < TOL && Math.abs(r.x1 - s.x1) < TOL;
        if (encosta) {
          pedacos[i] = eixo === 'x' ? { ...r, x1: s.x1 } : { ...r, y1: s.y1 };
          pedacos.splice(j, 1);
          mudou = true;
        }
      }
    }
  }
  return pedacos;
}

/**
 * O contorno ORTOGONAL em retângulos, o MAIOR primeiro. Das duas decomposições (fatias em X ou
 * em Y) fica a de maior retângulo principal — é nele que mora a zona social e o corredor —, e no
 * empate a de menos peças.
 */
export function retangulosDoContorno(anel: readonly Point[]): RetanguloDoContorno[] {
  if (!ehOrtogonal(anel)) return [];
  const ordenar = (rs: RetanguloDoContorno[]) => [...rs].sort((a, b) => areaDoRetangulo(b) - areaDoRetangulo(a));
  const vx = ordenar(fatias(anel, 'x'));
  const vy = ordenar(fatias(anel, 'y'));
  if (!vx.length) return vy;
  if (!vy.length) return vx;
  const d = areaDoRetangulo(vx[0]) - areaDoRetangulo(vy[0]);
  if (Math.abs(d) > TOL) return d > 0 ? vx : vy;
  return vx.length <= vy.length ? vx : vy;
}

/** O contorno de um retângulo, como anel (anti-horário). */
export const anelDoRetangulo = (r: RetanguloDoContorno): Point[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
] as Point[];

/** O lado comum entre dois retângulos que se encostam (segmento), ou `null`. */
export function ladoComumDosRetangulos(a: RetanguloDoContorno, b: RetanguloDoContorno): { a: Point; b: Point; horizontal: boolean } | null {
  if (Math.abs(a.x1 - b.x0) < TOL || Math.abs(b.x1 - a.x0) < TOL) {
    const x = Math.abs(a.x1 - b.x0) < TOL ? a.x1 : a.x0;
    const lo = Math.max(a.y0, b.y0);
    const hi = Math.min(a.y1, b.y1);
    if (hi - lo > TOL) return { a: { x, y: lo } as Point, b: { x, y: hi } as Point, horizontal: false };
  }
  if (Math.abs(a.y1 - b.y0) < TOL || Math.abs(b.y1 - a.y0) < TOL) {
    const y = Math.abs(a.y1 - b.y0) < TOL ? a.y1 : a.y0;
    const lo = Math.max(a.x0, b.x0);
    const hi = Math.min(a.x1, b.x1);
    if (hi - lo > TOL) return { a: { x: lo, y } as Point, b: { x: hi, y } as Point, horizontal: true };
  }
  return null;
}

/**
 * Os trechos do segmento (de eixos alinhados) que caem SOBRE a borda do contorno, cada um com a
 * normal externa da aresta — "este lado do ambiente é fachada, e olha para onde".
 */
export function trechosNaBorda(a: Point, b: Point, anel: readonly Point[]): TrechoNaBorda[] {
  const horizontal = Math.abs(a.y - b.y) < TOL;
  const vertical = Math.abs(a.x - b.x) < TOL;
  if (!horizontal && !vertical) return [];
  const ccw = areaComSinal(anel) > 0;
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const saida: TrechoNaBorda[] = [];
  for (let k = 0; k < anel.length; k++) {
    const p = anel[k];
    const q = anel[(k + 1) % anel.length];
    const colinear = horizontal ? Math.abs(p.y - q.y) < TOL && Math.abs(p.y - a.y) < TOL : Math.abs(p.x - q.x) < TOL && Math.abs(p.x - a.x) < TOL;
    if (!colinear) continue;
    const elo = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
    const ehi = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
    const i0 = Math.max(lo, elo);
    const i1 = Math.min(hi, ehi);
    if (i1 - i0 <= TOL) continue;
    // Normal externa: à DIREITA do sentido da aresta num anel anti-horário (à esquerda no horário).
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const nx = ccw ? Math.sign(dy) : -Math.sign(dy);
    const ny = ccw ? -Math.sign(dx) : Math.sign(dx);
    const lado: LadoNoDesenho = ny < 0 ? 'S' : ny > 0 ? 'N' : nx > 0 ? 'L' : 'O';
    saida.push(horizontal ? { a: { x: i0, y: a.y } as Point, b: { x: i1, y: a.y } as Point, lado } : { a: { x: a.x, y: i0 } as Point, b: { x: a.x, y: i1 } as Point, lado });
  }
  return saida;
}

/** O que sobra do segmento FORA da borda (parede interna: a borda já é parede externa). */
export function subtrairBorda(a: Point, b: Point, anel: readonly Point[]): { a: Point; b: Point }[] {
  const horizontal = Math.abs(a.y - b.y) < TOL;
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const cobertos = trechosNaBorda(a, b, anel)
    .map((t) => (horizontal ? [t.a.x, t.b.x] : [t.a.y, t.b.y]) as [number, number])
    .sort((u, v) => u[0] - v[0]);
  const livres: [number, number][] = [];
  let cursor = lo;
  for (const [c0, c1] of cobertos) {
    if (c0 - cursor > TOL) livres.push([cursor, c0]);
    cursor = Math.max(cursor, c1);
  }
  if (hi - cursor > TOL) livres.push([cursor, hi]);
  return livres.map(([u, v]) => (horizontal ? { a: { x: u, y: a.y } as Point, b: { x: v, y: a.y } as Point } : { a: { x: a.x, y: u } as Point, b: { x: a.x, y: v } as Point }));
}
