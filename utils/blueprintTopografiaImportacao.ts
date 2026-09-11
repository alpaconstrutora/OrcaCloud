/**
 * IMPORTAÇÃO de pontos cotados (fase 9 da topografia) — o levantamento do
 * topógrafo entrando por arquivo, em vez de digitado.
 *
 * ─── QUATRO FORMATOS, UMA SAÍDA ─────────────────────────────────────────────
 *
 * - TEXTO (CSV/TXT de estação total ou GNSS): linhas `P,N,E,Z,D` (o PNEZD do
 *   CAD) ou `P,E,N,Z,D`, com ou sem cabeçalho, separador `;` `,` tab ou
 *   espaço, vírgula ou ponto decimal. Detecta o que dá; o resto é opção.
 * - GEOJSON e KML: pontos em latitude/longitude com elevação — entram pela
 *   georreferência do lote ("Onde fica"). Sem ela, não há onde pôr.
 * - DXF: POINT (com Z) ou POINT/CIRCLE emparelhado com o TEXT numérico mais
 *   próximo (a cota escrita ao lado da marca).
 * - SVG: `<circle>` (ou marca pequena) emparelhado com o `<text>` numérico
 *   mais próximo; o SVG não tem unidade nem norte, então escala e origem são
 *   opção do usuário e o Y é invertido (no SVG cresce para baixo).
 *
 * Tudo sai em `PontoCotado` (mm do desenho, cota em m), pronto para
 * `amostrarPontosCotados`. A classe da versão continua "Levantamento
 * importado — pendente de validação" (RF-020), e a proveniência leva o nome e
 * o hash do arquivo (RF-014: checksum do insumo).
 *
 * ─── ONDE O ARQUIVO CAI NO DESENHO ──────────────────────────────────────────
 *
 * Coordenadas locais em metros (origem arbitrária do topógrafo) não sabem
 * onde fica o lote. Ancoragem: `DIRETO` (já são coordenadas do desenho),
 * `CENTRO_DO_LOTE` (o centro dos pontos vai para o centro do lote — o mesmo
 * critério de `deslocamentoDaImportacao` do IFC), ou `GEORREFERENCIA` (UTM,
 * lat/long). `AUTO` escolhe: geográfico → georreferência; pontos já sobre o
 * lote → direto; senão → centro do lote, com aviso.
 *
 * Puro, como o resto: texto entra, pontos saem.
 */

import type { Georreferencia, Point } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel';
import { geoParaLocal, type LatLon, type PontoCotado } from './blueprintTopografia';

export type FormatoDeImportacao = 'TEXTO' | 'GEOJSON' | 'KML' | 'DXF' | 'SVG';

export type OrdemDasColunas = 'AUTO' | 'NEZ' | 'ENZ';
export type UnidadeDoArquivo = 'AUTO' | 'M' | 'MM' | 'UTM';
export type AncoragemDaImportacao = 'AUTO' | 'DIRETO' | 'CENTRO_DO_LOTE' | 'GEORREFERENCIA';

export interface OpcoesDeImportacao {
  ordem?: OrdemDasColunas;
  unidade?: UnidadeDoArquivo;
  ancoragem?: AncoragemDaImportacao;
  /** SVG: quantos mm do desenho vale uma unidade do SVG (padrão 1000 = 1 unidade por metro). */
  escalaSvgMmPorUnidade?: number;
  /** UTM: zona e hemisfério; sem eles, deduzidos da georreferência. */
  zonaUtm?: number | null;
  hemisferio?: 'N' | 'S' | null;
}

export interface PontoImportado extends PontoCotado {
  nome?: string;
  codigo?: string;
}

export interface ResultadoDaImportacao {
  formato: FormatoDeImportacao;
  /** Em mm do desenho, já ancorados. */
  pontos: PontoImportado[];
  detectado: {
    separador?: string;
    cabecalho?: boolean;
    ordem: 'NEZ' | 'ENZ' | 'GEO';
    unidade: 'M' | 'MM' | 'UTM' | 'GEO' | 'SVG';
    ancoragem: 'DIRETO' | 'CENTRO_DO_LOTE' | 'GEORREFERENCIA';
    zonaUtm?: number;
    linhasLidas: number;
    linhasIgnoradas: number;
  };
  /** Quantos pontos caem dentro do lote (com anel) — o que a TIN vai usar de verdade. */
  dentroDoLote: number;
  avisos: string[];
}

export interface ContextoDaImportacao {
  anel: Point[] | null;
  georreferencia: Georreferencia | null;
}

export function formatoPeloNome(nome: string): FormatoDeImportacao | null {
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  if (['csv', 'txt', 'pnezd', 'dat', 'pts', 'xyz'].includes(ext)) return 'TEXTO';
  if (['geojson', 'json'].includes(ext)) return 'GEOJSON';
  if (ext === 'kml') return 'KML';
  if (ext === 'dxf') return 'DXF';
  if (ext === 'svg') return 'SVG';
  return null;
}

/** Aceita "1.234,56", "1234.56", "1234,56" e "-12.3e2". */
export function numeroFlexivel(texto: string): number | null {
  let t = texto.trim().replace(/^["']|["']$/g, '');
  if (t === '' || /[a-df-zA-DF-Z]/.test(t)) return null;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// ── UTM ───────────────────────────────────────────────────────────────────

/** Zona UTM de uma longitude (1–60). */
export function zonaUtmDe(lon: number): number {
  return Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
}

/**
 * UTM (WGS 84 / SIRGAS 2000 — o mesmo elipsoide GRS80 para o que interessa)
 * → latitude/longitude. Fórmulas de Snyder; erro abaixo de 1 mm na zona.
 */
export function utmParaLatLon(este: number, norte: number, zona: number, hemisferio: 'N' | 'S'): LatLon {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = este - 500000;
  const y = hemisferio === 'S' ? norte - 10000000 : norte;
  const lon0 = ((zona - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = ep2 * cos1 * cos1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = x / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cos1;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

// ── Leitura bruta por formato ─────────────────────────────────────────────

interface Bruto {
  /** Primeira e segunda coordenadas COMO ESTÃO no arquivo (ainda sem saber se N,E ou E,N). */
  a: number;
  b: number;
  z: number;
  nome?: string;
  codigo?: string;
}

const NOMES_N = /^(n|norte|north|northing|y|lat|latitude)$/i;
const NOMES_E = /^(e|este|east|easting|x|lon|long|longitude)$/i;
const NOMES_Z = /^(z|cota|cota_m|h|alt|altitude|elev|elevation|elevacao|elevação)$/i;
const NOMES_ID = /^(p|pt|ponto|point|id|nome|name|n[ºo]|num|numero|número|est|estaca)$/i;
const NOMES_COD = /^(d|desc|descricao|descrição|cod|codigo|código|code|obs)$/i;

function detectarSeparador(linhas: string[]): string {
  const amostra = linhas.slice(0, 20);
  const conta = (s: string) => amostra.reduce((n, l) => n + (l.split(s).length - 1), 0);
  const tab = conta('\t');
  const pv = conta(';');
  const virg = conta(',');
  if (tab > 0 && tab >= pv && tab >= virg / 2) return '\t';
  if (pv > 0) return ';';
  // Vírgula: separador OU decimal. Se há ponto decimal nas linhas, a vírgula separa.
  if (virg > 0 && amostra.some((l) => /\d\.\d/.test(l))) return ',';
  // Só vírgulas e sem ponto: se cada linha tem ≥ 3 vírgulas, separa; senão é decimal.
  if (virg > 0 && amostra.every((l) => l.split(',').length >= 4 || l.trim() === '')) return ',';
  return ' ';
}

function lerTexto(texto: string): { brutos: Bruto[]; separador: string; cabecalho: boolean; ordemPeloCabecalho: 'NEZ' | 'ENZ' | null; ignoradas: number; geo: boolean } {
  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('//'));
  const separador = detectarSeparador(linhas);
  const dividir = (l: string) => (separador === ' ' ? l.split(/\s+/) : l.split(separador)).map((c) => c.trim());

  let cabecalho = false;
  let ordemPeloCabecalho: 'NEZ' | 'ENZ' | null = null;
  let colunas: { a: number; b: number; z: number; nome: number | null; codigo: number | null } | null = null;
  let geo = false;
  if (linhas.length > 0) {
    const primeira = dividir(linhas[0]);
    const numericos = primeira.filter((c) => numeroFlexivel(c) !== null).length;
    if (numericos < 3 && primeira.length >= 3) {
      cabecalho = true;
      const idx = (re: RegExp) => primeira.findIndex((c) => re.test(c.replace(/\s|\(.*\)/g, '')));
      const iN = idx(NOMES_N);
      const iE = idx(NOMES_E);
      const iZ = idx(NOMES_Z);
      const iId = idx(NOMES_ID);
      const iCod = idx(NOMES_COD);
      if (iN >= 0 && iE >= 0 && iZ >= 0) {
        geo = /lat/i.test(primeira[iN]) && /lon/i.test(primeira[iE]);
        // `a` recebe sempre a coluna N (ou lat), `b` a E (ou lon): ordem já resolvida.
        colunas = { a: iN, b: iE, z: iZ, nome: iId >= 0 ? iId : null, codigo: iCod >= 0 ? iCod : null };
        ordemPeloCabecalho = 'NEZ';
      }
    }
  }

  const brutos: Bruto[] = [];
  let ignoradas = 0;
  for (const linha of linhas.slice(cabecalho ? 1 : 0)) {
    const c = dividir(linha);
    if (colunas) {
      const a = numeroFlexivel(c[colunas.a] ?? '');
      const b = numeroFlexivel(c[colunas.b] ?? '');
      const z = numeroFlexivel(c[colunas.z] ?? '');
      if (a === null || b === null || z === null) {
        ignoradas++;
        continue;
      }
      brutos.push({ a, b, z, nome: colunas.nome !== null ? c[colunas.nome] : undefined, codigo: colunas.codigo !== null ? c[colunas.codigo] : undefined });
      continue;
    }
    // Sem cabeçalho: P? a b z D? — a primeira sequência de três números.
    const nums = c.map((x) => numeroFlexivel(x));
    let inicio = -1;
    for (let i = 0; i + 2 < nums.length; i++) {
      if (nums[i] !== null && nums[i + 1] !== null && nums[i + 2] !== null) {
        inicio = i;
        break;
      }
    }
    // Quatro números seguidos com o primeiro inteiro pequeno: é o número do ponto.
    if (inicio >= 0 && nums.length >= inicio + 4 && nums[inicio + 3] !== null) {
      const p = nums[inicio]!;
      if (Number.isInteger(p) && Math.abs(p) < 100000 && Math.abs(nums[inicio + 1]!) >= 1) inicio += 1;
    }
    if (inicio < 0 || nums.length < inicio + 3) {
      ignoradas++;
      continue;
    }
    const nome = inicio > 0 ? c[inicio - 1] : undefined;
    const resto = c.slice(inicio + 3).filter((x) => numeroFlexivel(x) === null);
    brutos.push({ a: nums[inicio]!, b: nums[inicio + 1]!, z: nums[inicio + 2]!, nome, codigo: resto[0] });
  }
  return { brutos, separador, cabecalho, ordemPeloCabecalho, ignoradas, geo };
}

function lerGeoJson(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[] } {
  let raiz: unknown;
  try {
    raiz = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const brutos: Bruto[] = [];
  let ignoradas = 0;
  const avisos: string[] = [];
  const cotaDe = (props: Record<string, unknown> | null | undefined, coords: number[]): number | null => {
    if (coords.length >= 3 && Number.isFinite(coords[2])) return coords[2];
    for (const k of ['cota', 'cota_m', 'cotaM', 'z', 'Z', 'elev', 'elevation', 'altitude', 'alt', 'h', 'ele']) {
      const v = props?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = numeroFlexivel(v);
        if (n !== null) return n;
      }
    }
    return null;
  };
  const nomeDe = (props: Record<string, unknown> | null | undefined): string | undefined => {
    for (const k of ['nome', 'name', 'id', 'ponto', 'P']) {
      const v = props?.[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
    return undefined;
  };
  const visitar = (geom: { type?: string; coordinates?: unknown } | null, props: Record<string, unknown> | null | undefined) => {
    if (!geom) return;
    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      const c = geom.coordinates as number[];
      const z = cotaDe(props, c);
      if (c.length >= 2 && z !== null) brutos.push({ a: c[1], b: c[0], z, nome: nomeDe(props) });
      else ignoradas++;
    } else if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates as number[][]) {
        const z = cotaDe(props, c);
        if (c.length >= 2 && z !== null) brutos.push({ a: c[1], b: c[0], z, nome: nomeDe(props) });
        else ignoradas++;
      }
    } else if (geom.type === 'GeometryCollection' && Array.isArray((geom as { geometries?: unknown }).geometries)) {
      for (const g of (geom as { geometries: { type?: string; coordinates?: unknown }[] }).geometries) visitar(g, props);
    } else {
      ignoradas++;
    }
  };
  const r = raiz as { type?: string; features?: unknown[]; geometry?: unknown; properties?: unknown };
  if (r?.type === 'FeatureCollection' && Array.isArray(r.features)) {
    for (const f of r.features as { geometry?: unknown; properties?: unknown }[]) visitar(f.geometry as never, f.properties as never);
  } else if (r?.type === 'Feature') {
    visitar(r.geometry as never, r.properties as never);
  } else if (r?.type) {
    visitar(r as never, null);
  } else {
    throw new Error('O JSON não é GeoJSON (sem type).');
  }
  if (ignoradas > 0) avisos.push(`${ignoradas} feição(ões) sem ponto ou sem cota foram ignoradas.`);
  return { brutos, ignoradas, avisos };
}

function lerKml(texto: string): { brutos: Bruto[]; ignoradas: number } {
  const brutos: Bruto[] = [];
  let ignoradas = 0;
  const placemarks = texto.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];
  for (const pm of placemarks) {
    const nome = pm.match(/<name>([\s\S]*?)<\/name>/i)?.[1]?.trim();
    const ponto = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
    if (!ponto) {
      ignoradas++;
      continue;
    }
    const partes = ponto[1].trim().split(/[\s]+/)[0].split(',').map((v) => Number(v));
    if (partes.length < 2 || !Number.isFinite(partes[0]) || !Number.isFinite(partes[1])) {
      ignoradas++;
      continue;
    }
    let z = partes.length >= 3 && Number.isFinite(partes[2]) ? partes[2] : null;
    if (z === null) {
      const dado = pm.match(/<Data name="(?:cota|cota_m|z|elev|elevation|altitude)">[\s\S]*?<value>([\s\S]*?)<\/value>/i);
      z = dado ? numeroFlexivel(dado[1]) : null;
    }
    if (z === null) {
      ignoradas++;
      continue;
    }
    brutos.push({ a: partes[1], b: partes[0], z, nome });
  }
  return { brutos, ignoradas };
}

interface EntidadeDxf {
  tipo: string;
  x: number;
  y: number;
  z: number;
  texto?: string;
  altura?: number;
  raio?: number;
}

/** Só o que a importação de pontos precisa: POINT, CIRCLE, TEXT/MTEXT e $INSUNITS. */
function lerDxf(texto: string): { entidades: EntidadeDxf[]; insunits: number | null } {
  const linhas = texto.split(/\r?\n/);
  const entidades: EntidadeDxf[] = [];
  let insunits: number | null = null;
  let atual: EntidadeDxf | null = null;
  const fechar = () => {
    if (atual && ['POINT', 'CIRCLE', 'TEXT', 'MTEXT'].includes(atual.tipo)) entidades.push(atual);
    atual = null;
  };
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number(linhas[i].trim());
    const valor = linhas[i + 1].trim();
    if (codigo === 9 && valor === '$INSUNITS') {
      const c = Number(linhas[i + 2]?.trim());
      if (c === 70) insunits = Number(linhas[i + 3]?.trim());
      continue;
    }
    if (codigo === 0) {
      fechar();
      atual = { tipo: valor, x: 0, y: 0, z: 0 };
      continue;
    }
    if (!atual) continue;
    const v = Number(valor);
    if (codigo === 10) atual.x = v;
    else if (codigo === 20) atual.y = v;
    else if (codigo === 30) atual.z = v;
    else if (codigo === 40) {
      if (atual.tipo === 'CIRCLE') atual.raio = v;
      else atual.altura = v;
    } else if (codigo === 1) atual.texto = (atual.texto ?? '') + valor;
    else if (codigo === 3) atual.texto = (atual.texto ?? '') + valor;
  }
  fechar();
  return { entidades, insunits };
}

/** Número dentro de um texto de cota ("101,25", "Cota 101.25", "101.25 m"). */
function numeroNoTexto(t: string): number | null {
  const limpo = t.replace(/\\P|\{|\}|\\[A-Za-z][^;]*;/g, ' ');
  const m = limpo.match(/-?\d{1,4}(?:[.,]\d{1,3})?/);
  if (!m) return null;
  const v = numeroFlexivel(m[0]);
  return v !== null && Math.abs(v) < 10000 ? v : null;
}

/** Marcas (POINT/CIRCLE sem Z) casadas com o texto numérico mais próximo. */
function emparelharMarcasComTextos(
  marcas: { x: number; y: number; z: number }[],
  textos: { x: number; y: number; valor: number; alcance: number }[],
): { brutos: Bruto[]; semTexto: number } {
  const brutos: Bruto[] = [];
  let semTexto = 0;
  const usados = new Set<number>();
  for (const m of marcas) {
    if (m.z !== 0) {
      brutos.push({ a: m.y, b: m.x, z: m.z });
      continue;
    }
    let melhor = -1;
    let menor = Infinity;
    textos.forEach((t, i) => {
      if (usados.has(i)) return;
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < menor && d <= t.alcance) {
        menor = d;
        melhor = i;
      }
    });
    if (melhor < 0) {
      semTexto++;
      continue;
    }
    usados.add(melhor);
    brutos.push({ a: m.y, b: m.x, z: textos[melhor].valor });
  }
  return { brutos, semTexto };
}

function lerDxfPontos(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[]; unidade: 'M' | 'MM' | null } {
  const { entidades, insunits } = lerDxf(texto);
  const unidade: 'M' | 'MM' | null = insunits === 4 ? 'MM' : insunits === 6 ? 'M' : insunits === 5 ? 'MM' : null;
  const marcas = entidades.filter((e) => e.tipo === 'POINT' || e.tipo === 'CIRCLE').map((e) => ({ x: e.x, y: e.y, z: e.z }));
  const textos = entidades
    .filter((e) => (e.tipo === 'TEXT' || e.tipo === 'MTEXT') && e.texto)
    .map((e) => ({ x: e.x, y: e.y, valor: numeroNoTexto(e.texto!), alcance: Math.max(3, (e.altura ?? 1) * 6) }))
    .filter((t): t is { x: number; y: number; valor: number; alcance: number } => t.valor !== null);
  const avisos: string[] = [];
  const { brutos, semTexto } = emparelharMarcasComTextos(marcas, textos);
  if (semTexto > 0) avisos.push(`${semTexto} marca(s) sem cota em Z e sem texto numérico por perto foram ignoradas.`);
  if (marcas.length === 0) avisos.push('O DXF não tem POINT nem CIRCLE — nada para importar (blocos INSERT não são lidos).');
  return { brutos, ignoradas: semTexto, avisos, unidade };
}

function atributo(tag: string, nome: string): number | null {
  const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`, 'i')) ?? tag.match(new RegExp(`\\b${nome}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? numeroFlexivel(m[1].replace(/px|pt|mm|cm/i, '')) : null;
}

function lerSvgPontos(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[]; alturaSvg: number } {
  const avisos: string[] = [];
  const viewBox = texto.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  const alturaAttr = atributo(texto.match(/<svg[^>]*>/i)?.[0] ?? '', 'height');
  const alturaSvg = viewBox && viewBox.length === 4 ? viewBox[1] + viewBox[3] : (alturaAttr ?? 0);
  if (/transform\s*=/.test(texto)) avisos.push('O SVG tem transform em algum elemento; as coordenadas são lidas como escritas (sem aplicar transform).');
  const marcas: { x: number; y: number; z: number }[] = [];
  for (const tag of texto.match(/<circle\b[^>]*>/gi) ?? []) {
    const cx = atributo(tag, 'cx');
    const cy = atributo(tag, 'cy');
    if (cx !== null && cy !== null) marcas.push({ x: cx, y: cy, z: 0 });
  }
  for (const tag of texto.match(/<ellipse\b[^>]*>/gi) ?? []) {
    const cx = atributo(tag, 'cx');
    const cy = atributo(tag, 'cy');
    if (cx !== null && cy !== null) marcas.push({ x: cx, y: cy, z: 0 });
  }
  for (const tag of texto.match(/<rect\b[^>]*>/gi) ?? []) {
    const x = atributo(tag, 'x');
    const y = atributo(tag, 'y');
    const w = atributo(tag, 'width') ?? 0;
    const h = atributo(tag, 'height') ?? 0;
    if (x !== null && y !== null && w > 0 && w <= 20 && h > 0 && h <= 20) marcas.push({ x: x + w / 2, y: y + h / 2, z: 0 });
  }
  const textos: { x: number; y: number; valor: number; alcance: number }[] = [];
  for (const m of texto.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const x = atributo(m[1], 'x');
    const y = atributo(m[1], 'y');
    const conteudo = m[2].replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, ' ');
    const valor = numeroNoTexto(conteudo);
    if (x !== null && y !== null && valor !== null) {
      const tamanho = atributo(m[1], 'font-size') ?? 12;
      textos.push({ x, y, valor, alcance: Math.max(30, tamanho * 4) });
    }
  }
  const { brutos, semTexto } = emparelharMarcasComTextos(marcas, textos);
  if (semTexto > 0) avisos.push(`${semTexto} marca(s) sem texto numérico por perto foram ignoradas.`);
  if (marcas.length === 0) avisos.push('O SVG não tem <circle>, <ellipse> nem marca pequena <rect> — nada para importar.');
  return { brutos, ignoradas: semTexto, avisos, alturaSvg };
}

// ── Ordem, unidade e ancoragem ────────────────────────────────────────────

function pareceUtm(brutos: Bruto[]): { sim: boolean; norteEmA: boolean } {
  if (brutos.length === 0) return { sim: false, norteEmA: true };
  const med = (xs: number[]) => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  const a = Math.abs(med(brutos.map((b) => b.a)));
  const b = Math.abs(med(brutos.map((b) => b.b)));
  const ehNorte = (v: number) => v >= 1_000_000 && v <= 10_000_000;
  const ehEste = (v: number) => v >= 100_000 && v <= 900_000;
  if (ehNorte(a) && ehEste(b)) return { sim: true, norteEmA: true };
  if (ehNorte(b) && ehEste(a)) return { sim: true, norteEmA: false };
  return { sim: false, norteEmA: true };
}

function centro(ps: { x: number; y: number }[]): Point {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * O importador. `formato` decide o leitor; as opções resolvem o que o arquivo
 * não diz (ordem N/E, unidade, onde cai no desenho, escala do SVG).
 */
export function importarPontos(
  texto: string,
  formato: FormatoDeImportacao,
  ctx: ContextoDaImportacao,
  opcoes: OpcoesDeImportacao = {},
): ResultadoDaImportacao {
  const avisos: string[] = [];
  let brutos: Bruto[] = [];
  let ignoradas = 0;
  let separador: string | undefined;
  let cabecalho: boolean | undefined;
  let ordem: 'NEZ' | 'ENZ' | 'GEO' = 'NEZ';
  let unidade: ResultadoDaImportacao['detectado']['unidade'] = 'M';
  let alturaSvg = 0;
  let unidadeDoDxf: 'M' | 'MM' | null = null;
  const ordemPedida = opcoes.ordem ?? 'AUTO';
  const unidadePedida = opcoes.unidade ?? 'AUTO';

  if (formato === 'TEXTO') {
    const l = lerTexto(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    separador = l.separador === '\t' ? 'tab' : l.separador === ' ' ? 'espaço' : l.separador;
    cabecalho = l.cabecalho;
    if (l.geo) ordem = 'GEO';
    else if (l.ordemPeloCabecalho) ordem = l.ordemPeloCabecalho;
    else if (ordemPedida !== 'AUTO') ordem = ordemPedida;
    else {
      const utm = pareceUtm(brutos);
      ordem = utm.sim ? (utm.norteEmA ? 'NEZ' : 'ENZ') : 'NEZ';
      if (!utm.sim && brutos.length > 0) avisos.push('Sem cabeçalho: as colunas foram lidas como P, N, E, Z (PNEZD). Se o arquivo é P, E, N, Z, troque a ordem.');
    }
  } else if (formato === 'GEOJSON') {
    const l = lerGeoJson(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    ordem = 'GEO';
  } else if (formato === 'KML') {
    const l = lerKml(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    ordem = 'GEO';
    if (ignoradas > 0) avisos.push(`${ignoradas} Placemark(s) sem Point ou sem altitude foram ignorados.`);
  } else if (formato === 'DXF') {
    const l = lerDxfPontos(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    unidadeDoDxf = l.unidade;
    ordem = 'NEZ'; // as marcas saem como a = y (N), b = x (E)
  } else {
    const l = lerSvgPontos(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    alturaSvg = l.alturaSvg;
    ordem = 'NEZ';
  }

  // Em (E, N) metros (ou graus quando GEO), já na ordem certa.
  let pontosEN: { e: number; n: number; z: number; nome?: string; codigo?: string }[] = brutos.map((b) =>
    ordem === 'ENZ' ? { e: b.a, n: b.b, z: b.z, nome: b.nome, codigo: b.codigo } : { e: b.b, n: b.a, z: b.z, nome: b.nome, codigo: b.codigo },
  );

  let ancoragem: ResultadoDaImportacao['detectado']['ancoragem'] = 'DIRETO';
  let zonaUtm: number | undefined;
  let pontos: PontoImportado[] = [];

  if (formato === 'SVG') {
    unidade = 'SVG';
    const escala = opcoes.escalaSvgMmPorUnidade && opcoes.escalaSvgMmPorUnidade > 0 ? opcoes.escalaSvgMmPorUnidade : 1000;
    // Y do SVG cresce para baixo: inverte pela altura da caixa.
    pontos = pontosEN.map((p) => ({ x: p.e * escala, y: (alturaSvg - p.n) * escala, cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    if (alturaSvg === 0) avisos.push('SVG sem viewBox/height: o Y foi invertido em torno de zero.');
  } else if (ordem === 'GEO') {
    unidade = 'GEO';
    if (!ctx.georreferencia) {
      throw new Error('Pontos em latitude/longitude precisam da georreferência do lote ("Onde fica") para cair no desenho.');
    }
    const geo = ctx.georreferencia;
    ancoragem = 'GEORREFERENCIA';
    pontos = pontosEN.map((p) => ({ ...geoParaLocal({ lat: p.n, lon: p.e }, geo), cotaM: p.z, nome: p.nome, codigo: p.codigo }));
  } else {
    const utm = unidadePedida === 'UTM' || (unidadePedida === 'AUTO' && pareceUtm(brutos).sim);
    if (utm) {
      unidade = 'UTM';
      if (!ctx.georreferencia && !(opcoes.zonaUtm && opcoes.hemisferio)) {
        throw new Error('Coordenadas UTM precisam da georreferência do lote ("Onde fica") ou da zona e do hemisfério.');
      }
      const zona = opcoes.zonaUtm ?? zonaUtmDe(ctx.georreferencia!.longitude);
      const hemi = opcoes.hemisferio ?? (ctx.georreferencia!.latitude < 0 ? 'S' : 'N');
      zonaUtm = zona;
      if (!ctx.georreferencia) {
        throw new Error('Sem a georreferência do lote não há como levar UTM para o desenho.');
      }
      const geo = ctx.georreferencia;
      ancoragem = 'GEORREFERENCIA';
      pontos = pontosEN.map((p) => ({ ...geoParaLocal(utmParaLatLon(p.e, p.n, zona, hemi), geo), cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    } else {
      const maior = Math.max(0, ...pontosEN.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n))));
      // Coordenada local em metros raramente passa de alguns milhares (a
      // origem do topógrafo costuma ser 1000,1000); em mm do desenho um lote
      // urbano já passa de 5000. UTM foi tratado antes.
      const emMm = unidadePedida === 'MM' || (unidadePedida === 'AUTO' && (unidadeDoDxf === 'MM' || (unidadeDoDxf === null && maior > 5000)));
      unidade = emMm ? 'MM' : 'M';
      const fator = emMm ? 1 : 1000;
      pontos = pontosEN.map((p) => ({ x: p.e * fator, y: p.n * fator, cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    }
  }

  // Ancoragem para o que não veio pela georreferência.
  if (ancoragem !== 'GEORREFERENCIA' && pontos.length > 0) {
    const pedida = opcoes.ancoragem ?? 'AUTO';
    let escolha: 'DIRETO' | 'CENTRO_DO_LOTE' = 'DIRETO';
    if (pedida === 'CENTRO_DO_LOTE') escolha = 'CENTRO_DO_LOTE';
    else if (pedida === 'DIRETO' || pedida === 'GEORREFERENCIA') escolha = 'DIRETO';
    else if (ctx.anel && ctx.anel.length >= 3) {
      const dentro = pontos.filter((p) => pointInPolygon(ctx.anel!, p)).length;
      if (dentro < Math.max(1, Math.ceil(pontos.length * 0.3))) {
        escolha = 'CENTRO_DO_LOTE';
        avisos.push('Os pontos não caem sobre o lote como estão: o centro do conjunto foi levado ao centro do lote. Se as coordenadas já são as do desenho, escolha "Direto".');
      }
    }
    if (escolha === 'CENTRO_DO_LOTE' && ctx.anel && ctx.anel.length >= 3) {
      const cp = centro(pontos);
      const cl = centro(ctx.anel);
      const dx = cl.x - cp.x;
      const dy = cl.y - cp.y;
      pontos = pontos.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
    ancoragem = escolha;
  }

  pontos = pontos.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
  const dentroDoLote = ctx.anel && ctx.anel.length >= 3 ? pontos.filter((p) => pointInPolygon(ctx.anel!, p)).length : pontos.length;
  if (pontos.length > 0 && dentroDoLote === 0) avisos.push('Nenhum ponto cai dentro do lote: confira ordem N/E, unidade e ancoragem.');
  if (pontos.length > 0 && pontos.length < 3) avisos.push('Menos de três pontos: a triangulação precisa de pelo menos três, não alinhados.');
  if (pontos.length === 0 && ignoradas === 0) avisos.push('Nenhum ponto reconhecido no arquivo.');

  return {
    formato,
    pontos,
    detectado: { separador, cabecalho, ordem, unidade, ancoragem, zonaUtm, linhasLidas: brutos.length, linhasIgnoradas: ignoradas },
    dentroDoLote,
    avisos,
  };
}
