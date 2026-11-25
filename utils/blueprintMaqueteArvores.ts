/**
 * AS ÁRVORES DA MAQUETE (25/11/2026, o reel da Hektar; decisão do usuário: árvores pelo satélite —
 * ESA WorldCover 10 m, classe 10 = cobertura arbórea). Puro e DETERMINÍSTICO: a mesma cobertura dá
 * sempre as mesmas árvores (a semente é o índice GLOBAL do pixel), então girar a câmera, trocar de
 * estilo e voltar não "replanta" a mata.
 *
 * Cada pixel de mata (~9 m) vira 1 ou 2 árvores, deslocadas dentro dele, com altura e copa
 * variadas. Ficam de fora: pixel fora do relevo (a maquete termina no bloco), dentro de um prédio do
 * OSM e sobre o que o próprio estudo desenhou (ali o projeto substitui o que existe). Acima do teto
 * de instâncias, a mata rareia por igual (pelo hash, não cortando um lado).
 */
import { pointInPolygon, type Georreferencia, type Point } from './blueprintKernel';
import { geoParaLocal } from './blueprintTopografia';
import { CLASSE_ARVORE, PIXELS_POR_GRAU, type GradeDeCobertura } from './geo/coberturaDoSolo';

export const TETO_DE_ARVORES = 15_000;

export interface ArvoreDaMaquete {
  /** Posição no desenho (mm). */
  x: number;
  y: number;
  /** Cota do chão (m, absoluta). */
  baseM: number;
  alturaM: number;
  /** Raio da copa (m). */
  copaM: number;
}

interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Hash inteiro → [0, 1): mistura do mulberry32, sem estado. */
export function aleatorioDe(semente: number): number {
  let t = (semente + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function arvoresDaCobertura(
  grade: GradeDeCobertura,
  geo: Georreferencia,
  cotaEm: (p: Point) => number | null,
  excluir: { predios?: readonly Point[][]; construido?: readonly Caixa[] } = {},
  teto = TETO_DE_ARVORES,
): ArvoreDaMaquete[] {
  const col0 = Math.round(grade.oeste * PIXELS_POR_GRAU);
  const lin0 = Math.round(grade.norte * PIXELS_POR_GRAU);
  const predios = (excluir.predios ?? []).map((anel) => ({ anel, caixa: caixaDe(anel) }));
  const construido = excluir.construido ?? [];

  const candidatas: (ArvoreDaMaquete & { sorteio: number })[] = [];
  for (let r = 0; r < grade.linhas; r++) {
    for (let k = 0; k < grade.colunas; k++) {
      if (grade.classes[r * grade.colunas + k] !== CLASSE_ARVORE) continue;
      // Semente pelo pixel GLOBAL: a mesma árvore no mesmo lugar, qualquer que seja a caixa pedida.
      const semente = (lin0 - r) * 73_856_093 ^ (col0 + k) * 19_349_663;
      const quantas = aleatorioDe(semente) < 0.45 ? 2 : 1;
      for (let n = 0; n < quantas; n++) {
        const s = semente + n * 1_000_003;
        const lat = (lin0 - r - aleatorioDe(s + 1)) / PIXELS_POR_GRAU;
        const lon = (col0 + k + aleatorioDe(s + 2)) / PIXELS_POR_GRAU;
        const p = geoParaLocal({ lat, lon }, geo);
        const baseM = cotaEm(p);
        if (baseM === null) continue;
        if (construido.some((c) => p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY)) continue;
        if (predios.some((q) => dentroDaCaixa(p, q.caixa) && pointInPolygon(q.anel, p))) continue;
        const alturaM = 5 + aleatorioDe(s + 3) * 7; // 5 a 12 m
        candidatas.push({ x: p.x, y: p.y, baseM, alturaM, copaM: alturaM * (0.28 + aleatorioDe(s + 4) * 0.12), sorteio: aleatorioDe(s + 5) });
      }
    }
  }
  const fracao = candidatas.length > teto ? teto / candidatas.length : 1;
  return candidatas.filter((a) => a.sorteio < fracao).map(({ sorteio: _, ...a }) => a);
}

function caixaDe(anel: readonly Point[]): Caixa {
  return {
    minX: Math.min(...anel.map((p) => p.x)),
    minY: Math.min(...anel.map((p) => p.y)),
    maxX: Math.max(...anel.map((p) => p.x)),
    maxY: Math.max(...anel.map((p) => p.y)),
  };
}

const dentroDaCaixa = (p: Point, c: Caixa) => p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY;
