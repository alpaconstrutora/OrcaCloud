/**
 * RASTER GEORREFERENCIADO (A3) — ortofoto e DEM caindo no lugar certo do lote,
 * sem aferição por dois cliques.
 *
 * A cadeia é sempre a mesma:
 *
 *   pixel (col, lin) ──afim──▶ coordenada do arquivo (E/N ou lon/lat, no CRS dele)
 *                    ──proj4──▶ latitude/longitude SIRGAS 2000
 *                    ──geoParaLocal──▶ mm do desenho (a georreferência do lote)
 *
 * A ORTOFOTO vira uma planta de fundo comum (`Underlay`: origem, escala e giro),
 * com o resíduo nos cantos DITO em pixels — é a prova de que o encaixe de
 * semelhança basta (a convergência meridiana gira a imagem uma fração de grau,
 * e a semelhança absorve isso).
 *
 * O DEM vira PONTOS COTADOS (um por pixel dentro do lote e da margem, com
 * teto): entra na mesma TIN e no mesmo gerador de curvas do levantamento, e a
 * classe da versão diz de onde veio (≤ 1 m = levantamento importado; acima =
 * preliminar, como o DEM remoto).
 *
 * Puro, exceto `pngDoRaster` (canvas), que mora no fim e só roda no navegador.
 */
import type { Georreferencia, Point } from '../blueprintKernel';
import { geoParaLocal, localParaGeo } from '../blueprintTopografia';
import type { PontoDeLevantamento } from '../blueprintFeicoes';
import { CATALOGO_DE_CRS, SIRGAS2000_GEO, WGS84_GEO, type DefinicaoDeCrs } from './crs';
import { converter } from './projecao';
import type { GeoDoTiff, Tiff } from './tiff';
import { pixelParaModelo, type Underlay } from '../blueprintUnderlay';

export type Afim = [number, number, number, number, number, number];

// ── CRS de LEITURA ───────────────────────────────────────────────────────────

/**
 * Sistemas que um raster costuma trazer e o catálogo da tela não oferece
 * (porque ninguém deve ESCOLHER desenhar neles): WGS 84 / UTM sul e o Web
 * Mercator das exportações de mapa. Só para ler.
 */
function utmWgs84(zona: number): DefinicaoDeCrs {
  return {
    codigo: `EPSG:${32700 + zona}`,
    nome: `WGS 84 / UTM ${zona}S`,
    tipo: 'PROJETADO',
    datum: 'WGS84',
    zona,
    hemisferio: 'S',
    proj4: `+proj=utm +zone=${zona} +south +datum=WGS84 +units=m +no_defs`,
  };
}
const WEB_MERCATOR: DefinicaoDeCrs = {
  codigo: 'EPSG:3857',
  nome: 'WGS 84 / Pseudo-Mercator (Web Mercator)',
  tipo: 'PROJETADO',
  datum: 'WGS84',
  proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
};
const DE_LEITURA: DefinicaoDeCrs[] = [...CATALOGO_DE_CRS, WGS84_GEO, WEB_MERCATOR, ...[18, 19, 20, 21, 22, 23, 24, 25].map(utmWgs84)];

export function crsDoEpsg(epsg: number | null | undefined): DefinicaoDeCrs | null {
  if (!epsg) return null;
  return DE_LEITURA.find((c) => c.codigo === `EPSG:${epsg}`) ?? null;
}

/**
 * O CRS de um `.prj` (WKT do ESRI ou do OGC): procura o EPSG explícito
 * (`AUTHORITY["EPSG","31983"]`) e, sem ele, o datum e o fuso pelo nome
 * ("SIRGAS_2000_UTM_Zone_23S", "WGS 84 / UTM zone 23S", "Web_Mercator").
 */
export function crsDoWkt(wkt: string | null | undefined): DefinicaoDeCrs | null {
  if (!wkt) return null;
  const t = wkt.replace(/\s+/g, ' ');
  const autoridades = [...t.matchAll(/AUTHORITY\["EPSG",\s*"?(\d+)"?\]/gi)].map((m) => Number(m[1]));
  // O último AUTHORITY do WKT OGC é o do sistema inteiro (os de dentro são datum, unidade…).
  for (const e of autoridades.reverse()) {
    const c = crsDoEpsg(e);
    if (c) return c;
  }
  const n = t.toUpperCase();
  if (/MERCATOR_AUXILIARY_SPHERE|PSEUDO.MERCATOR|WEB_MERCATOR/.test(n)) return WEB_MERCATOR;
  const zona = n.match(/UTM[ _]?ZONE[ _]?(\d{2})\s*S|UTM[ _](\d{2})S/);
  const z = zona ? Number(zona[1] ?? zona[2]) : null;
  const sirgas = /SIRGAS/.test(n);
  const sad = /SAD[ _]?69|SOUTH_AMERICAN_1969/.test(n);
  const wgs = /WGS[ _]?(19)?84/.test(n);
  if (z) {
    const codigo = sirgas ? 31960 + z : sad ? 29170 + z : wgs ? 32700 + z : null;
    return codigo ? crsDoEpsg(codigo) : null;
  }
  if (/^GEOGCS/.test(n.trim())) return sirgas ? SIRGAS2000_GEO : wgs ? WGS84_GEO : null;
  return null;
}

// ── World file ───────────────────────────────────────────────────────────────

/**
 * `.tfw`/`.jgw`/`.pgw`: seis linhas A, D, B, E, C, F com (C, F) no CENTRO do
 * pixel superior esquerdo. Devolve a afim com o pixel (0,0) no CANTO, como a do GeoTIFF.
 */
export function lerWorldFile(texto: string): Afim {
  const v = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => Number(l.replace(',', '.')));
  if (v.length < 6 || v.some((x) => !Number.isFinite(x))) throw new Error('World file inválido: são seis números, um por linha.');
  const [A, D, B, E, C, F] = v;
  return [A, B, C - (A + B) / 2, D, E, F - (D + E) / 2];
}

// ── Pixel ↔ desenho ──────────────────────────────────────────────────────────

export interface RasterNoMundo {
  afim: Afim;
  crs: DefinicaoDeCrs;
  largura: number;
  altura: number;
}

/** De um GeoTIFF, com o CRS resolvido (ou o que a pessoa escolheu quando o arquivo não diz). */
export function rasterNoMundo(tiff: Tiff, crsPedido?: DefinicaoDeCrs | null): RasterNoMundo {
  const geo: GeoDoTiff | null = tiff.geo;
  if (!geo) throw new Error('O TIFF não tem georreferência (sem ModelTiepoint/ModelPixelScale). Use um GeoTIFF, ou a imagem com o world file (.tfw).');
  const crs = crsPedido ?? crsDoEpsg(geo.epsg) ?? crsDoWkt(geo.citacao);
  if (!crs) {
    throw new Error(
      `O sistema de coordenadas do arquivo (EPSG ${geo.epsg ?? 'não informado'}${geo.citacao ? `, "${geo.citacao}"` : ''}) não está entre os que a Planta lê: SIRGAS 2000 / SAD 69 / Córrego Alegre / WGS 84 (UTM ou lat/long) e Web Mercator. Reprojete para SIRGAS 2000 / UTM.`,
    );
  }
  return { afim: geo.afim, crs, largura: tiff.largura, altura: tiff.altura };
}

export function pixelParaCrs(r: RasterNoMundo, col: number, lin: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = r.afim;
  return { x: a * col + b * lin + c, y: d * col + e * lin + f };
}

export function crsParaPixel(r: RasterNoMundo, x: number, y: number): { col: number; lin: number } {
  const [a, b, c, d, e, f] = r.afim;
  const det = a * e - b * d;
  const dx = x - c;
  const dy = y - f;
  return { col: (e * dx - b * dy) / det, lin: (-d * dx + a * dy) / det };
}

/** Coordenada do arquivo → mm do desenho, pela georreferência do lote. */
export function crsParaLocal(r: RasterNoMundo, geo: Georreferencia, x: number, y: number): Point {
  // Projetado ou geográfico, a porta é a mesma: o `converter` devolve (lon, lat).
  const ll = converter(r.crs, SIRGAS2000_GEO, x, y).valor;
  return geoParaLocal({ lat: ll.y, lon: ll.x }, geo);
}

export function localParaCrs(r: RasterNoMundo, geo: Georreferencia, p: Point): { x: number; y: number } {
  const ll = localParaGeo(p, geo);
  return converter(SIRGAS2000_GEO, r.crs, ll.lon, ll.lat).valor;
}

export function pixelParaLocal(r: RasterNoMundo, geo: Georreferencia, col: number, lin: number): Point {
  const q = pixelParaCrs(r, col, lin);
  return crsParaLocal(r, geo, q.x, q.y);
}

// ── Recorte ──────────────────────────────────────────────────────────────────

export interface Janela {
  col0: number;
  lin0: number;
  largura: number;
  altura: number;
}

/** A janela de pixels que cobre um retângulo do desenho (mm) com margem, cortada à imagem. `null` = não se tocam. */
export function janelaDoRaster(r: RasterNoMundo, geo: Georreferencia, anel: Point[], margemMm: number): Janela | null {
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const cantos: Point[] = [
    { x: Math.min(...xs) - margemMm, y: Math.min(...ys) - margemMm },
    { x: Math.max(...xs) + margemMm, y: Math.min(...ys) - margemMm },
    { x: Math.max(...xs) + margemMm, y: Math.max(...ys) + margemMm },
    { x: Math.min(...xs) - margemMm, y: Math.max(...ys) + margemMm },
  ];
  const px = cantos.map((c) => {
    const q = localParaCrs(r, geo, c);
    return crsParaPixel(r, q.x, q.y);
  });
  const col0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p.col))));
  const lin0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p.lin))));
  const col1 = Math.min(r.largura, Math.ceil(Math.max(...px.map((p) => p.col))));
  const lin1 = Math.min(r.altura, Math.ceil(Math.max(...px.map((p) => p.lin))));
  if (col1 <= col0 || lin1 <= lin0) return null;
  return { col0, lin0, largura: col1 - col0, altura: lin1 - lin0 };
}

// ── Ortofoto → planta de fundo ───────────────────────────────────────────────

export interface EncaixeDaOrtofoto {
  underlay: Underlay;
  /** O maior desvio entre a semelhança e a cadeia exata, nos cantos e no centro da janela, em PIXELS. */
  residuoPx: number;
  /** Tamanho do pixel no chão, em m. */
  pixelM: number;
  /** |escala X / escala Y − 1|: pixel não quadrado. */
  anisotropia: number;
  avisos: string[];
}

/**
 * A planta de fundo de uma janela da ortofoto: o pixel (0,0) da JANELA cai
 * onde a cadeia exata manda, a escala e o giro vêm dos cantos. O resíduo mede
 * quanto a semelhança erra — a meta é menos de um pixel.
 */
export function encaixarOrtofoto(r: RasterNoMundo, geo: Georreferencia, janela: Janela): EncaixeDaOrtofoto {
  const L = (c: number, l: number) => pixelParaLocal(r, geo, janela.col0 + c, janela.lin0 + l);
  const p00 = L(0, 0);
  const pW0 = L(janela.largura, 0);
  const p0H = L(0, janela.altura);
  const sx = Math.hypot(pW0.x - p00.x, pW0.y - p00.y) / janela.largura;
  const sy = Math.hypot(p0H.x - p00.x, p0H.y - p00.y) / janela.altura;
  const t = Math.atan2(pW0.y - p00.y, pW0.x - p00.x);
  const underlay: Underlay = { origemXMm: p00.x, origemYMm: p00.y, mmPorPixel: (sx + sy) / 2, rotacaoMrad: t * 1000 };
  let residuo = 0;
  for (const [c, l] of [
    [0, 0],
    [janela.largura, 0],
    [0, janela.altura],
    [janela.largura, janela.altura],
    [janela.largura / 2, janela.altura / 2],
  ]) {
    const exato = L(c, l);
    const aprox = pixelParaModelo(underlay, { px: c, py: l });
    residuo = Math.max(residuo, Math.hypot(exato.x - aprox.x, exato.y - aprox.y) / underlay.mmPorPixel);
  }
  const anisotropia = Math.abs(sx / sy - 1);
  const avisos: string[] = [];
  if (anisotropia > 0.002) avisos.push(`O pixel não é quadrado (${(sx / 1000).toFixed(3)} × ${(sy / 1000).toFixed(3)} m): a planta de fundo usa a média, e o desvio chega a ${(anisotropia * 100).toFixed(1)} % na borda.`);
  if (residuo > 1) avisos.push(`O encaixe desvia até ${residuo.toFixed(1)} pixel da posição exata nos cantos — recorte uma área menor ou reprojete para o UTM do lote.`);
  return { underlay, residuoPx: residuo, pixelM: underlay.mmPorPixel / 1000, anisotropia, avisos };
}

/** RGBA de uma janela: RGB(A) de 8 bits, cinza de 8/16 bits (esticado) ou paleta. */
export function rgbaDaJanela(tiff: Tiff, janela: Janela): Uint8ClampedArray {
  const { largura: W } = tiff;
  const spp = tiff.amostrasPorPixel;
  const saida = new Uint8ClampedArray(janela.largura * janela.altura * 4);
  const a = tiff.amostras;
  let min = 0;
  let max = 255;
  if (tiff.bitsPorAmostra !== 8 && tiff.fotometrica !== 3) {
    // Estica pelo mínimo/máximo da janela (ortofoto de 16 bits, DEM exibido).
    min = Infinity;
    max = -Infinity;
    for (let l = 0; l < janela.altura; l++) {
      for (let c = 0; c < janela.largura; c++) {
        const v = Number(a[((janela.lin0 + l) * W + janela.col0 + c) * spp]);
        if (!Number.isFinite(v) || v === tiff.nodata) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!(max > min)) max = min + 1;
  }
  const esc = (v: number) => ((v - min) / (max - min)) * 255;
  const nPaleta = tiff.paleta ? tiff.paleta.length / 3 : 0;
  for (let l = 0; l < janela.altura; l++) {
    for (let c = 0; c < janela.largura; c++) {
      const i = ((janela.lin0 + l) * W + janela.col0 + c) * spp;
      const o = (l * janela.largura + c) * 4;
      if (tiff.fotometrica === 3 && tiff.paleta) {
        const k = Number(a[i]);
        saida[o] = tiff.paleta[k] >> 8;
        saida[o + 1] = tiff.paleta[nPaleta + k] >> 8;
        saida[o + 2] = tiff.paleta[2 * nPaleta + k] >> 8;
        saida[o + 3] = 255;
      } else if (spp >= 3) {
        saida[o] = esc(Number(a[i]));
        saida[o + 1] = esc(Number(a[i + 1]));
        saida[o + 2] = esc(Number(a[i + 2]));
        saida[o + 3] = spp >= 4 ? esc(Number(a[i + 3])) : 255;
      } else {
        const v = Number(a[i]);
        const g = tiff.fotometrica === 0 ? 255 - esc(v) : esc(v);
        saida[o] = saida[o + 1] = saida[o + 2] = g;
        saida[o + 3] = v === tiff.nodata || !Number.isFinite(v) ? 0 : spp === 2 ? esc(Number(a[i + 1])) : 255;
      }
    }
  }
  return saida;
}

// ── DEM → pontos cotados ─────────────────────────────────────────────────────

/**
 * DEM de até 1 m (com folga para o fator de escala do UTM, que faz o pixel de
 * 1 m da quadrícula medir 1,0004 m no chão) entra como LEVANTAMENTO; acima,
 * PRELIMINAR — a mesma régua do DEM remoto.
 */
export function demEhPreliminar(resolucaoM: number): boolean {
  return resolucaoM > 1.05;
}

/** Acima disso a TIN e o painel sofrem; o DEM é reamostrado de 2 em 2, 3 em 3… */
export const MAX_PONTOS_DO_DEM = 20_000;

export interface PontosDoDem {
  pontos: PontoDeLevantamento[];
  /** Tamanho do pixel no chão (m) e o passo usado (em pixels). */
  resolucaoM: number;
  passo: number;
  semValor: number;
  avisos: string[];
}

/**
 * Um ponto por pixel do DEM (a cada `passo`) dentro do lote + margem, na
 * posição do CENTRO do pixel, com a cota lida. NODATA e não finitos ficam de
 * fora — contados.
 */
export function pontosDoDem(tiff: Tiff, r: RasterNoMundo, geo: Georreferencia, anel: Point[] | null, margemMm = 10_000): PontosDoDem {
  if (tiff.amostrasPorPixel !== 1) {
    throw new Error(`O arquivo tem ${tiff.amostrasPorPixel} bandas: parece uma IMAGEM, não um modelo de elevação. Importe-o como planta de fundo (ortofoto).`);
  }
  // Sem lote ainda: o arquivo inteiro (com o teto de pontos) — é assim que a gleba nasce do DEM.
  const janela = anel && anel.length >= 3 ? janelaDoRaster(r, geo, anel, margemMm) : { col0: 0, lin0: 0, largura: tiff.largura, altura: tiff.altura };
  if (!janela) throw new Error('O DEM não cobre o lote: confira o sistema de coordenadas do arquivo e a georreferência do lote ("Onde fica").');
  const p0 = pixelParaLocal(r, geo, 0, 0);
  const p1 = pixelParaLocal(r, geo, 1, 0);
  const resolucaoM = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 1000;
  const passo = Math.max(1, Math.ceil(Math.sqrt((janela.largura * janela.altura) / MAX_PONTOS_DO_DEM)));
  const pontos: PontoDeLevantamento[] = [];
  let semValor = 0;
  for (let l = 0; l < janela.altura; l += passo) {
    for (let c = 0; c < janela.largura; c += passo) {
      const col = janela.col0 + c;
      const lin = janela.lin0 + l;
      const v = Number(tiff.amostras[lin * tiff.largura + col]);
      if (!Number.isFinite(v) || (tiff.nodata !== null && v === tiff.nodata) || v < -1000) {
        semValor++;
        continue;
      }
      const p = pixelParaLocal(r, geo, col + 0.5, lin + 0.5);
      pontos.push({ x: Math.round(p.x), y: Math.round(p.y), cotaM: Math.round(v * 1000) / 1000 });
    }
  }
  const avisos: string[] = [];
  if (passo > 1) avisos.push(`O DEM foi lido a cada ${passo} pixels (${(resolucaoM * passo).toFixed(1).replace('.', ',')} m) para não passar de ${MAX_PONTOS_DO_DEM.toLocaleString('pt-BR')} pontos.`);
  if (semValor > 0) avisos.push(`${semValor} pixels sem valor (NODATA) ficaram de fora.`);
  if (demEhPreliminar(resolucaoM)) avisos.push(`Resolução de ${resolucaoM.toFixed(1).replace('.', ',')} m: a versão sai como PRELIMINAR, como um DEM remoto — não substitui o levantamento.`);
  return { pontos, resolucaoM, passo, semValor, avisos };
}

// ── Navegador ────────────────────────────────────────────────────────────────

/** A janela em PNG (canvas). Só no navegador. */
export async function pngDoRaster(tiff: Tiff, janela: Janela): Promise<Blob> {
  const rgba = rgbaDaJanela(tiff, janela);
  const canvas = document.createElement('canvas');
  canvas.width = janela.largura;
  canvas.height = janela.altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não abriu um canvas para converter a ortofoto.');
  ctx.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, janela.largura, janela.altura), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('A conversão da ortofoto para PNG falhou.'))), 'image/png'));
}
