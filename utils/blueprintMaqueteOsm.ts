/**
 * OS PRÉDIOS DO ENTORNO NA MAQUETE (25/11/2026, o reel da Hektar; decisão do usuário: prédios do
 * OpenStreetMap). Puro: a caixa do terreno → os ladrilhos vetoriais que a cobrem → prismas no espaço
 * do DESENHO (mm), já com a base no relevo.
 *
 * ─── POR QUE LADRILHO VETORIAL, E NÃO O OVERPASS ────────────────────────────
 *
 * A 1ª versão consultava o Overpass. Medido em 25/11/2026: o servidor principal respondeu "at
 * capacity" (502) e, noutra hora, levou 40 s; dos espelhos, um deu 504 e dois estouraram 60 s. Os
 * MESMOS dados do OSM vêm do OpenFreeMap (esquema OpenMapTiles) em ladrilhos por CDN: CORS `*`,
 * ~80 ms por ladrilho, e a camada `building` já traz `render_height` (altura do OSM, ou andares, ou
 * 5 m). No zoom 14 o OpenMapTiles JUNTA os prédios de mesma altura numa feição com vários anéis —
 * cada anel externo é um prédio (170 prédios em 14 feições no centro de Campinas).
 *
 * Licença: ODbL. A atribuição aparece no 3D enquanto os prédios estão à vista.
 */

import type { Georreferencia, Point } from './blueprintKernel';
import { geoParaLocal, localParaGeo, type GradeDeElevacao, type LatLon } from './blueprintTopografia';
import type { CamadaMvt } from './geo/mvt';

/** O TileJSON do OpenFreeMap: dá o molde da URL dos ladrilhos (a versão muda a cada semana). */
export const URL_OPENFREEMAP = 'https://tiles.openfreemap.org/planet';
export const ATRIBUICAO_OSM = '© OpenMapTiles © colaboradores do OpenStreetMap (OpenFreeMap)';
/** O zoom em que a camada `building` existe (13–14); no 14 vem com o contorno de cada prédio. */
export const ZOOM_DOS_PREDIOS = 14;
/** Teto de ladrilhos por terreno: 4 × 4 no zoom 14 ≈ 10 km de lado — mais que isso não é maquete de lote. */
export const MAX_LADRILHOS = 16;

export interface CaixaGeo {
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

/** A caixa geográfica que cobre a grade do relevo (os quatro cantos, por causa do giro do norte). */
export function caixaGeoDaGrade(grade: Pick<GradeDeElevacao, 'origem' | 'espacamentoMm' | 'colunas' | 'linhas'>, geo: Georreferencia): CaixaGeo {
  const { origem, espacamentoMm: esp, colunas, linhas } = grade;
  const x1 = origem.x + (colunas - 1) * esp;
  const y1 = origem.y + (linhas - 1) * esp;
  const cantos = [
    { x: origem.x, y: origem.y },
    { x: x1, y: origem.y },
    { x: x1, y: y1 },
    { x: origem.x, y: y1 },
  ].map((p) => localParaGeo(p, geo));
  return {
    sul: Math.min(...cantos.map((c) => c.lat)),
    norte: Math.max(...cantos.map((c) => c.lat)),
    oeste: Math.min(...cantos.map((c) => c.lon)),
    leste: Math.max(...cantos.map((c) => c.lon)),
  };
}

// ── Ladrilhos (Web Mercator, esquema XYZ) ───────────────────────────────────

export interface Ladrilho {
  z: number;
  x: number;
  y: number;
}

const colunaDoLadrilho = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const linhaDoLadrilho = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Os ladrilhos que cobrem a caixa. Mais que `MAX_LADRILHOS` → `null` (terreno grande demais). */
export function ladrilhosDaCaixa(c: CaixaGeo, z = ZOOM_DOS_PREDIOS): Ladrilho[] | null {
  const x0 = colunaDoLadrilho(c.oeste, z);
  const x1 = colunaDoLadrilho(c.leste, z);
  const y0 = linhaDoLadrilho(c.norte, z);
  const y1 = linhaDoLadrilho(c.sul, z);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_LADRILHOS) return null;
  const out: Ladrilho[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x, y });
  return out;
}

/** Ponto do ladrilho (0…extent, y para baixo) → latitude/longitude. */
export function geoDoLadrilho(t: Ladrilho, px: number, py: number, extent: number): LatLon {
  const n = 2 ** t.z;
  const lon = ((t.x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + py / extent)) / n))) * 180) / Math.PI;
  return { lat, lon };
}

/**
 * Recorta o anel no quadrado do ladrilho [0, extent]² (Sutherland–Hodgman — o recorte é convexo, então
 * vale para qualquer anel). O ladrilho traz uma margem de sobra além da borda: sem o recorte, o
 * prédio na divisa entre dois ladrilhos sairia duas vezes, sobreposto.
 */
export function recortarNoLadrilho(anel: readonly { x: number; y: number }[], extent: number): { x: number; y: number }[] {
  let pts = anel.slice();
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
  const lados: [(p: { x: number; y: number }) => number, number][] = [
    [(p) => p.x, 0],
    [(p) => -p.x, -extent],
    [(p) => p.y, 0],
    [(p) => -p.y, -extent],
  ];
  for (const [f, lim] of lados) {
    if (pts.length === 0) break;
    const saida: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const da = f(a) - lim;
      const db = f(b) - lim;
      if (da >= 0) saida.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        saida.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    pts = saida;
  }
  return pts;
}

/** Área com sinal no referencial do ladrilho (y para baixo): anel EXTERNO > 0, furo < 0 (MVT 2.1). */
export function areaNoLadrilho(anel: readonly { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Um prédio no mundo, antes de ir ao desenho. */
export interface PredioGeo {
  anel: LatLon[];
  /** Altura do topo acima do chão (m) — `render_height`. */
  alturaM: number;
  /** Onde o volume começa acima do chão (m) — `render_min_height` (parte de prédio elevada). */
  inicioM: number;
}

/** A camada `building` de um ladrilho → prédios (um por anel externo, recortado no ladrilho). */
export function prediosDoLadrilho(camada: CamadaMvt, t: Ladrilho): PredioGeo[] {
  const out: PredioGeo[] = [];
  for (const f of camada.feicoes) {
    if (f.tipo !== 3 || f.propriedades.hide_3d === true) continue;
    const altura = typeof f.propriedades.render_height === 'number' ? f.propriedades.render_height : 5;
    const inicio = typeof f.propriedades.render_min_height === 'number' ? f.propriedades.render_min_height : 0;
    if (!(altura > inicio)) continue;
    for (const anel of f.geometria) {
      if (areaNoLadrilho(anel) <= 0) continue; // furo (pátio interno): a maquete não o abre
      const recortado = recortarNoLadrilho(anel, camada.extent);
      if (recortado.length < 3 || Math.abs(areaNoLadrilho(recortado)) < 1) continue;
      out.push({ anel: recortado.map((p) => geoDoLadrilho(t, p.x, p.y, camada.extent)), alturaM: altura, inicioM: inicio });
    }
  }
  return out;
}

// ── No desenho ──────────────────────────────────────────────────────────────

export interface PredioDaMaquete {
  id: string;
  /** Contorno no desenho (mm), sem repetir o primeiro ponto no fim. */
  anel: Point[];
  /** Cota da base do VOLUME (m, absoluta): a menor cota do relevo sob os vértices + `inicioM`. */
  baseM: number;
  /** Altura do volume (m). */
  alturaM: number;
}

interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function caixaDoAnel(anel: readonly Point[]): Caixa {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of anel) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

const cruzam = (a: Caixa, b: Caixa) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * Os prédios → o desenho.
 *
 * - `cotaEm(p)`: a cota do relevo (m) num ponto do desenho, `null` fora da malha. Prédio com
 *   QUALQUER vértice fora da malha fica de fora — meio prédio pendurado na borda do bloco não é
 *   maquete;
 * - `construido`: as caixas (mm) do que o próprio estudo já desenhou (paredes, massa), com folga.
 *   O prédio que cruza uma delas sai: ali o projeto substitui o que existe.
 */
export function prediosNoDesenho(
  predios: readonly PredioGeo[],
  geo: Georreferencia,
  cotaEm: (p: Point) => number | null,
  construido: readonly Caixa[] = [],
): PredioDaMaquete[] {
  const saida: PredioDaMaquete[] = [];
  predios.forEach((pg, i) => {
    const anel = pg.anel.map((c) => geoParaLocal(c, geo));
    if (anel.length < 3) return;
    if (construido.some((c) => cruzam(caixaDoAnel(anel), c))) return;
    let chao = Infinity;
    for (const p of anel) {
      const c = cotaEm(p);
      if (c === null) return;
      if (c < chao) chao = c;
    }
    if (!Number.isFinite(chao)) return;
    saida.push({ id: `osm-${i}`, anel, baseM: chao + pg.inicioM, alturaM: pg.alturaM - pg.inicioM });
  });
  return saida;
}
