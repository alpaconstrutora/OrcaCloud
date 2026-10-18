/**
 * MURO (0.104.0) — a geometria derivada: os TRECHOS do percurso entre os portões, cada um com a base (o terreno) nas
 * duas pontas, e os VÃOS dos portões. Quem desenha (planta, 3D, IFC) e quem compra (quantitativo) lê daqui — nenhum
 * deles refaz a conta do percurso.
 */
import type { BlueprintModel, Muro, PortaoDoMuro } from './model';
import { comprimentoDoMuro } from './model';
import type { Point } from './geom';

/** Um pedaço reto do muro (entre vértices e/ou portões), com a base absoluta (mm do zero do desenho) nas pontas. */
export interface TrechoDoMuro {
  a: Point;
  b: Point;
  baseAMm: number;
  baseBMm: number;
  comprimentoMm: number;
}
/** Um vão de portão em planta, com a base nas pontas (o piso do portão). */
export interface VaoDoPortao extends TrechoDoMuro {
  portao: PortaoDoMuro;
  indice: number;
}

/** A cota do piso do pavimento do muro (0 sem pavimento). */
function pisoDoMuro(model: BlueprintModel, muro: Muro): number {
  return model.levels.find((l) => l.id === muro.levelId)?.elevationMm ?? 0;
}

/** As distâncias acumuladas de cada vértice ao primeiro, ao longo do percurso. */
function acumulados(muro: Pick<Muro, 'pontos'>): number[] {
  const s = [0];
  for (let i = 1; i < muro.pontos.length; i++) s.push(s[i - 1] + Math.hypot(muro.pontos[i].x - muro.pontos[i - 1].x, muro.pontos[i].y - muro.pontos[i - 1].y));
  return s;
}

/** O ponto e a cota da base a `d` mm do primeiro vértice, ao longo do percurso (preso nas pontas). */
export function noPercursoDoMuro(model: BlueprintModel, muro: Muro, d: number): { p: Point; baseMm: number } {
  const s = acumulados(muro);
  const piso = pisoDoMuro(model, muro);
  const base = (i: number) => muro.cotasDaBaseMm?.[i] ?? piso;
  const L = s[s.length - 1];
  const t = Math.max(0, Math.min(L, d));
  let i = 1;
  while (i < s.length - 1 && s[i] < t) i++;
  const seg = s[i] - s[i - 1] || 1;
  const f = (t - s[i - 1]) / seg;
  const a = muro.pontos[i - 1];
  const b = muro.pontos[i];
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, baseMm: base(i - 1) + (base(i) - base(i - 1)) * f };
}

/** O percurso de `d0` a `d1` cortado nos vértices: os pedaços retos, com a base nas pontas. */
function pedacos(model: BlueprintModel, muro: Muro, d0: number, d1: number): TrechoDoMuro[] {
  if (d1 - d0 < 1e-6) return [];
  const s = acumulados(muro);
  const cortes = [d0, ...s.filter((x) => x > d0 + 1e-6 && x < d1 - 1e-6), d1];
  const saida: TrechoDoMuro[] = [];
  for (let k = 1; k < cortes.length; k++) {
    const A = noPercursoDoMuro(model, muro, cortes[k - 1]);
    const B = noPercursoDoMuro(model, muro, cortes[k]);
    saida.push({ a: A.p, b: B.p, baseAMm: A.baseMm, baseBMm: B.baseMm, comprimentoMm: cortes[k] - cortes[k - 1] });
  }
  return saida;
}

/** Os trechos CHEIOS do muro — o percurso menos os vãos dos portões. */
export function trechosDoMuro(model: BlueprintModel, muro: Muro): TrechoDoMuro[] {
  const L = comprimentoDoMuro(muro);
  const saida: TrechoDoMuro[] = [];
  let d = 0;
  for (const g of muro.portoes) {
    saida.push(...pedacos(model, muro, d, Math.min(L, g.offsetMm)));
    d = Math.max(d, g.offsetMm + g.larguraMm);
  }
  saida.push(...pedacos(model, muro, d, L));
  return saida;
}

/** Os vãos dos portões em planta (um portão que dobra a esquina vira mais de um pedaço — fica o primeiro e o último). */
export function vaosDosPortoes(model: BlueprintModel, muro: Muro): VaoDoPortao[] {
  return muro.portoes.map((portao, indice) => {
    const A = noPercursoDoMuro(model, muro, portao.offsetMm);
    const B = noPercursoDoMuro(model, muro, portao.offsetMm + portao.larguraMm);
    return { portao, indice, a: A.p, b: B.p, baseAMm: A.baseMm, baseBMm: B.baseMm, comprimentoMm: portao.larguraMm };
  });
}

/** As áreas de face, m²: a alvenaria (o muro, ou a mureta no misto) e a grade, nos trechos cheios. */
export function areasDoMuro(model: BlueprintModel, muro: Muro): { alvenariaM2: number; gradeM2: number; comprimentoCheioM: number } {
  const cheio = trechosDoMuro(model, muro).reduce((s, t) => s + t.comprimentoMm, 0) / 1000;
  const h = muro.alturaMm / 1000;
  const mureta = (muro.alturaDaMuretaMm ?? 0) / 1000;
  const r = (v: number) => Math.round(v * 100) / 100;
  if (muro.tipo === 'ALVENARIA') return { alvenariaM2: r(cheio * h), gradeM2: 0, comprimentoCheioM: r(cheio) };
  if (muro.tipo === 'GRADE') return { alvenariaM2: 0, gradeM2: r(cheio * h), comprimentoCheioM: r(cheio) };
  return { alvenariaM2: r(cheio * mureta), gradeM2: r(cheio * (h - mureta)), comprimentoCheioM: r(cheio) };
}
