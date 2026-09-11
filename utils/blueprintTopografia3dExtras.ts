/**
 * Drenagem e muros de arrimo NO 3D (fase 8), em números crus para o viewer.
 *
 * O viewer (`Blueprint3DViewer`, sob `@ts-nocheck`) só monta `BufferGeometry`
 * do que sai daqui — a conta fica testável fora dele, como `malhaDaGrade`.
 * Convenção do 3D: X = x / 1000, Y = cota − cotaZero, Z = y / 1000 (sem negar
 * y — ver `malhaDaGrade`).
 */

import type { Point } from './blueprintKernel';
import type { LinhaDeDrenagem, MuroDeArrimo } from './blueprintTopografiaAnalises';

export interface LinhaDeDrenagem3d {
  id: string;
  nome: string;
  atende: boolean;
  /** Vértices x, y, z consecutivos (metros de mundo), amostrados ao longo da linha. */
  posicoes: Float32Array;
}

export interface MuroDeArrimo3d {
  aresta: number;
  /** Triângulos da face do muro: uma tira entre a cota do platô (topo) e o terreno (pé), ao longo da aresta. */
  posicoes: Float32Array;
  indices: Uint32Array;
}

export interface ExtrasDoRelevo3d {
  drenagem: LinhaDeDrenagem3d[];
  muros: MuroDeArrimo3d[];
}

/** A linha, amostrada a `passoMm`, apoiada na superfície de projeto e 5 cm acima dela (para não sumir dentro da malha). */
export function linhasDeDrenagem3d(
  linhas: LinhaDeDrenagem[],
  atende: Record<string, boolean>,
  cotaEm: (p: Point) => number | null,
  cotaZeroM: number,
  passoMm = 500,
): LinhaDeDrenagem3d[] {
  const saida: LinhaDeDrenagem3d[] = [];
  for (const l of linhas) {
    if (l.pontos.length < 2) continue;
    const pontos: number[] = [];
    let ultima: number | null = null;
    for (let i = 0; i + 1 < l.pontos.length; i++) {
      const a = l.pontos[i];
      const b = l.pontos[i + 1];
      const comp = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(comp / passoMm));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const cota: number | null = cotaEm(p) ?? ultima;
        if (cota === null) continue;
        ultima = cota;
        pontos.push(p.x / 1000, cota - cotaZeroM + 0.05, p.y / 1000);
      }
    }
    if (pontos.length >= 6) saida.push({ id: l.id, nome: l.nome, atende: atende[l.id] !== false, posicoes: new Float32Array(pontos) });
  }
  return saida;
}

/**
 * A face de cada muro: tira vertical da aresta, do topo (cota do platô) ao pé
 * (terreno natural amostrado ao longo, recuado meio passo para dentro como em
 * `murosDeArrimo`), com o pé 0,5 m abaixo do terreno onde ele fica acima do
 * platô — o muro entra no chão.
 */
export function murosDeArrimo3d(
  muros: MuroDeArrimo[],
  cotaPlatoM: number,
  terrenoEm: (p: Point) => number | null,
  cotaZeroM: number,
  passoMm = 500,
): MuroDeArrimo3d[] {
  const saida: MuroDeArrimo3d[] = [];
  for (const m of muros) {
    const comp = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
    if (comp === 0) continue;
    const n = Math.max(1, Math.ceil(comp / passoMm));
    const pos: number[] = [];
    const idx: number[] = [];
    const recuo = Math.min(100, passoMm / 4);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = { x: m.a.x + (m.b.x - m.a.x) * t, y: m.a.y + (m.b.y - m.a.y) * t };
      const terreno =
        terrenoEm(p) ??
        terrenoEm({ x: p.x - m.normal.x * recuo, y: p.y - m.normal.y * recuo }) ??
        terrenoEm({ x: p.x + m.normal.x * recuo, y: p.y + m.normal.y * recuo }) ??
        cotaPlatoM;
      const topo = Math.max(cotaPlatoM, terreno);
      const pe = Math.min(cotaPlatoM, terreno) - 0.5;
      pos.push(p.x / 1000, topo - cotaZeroM, p.y / 1000, p.x / 1000, pe - cotaZeroM, p.y / 1000);
      if (k > 0) {
        const b = (k - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    saida.push({ aresta: m.aresta, posicoes: new Float32Array(pos), indices: new Uint32Array(idx) });
  }
  return saida;
}
