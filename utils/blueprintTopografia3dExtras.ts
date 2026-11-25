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
import type { CurvaDeNivel } from './blueprintTopografia';

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
  /** 12/10/2026: as linhas das curvas de nível sobre o relevo. */
  curvas?: CurvasDoRelevo3d[];
  /**
   * A cota (m) que vale Y = 0 no 3D — a mesma passada a `curvasDeNivel3d`. O
   * hover compara a altura do ponto sob o mouse (Y local da malha) com
   * `cotaM − cotaZeroM` de cada curva.
   */
  cotaZeroM?: number;
}

/**
 * CURVAS DE NÍVEL NO 3D (12/10/2026, pedido: *"as curvas de nivel nao esta
 * sendo mostradas no 3d"* → *"SIM"* para desenhar as linhas). Um grupo POR
 * COTA (25/11/2026): todas as partes da mesma cota num `LineSegments` só —
 * não um objeto por polilinha (milhares de trechos), e não mais um por cor,
 * porque o hover do 3D acende a curva inteira DAQUELA cota (o reel da Hektar:
 * *"ao passar o mouse mostre o valor de cada linha"*) e precisa achá-la.
 */
export interface CurvasDoRelevo3d {
  /** A cota da curva (m), a mesma de `CurvaDeNivel.cotaM`. */
  cotaM: number;
  cor: string;
  mestra: boolean;
  /** Pares de vértices (cada trecho é ponta + ponta), x, y, z em metros de mundo. */
  posicoes: Float32Array;
}

/** A cor da curva no 2D (`COR_CURVA_DE_NIVEL` do canvas), a mesma no 3D. */
export const COR_CURVA_3D = '#b45309';
/**
 * Quanto a linha flutua sobre o relevo. A curva está na cota exata, mas a
 * malha do 3D é DECIMADA (`malhaDaGrade`, teto de triângulos): entre dois nós
 * ela corta reto e pode passar por cima da linha — sem a folga, trechos
 * somem dentro do morro. 8 cm não se vê numa encosta de dezenas de metros.
 */
export const FOLGA_DA_CURVA_3D_M = 0.08;

export function curvasDeNivel3d(
  curvas: readonly CurvaDeNivel[],
  cotaZeroM: number,
  /** A cor por cota (arco-íris), quando a planta pinta as curvas pela cota; `null` = a cor única. */
  corDe?: ((cotaM: number) => string) | null,
  /**
   * A superfície que o 3D desenha (`amostradorDaMalha`) e o passo da
   * subdivisão, em mm. Com ela, cada trecho é cortado em pedaços de até
   * `passoMm` e cada ponto ASSENTA na malha (+ folga): dentro de uma célula a
   * malha são dois planos que passam acima da reta entre as arestas, e sem
   * isto a linha sumia em trechos. Sem ela, a linha fica na cota da curva.
   */
  malha?: { altura: (p: { x: number; y: number }) => number | null; passoMm: number } | null,
): CurvasDoRelevo3d[] {
  const grupos = new Map<number, { cotaM: number; cor: string; mestra: boolean; v: number[] }>();
  for (const c of curvas) {
    if (c.pontos.length < 2) continue;
    let g = grupos.get(c.cotaM);
    if (!g) {
      g = { cotaM: c.cotaM, cor: corDe ? corDe(c.cotaM) : COR_CURVA_3D, mestra: c.mestra, v: [] };
      grupos.set(c.cotaM, g);
    } else if (c.mestra) g.mestra = true;
    const yDe = (x: number, y: number) => ((malha ? malha.altura({ x, y }) : null) ?? c.cotaM) - cotaZeroM + FOLGA_DA_CURVA_3D_M;
    for (let i = 0; i + 1 < c.pontos.length; i++) {
      const a = c.pontos[i];
      const b = c.pontos[i + 1];
      const n = malha ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / malha.passoMm)) : 1;
      let px = a.x;
      let py = a.y;
      let pz = yDe(px, py);
      for (let k = 1; k <= n; k++) {
        const qx = a.x + ((b.x - a.x) * k) / n;
        const qy = a.y + ((b.y - a.y) * k) / n;
        const qz = yDe(qx, qy);
        g.v.push(px / 1000, pz, py / 1000, qx / 1000, qz, qy / 1000);
        px = qx;
        py = qy;
        pz = qz;
      }
    }
  }
  return [...grupos.values()]
    .sort((a, b) => a.cotaM - b.cotaM)
    .map((g) => ({ cotaM: g.cotaM, cor: g.cor, mestra: g.mestra, posicoes: new Float32Array(g.v) }));
}

/**
 * O índice, em `niveis` (cotas em ordem CRESCENTE), da cota mais próxima de
 * `cotaM` — a curva que o hover do 3D acende sob o cursor. Busca binária: roda
 * a cada movimento do mouse. Lista vazia → `null`; empate → a de baixo.
 */
export function nivelMaisProximo(niveis: readonly number[], cotaM: number): number | null {
  if (niveis.length === 0 || !Number.isFinite(cotaM)) return null;
  let lo = 0;
  let hi = niveis.length - 1;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (niveis[meio] < cotaM) lo = meio + 1;
    else hi = meio;
  }
  // `lo` = primeira cota ≥ cotaM (ou a última); a vizinha de baixo pode estar mais perto.
  if (lo > 0 && cotaM - niveis[lo - 1] <= niveis[lo] - cotaM) return lo - 1;
  return lo;
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
  /** C1: a cota do platô em cada ponto da aresta (platô inclinado). Sem ela, `cotaPlatoM` vale em toda parte. */
  cotaDoPlatoEm?: (p: Point) => number,
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
      const cotaDoPlato = cotaDoPlatoEm ? cotaDoPlatoEm(p) : cotaPlatoM;
      const terreno =
        terrenoEm(p) ??
        terrenoEm({ x: p.x - m.normal.x * recuo, y: p.y - m.normal.y * recuo }) ??
        terrenoEm({ x: p.x + m.normal.x * recuo, y: p.y + m.normal.y * recuo }) ??
        cotaDoPlato;
      const topo = Math.max(cotaDoPlato, terreno);
      const pe = Math.min(cotaDoPlato, terreno) - 0.5;
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
