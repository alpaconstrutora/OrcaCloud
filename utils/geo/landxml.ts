/**
 * LandXML DE SAÍDA (C3, 26/09/2026) — a superfície, as vias e os lotes num
 * arquivo só, para Civil 3D, TopoGRAPH, Métrica, QGIS.
 *
 *  - `<Surfaces>`: a TIN da versão de topografia — os nós da grade com cota e
 *    dois triângulos por célula (um só quando falta um canto). É a MESMA
 *    superfície de onde as curvas saíram;
 *  - `<Alignments>`: cada via de projeto — o eixo como `<Line>`s em `<CoordGeom>`
 *    e o greide como `<Profile><ProfAlign>` com `<PVI>` e `<ParaCurve>` (a curva
 *    vertical parabólica, pelo comprimento);
 *  - `<Parcels>`: a GLEBA primeiro (o importador lê a primeira parcela como o
 *    contorno do lote — P2.65) e depois cada lote, com a área.
 *
 * Coordenadas em METROS, na ordem do LandXML: NORTE, ESTE, cota. Quem chama
 * decide o plano (UTM com o `<CoordinateSystem>`, ou metros locais).
 *
 * `lerLandXmlCompleto` lê de volta tudo isso — é a prova de ida e volta, e o
 * que falta ao importador de pontos (que só quer a superfície e o contorno).
 */
import type { Point } from '../blueprintKernel';
import type { GradeDeElevacao } from '../blueprintTopografia';
import type { Greide } from '../blueprintVias';

export interface EntradaDoLandXml {
  nomeDoProjeto: string;
  superficie: { nome: string; grade: GradeDeElevacao } | null;
  vias: { nome: string; eixo: Point[]; greide: Greide | null }[];
  /** A gleba (contorno do terreno), se houver — sai como a PRIMEIRA parcela. */
  gleba: { nome: string; anel: Point[] } | null;
  lotes: { nome: string; anel: Point[] }[];
  /** mm do desenho → (este, norte) em metros no plano de saída. */
  paraSaida: (p: Point) => { este: number; norte: number };
  /** `{ epsg: 31983, nome: 'SIRGAS 2000 / UTM 23S' }`, ou null em metros locais. */
  sistema: { epsg: number; nome: string } | null;
  /** Carimbo do arquivo (ISO); fixo nos testes. */
  quando?: Date;
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m4 = (v: number) => v.toFixed(4);
const m3 = (v: number) => v.toFixed(3);

function areaM2(pts: { este: number; norte: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.este * b.norte - b.este * a.norte;
  }
  return Math.abs(s) / 2;
}

function coordGeom(pts: { este: number; norte: number }[], fechar: boolean): string {
  const lista = fechar ? [...pts, pts[0]] : pts;
  const linhas: string[] = [];
  for (let i = 0; i + 1 < lista.length; i++) {
    const a = lista[i];
    const b = lista[i + 1];
    linhas.push(`<Line><Start>${m4(a.norte)} ${m4(a.este)}</Start><End>${m4(b.norte)} ${m4(b.este)}</End></Line>`);
  }
  return `<CoordGeom>${linhas.join('')}</CoordGeom>`;
}

export function landXmlDaTopografia(e: EntradaDoLandXml): string {
  const quando = e.quando ?? new Date();
  const data = quando.toISOString().slice(0, 10);
  const hora = quando.toISOString().slice(11, 19);
  const partes: string[] = [];
  partes.push('<?xml version="1.0" encoding="UTF-8"?>');
  partes.push(`<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${data}" time="${hora}">`);
  partes.push('<Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>');
  if (e.sistema) partes.push(`<CoordinateSystem epsgCode="${e.sistema.epsg}" name="${xml(e.sistema.nome)}"/>`);
  partes.push(`<Project name="${xml(e.nomeDoProjeto)}"/>`);
  partes.push('<Application name="ÒPURA Planta Inteligente" manufacturer="ÒPURA"/>');

  // ── Superfície ──
  if (e.superficie) {
    const { grade } = e.superficie;
    const id = new Map<number, number>();
    const pnts: string[] = [];
    grade.cotasM.forEach((z, i) => {
      if (z === null) return;
      const c = i % grade.colunas;
      const l = Math.floor(i / grade.colunas);
      const p = e.paraSaida({ x: grade.origem.x + c * grade.espacamentoMm, y: grade.origem.y + l * grade.espacamentoMm });
      id.set(i, pnts.length + 1);
      pnts.push(`<P id="${pnts.length + 1}">${m4(p.norte)} ${m4(p.este)} ${m3(z)}</P>`);
    });
    const faces: string[] = [];
    for (let l = 0; l + 1 < grade.linhas; l++) {
      for (let c = 0; c + 1 < grade.colunas; c++) {
        const a = id.get(l * grade.colunas + c);
        const b = id.get(l * grade.colunas + c + 1);
        const d = id.get((l + 1) * grade.colunas + c);
        const f = id.get((l + 1) * grade.colunas + c + 1);
        const tri = (x?: number, y?: number, z?: number) => {
          if (x && y && z) faces.push(`<F>${x} ${y} ${z}</F>`);
        };
        if (a && b && d && f) {
          tri(a, b, f);
          tri(a, f, d);
        } else {
          // Um canto sem cota: o triângulo que sobra, se sobrar.
          const vivos = [a, b, f, d].filter((x): x is number => !!x);
          if (vivos.length === 3) tri(vivos[0], vivos[1], vivos[2]);
        }
      }
    }
    partes.push(`<Surfaces><Surface name="${xml(e.superficie.nome)}"><Definition surfType="TIN"><Pnts>${pnts.join('')}</Pnts><Faces>${faces.join('')}</Faces></Definition></Surface></Surfaces>`);
  }

  // ── Vias ──
  const vias = e.vias.filter((v) => v.eixo.length >= 2);
  if (vias.length > 0) {
    const al: string[] = [];
    for (const v of vias) {
      const pts = v.eixo.map((p) => e.paraSaida(p));
      let comp = 0;
      for (let i = 0; i + 1 < pts.length; i++) comp += Math.hypot(pts[i + 1].este - pts[i].este, pts[i + 1].norte - pts[i].norte);
      let perfil = '';
      if (v.greide && v.greide.pontos.length > 0) {
        const pvis = [...v.greide.pontos]
          .sort((a, b) => a.distM - b.distM)
          .map((p) => (p.curvaM && p.curvaM > 0 ? `<ParaCurve length="${m3(p.curvaM)}">${m4(p.distM)} ${m3(p.cotaM)}</ParaCurve>` : `<PVI>${m4(p.distM)} ${m3(p.cotaM)}</PVI>`));
        perfil = `<Profile name="${xml(v.nome)}"><ProfAlign name="Greide">${pvis.join('')}</ProfAlign></Profile>`;
      }
      al.push(`<Alignment name="${xml(v.nome)}" length="${m4(comp)}" staStart="0">${coordGeom(pts, false)}${perfil}</Alignment>`);
    }
    partes.push(`<Alignments name="Vias">${al.join('')}</Alignments>`);
  }

  // ── Parcelas: a gleba PRIMEIRO ──
  const parcelas: string[] = [];
  const parcela = (nome: string, anel: Point[]) => {
    if (anel.length < 3) return;
    const pts = anel.map((p) => e.paraSaida(p));
    parcelas.push(`<Parcel name="${xml(nome)}" area="${m4(areaM2(pts))}">${coordGeom(pts, true)}</Parcel>`);
  };
  if (e.gleba) parcela(e.gleba.nome, e.gleba.anel);
  for (const l of e.lotes) parcela(l.nome, l.anel);
  if (parcelas.length > 0) partes.push(`<Parcels name="Loteamento">${parcelas.join('')}</Parcels>`);

  partes.push('</LandXML>');
  return partes.join('\n');
}

// ── Leitura completa (a volta) ───────────────────────────────────────────────

export interface NE {
  norte: number;
  este: number;
}

export interface LandXmlLido {
  sistema: { epsg: number; nome: string } | null;
  superficie: { nome: string; pontos: (NE & { cota: number })[]; faces: [number, number, number][] } | null;
  alinhamentos: { nome: string; eixo: NE[]; pvis: { sta: number; cota: number; curvaM: number | null }[] }[];
  parcelas: { nome: string; anel: NE[]; area: number | null }[];
}

const atributo = (tag: string, nome: string) => tag.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`))?.[1] ?? null;
const numeros = (t: string) => t.trim().split(/[\s,]+/).map(Number);

function verticesDoCoordGeom(bloco: string): NE[] {
  const out: NE[] = [];
  const linhas = [...bloco.matchAll(/<Line\b[^>]*>\s*<Start\b[^>]*>([^<]*)<\/Start>\s*<End\b[^>]*>([^<]*)<\/End>\s*<\/Line>/g)];
  linhas.forEach((m, i) => {
    const [n, e] = numeros(m[1]);
    out.push({ norte: n, este: e });
    if (i === linhas.length - 1) {
      const [n2, e2] = numeros(m[2]);
      out.push({ norte: n2, este: e2 });
    }
  });
  return out;
}

export function lerLandXmlCompleto(texto: string): LandXmlLido {
  const cs = texto.match(/<CoordinateSystem\b([^>]*)\/?>/)?.[1];
  const epsg = cs ? Number(atributo(cs, 'epsgCode')) : NaN;
  const sistema = cs && Number.isFinite(epsg) ? { epsg, nome: atributo(cs, 'name') ?? '' } : null;

  let superficie: LandXmlLido['superficie'] = null;
  const sup = texto.match(/<Surface\b([^>]*)>([\s\S]*?)<\/Surface>/);
  if (sup) {
    const idx = new Map<string, number>();
    const pontos: (NE & { cota: number })[] = [];
    for (const m of sup[2].matchAll(/<P\b([^>]*)>([^<]*)<\/P>/g)) {
      const id = atributo(m[1], 'id');
      const [n, e, z] = numeros(m[2]);
      if (id) idx.set(id, pontos.length);
      pontos.push({ norte: n, este: e, cota: z });
    }
    const faces: [number, number, number][] = [];
    for (const m of sup[2].matchAll(/<F\b[^>]*>([^<]*)<\/F>/g)) {
      const [a, b, c] = m[1].trim().split(/\s+/).map((x) => idx.get(x));
      if (a !== undefined && b !== undefined && c !== undefined) faces.push([a, b, c]);
    }
    superficie = { nome: atributo(sup[1], 'name') ?? '', pontos, faces };
  }

  const alinhamentos: LandXmlLido['alinhamentos'] = [];
  for (const m of texto.matchAll(/<Alignment\b([^>]*)>([\s\S]*?)<\/Alignment>/g)) {
    const cg = m[2].match(/<CoordGeom\b[^>]*>([\s\S]*?)<\/CoordGeom>/)?.[1] ?? '';
    const pvis: { sta: number; cota: number; curvaM: number | null }[] = [];
    for (const p of m[2].matchAll(/<(PVI|ParaCurve)\b([^>]*)>([^<]*)<\/\1>/g)) {
      const [sta, cota] = numeros(p[3]);
      pvis.push({ sta, cota, curvaM: p[1] === 'ParaCurve' ? Number(atributo(p[2], 'length')) : null });
    }
    alinhamentos.push({ nome: atributo(m[1], 'name') ?? '', eixo: verticesDoCoordGeom(cg), pvis });
  }

  const parcelas: LandXmlLido['parcelas'] = [];
  for (const m of texto.matchAll(/<Parcel\b([^>]*)>([\s\S]*?)<\/Parcel>/g)) {
    const v = verticesDoCoordGeom(m[2]);
    const fecha = v.length > 1 && v[0].norte === v[v.length - 1].norte && v[0].este === v[v.length - 1].este;
    const area = atributo(m[1], 'area');
    parcelas.push({ nome: atributo(m[1], 'name') ?? '', anel: fecha ? v.slice(0, -1) : v, area: area === null ? null : Number(area) });
  }
  return { sistema, superficie, alinhamentos, parcelas };
}
