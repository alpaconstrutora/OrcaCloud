/**
 * COBERTURA DO SOLO — ESA WorldCover 10 m (v200, 2021), lida por partes (25/11/2026).
 *
 * Para as ÁRVORES da Maquete (o reel da Hektar; decisão do usuário: "OSM + satélite"). O WorldCover
 * classifica o mundo inteiro em pixels de ~10 m (classe 10 = cobertura arbórea), publicado no AWS
 * Open Data como COG, licença CC BY 4.0 (uso comercial com atribuição).
 *
 * Medido em 25/11/2026: o bucket responde `Range` (206), SEM `Access-Control-Allow-Origin` — como o
 * Copernicus, só pela Edge Function `cobertura-do-solo`. Cabeçalho de `…_S24W048_Map.tif`: 36000 ×
 * 36000, uint8, Deflate, sem preditor, blocos de 1024² — o que `ArquivoCog` já decodifica.
 *
 * ─── GEOMETRIA ──────────────────────────────────────────────────────────────
 *
 * Quadrícula de 3° nomeada pelo canto SUDOESTE (`floor(lat/3)·3`, `floor(lon/3)·3`): Campinas
 * (−22,9; −47,06) cai em `S24W048`. Pixel de ÁREA de 1/12000° (3°/36000); o afim do cabeçalho leva
 * o CANTO do pixel. A grade devolvida é alinhada à grade GLOBAL do WorldCover — o mesmo pixel, sem
 * reamostrar — e a linha 0 é a do NORTE.
 *
 * Puro: `lerFaixa` injetado (Edge Function em Deno, Vitest com arquivo sintético).
 */
import { ArquivoCog, type LerFaixa } from './cog';
import { TiffNaoSuportado } from './tiff';

export const URL_WORLDCOVER = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map';
export const ATRIBUICAO_WORLDCOVER = 'ESA WorldCover 2021 (CC BY 4.0)';
/** Pixels por grau: 36000 pixels em 3°. */
export const PIXELS_POR_GRAU = 12_000;
export const PASSO_GRAUS = 1 / PIXELS_POR_GRAU;
/** Classes do WorldCover usadas aqui. */
export const CLASSE_ARVORE = 10;
/** Teto da caixa pedida (km²): um terreno de 2 × 2 km — mais que isso não é maquete de lote. */
export const AREA_MAXIMA_KM2 = 4;

export interface CaixaGeografica {
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

/** A grade de classes: `classes[linha * colunas + coluna]`, linha 0 = norte; 0 = sem dado. */
export interface GradeDeCobertura {
  /** Longitude do canto OESTE da coluna 0 e latitude do canto NORTE da linha 0 (graus). */
  oeste: number;
  norte: number;
  passoGraus: number;
  colunas: number;
  linhas: number;
  classes: Uint8Array;
}

/** O que a Edge Function `cobertura-do-solo` devolve: a grade, com as classes em base64. */
export interface RespostaDaCobertura {
  oeste: number;
  norte: number;
  passoGraus: number;
  colunas: number;
  linhas: number;
  classes: string;
}

/** A resposta da function → grade. Tamanho que não fecha com colunas × linhas → erro. */
export function gradeDaResposta(r: RespostaDaCobertura): GradeDeCobertura {
  const bin = atob(r.classes);
  const classes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) classes[i] = bin.charCodeAt(i);
  if (classes.length !== r.colunas * r.linhas) throw new Error('grade de cobertura com tamanho errado');
  return { oeste: r.oeste, norte: r.norte, passoGraus: r.passoGraus, colunas: r.colunas, linhas: r.linhas, classes };
}

/** O inverso, para a function (Deno tem `btoa`): uint8 → base64, em fatias (o `apply` tem teto de argumentos). */
export function classesEmBase64(classes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < classes.length; i += 0x8000) s += String.fromCharCode(...classes.subarray(i, i + 0x8000));
  return btoa(s);
}

const dois = (n: number) => String(Math.abs(n)).padStart(2, '0');
const tres = (n: number) => String(Math.abs(n)).padStart(3, '0');

export function quadriculaWorldCover(lat: number, lon: number): { latSul: number; lonOeste: number } {
  return { latSul: Math.floor(lat / 3) * 3, lonOeste: Math.floor(lon / 3) * 3 };
}

/** `ESA_WorldCover_10m_2021_v200_S24W048_Map` para o canto (−24, −48). */
export function nomeWorldCover(latSul: number, lonOeste: number): string {
  const ns = latSul < 0 ? `S${dois(latSul)}` : `N${dois(latSul)}`;
  const ew = lonOeste < 0 ? `W${tres(lonOeste)}` : `E${tres(lonOeste)}`;
  return `ESA_WorldCover_10m_2021_v200_${ns}${ew}_Map`;
}

export function urlWorldCover(latSul: number, lonOeste: number): string {
  return `${URL_WORLDCOVER}/${nomeWorldCover(latSul, lonOeste)}.tif`;
}

/** Área aproximada da caixa (km²), para a recusa de caixa grande demais. */
export function areaDaCaixaKm2(c: CaixaGeografica): number {
  const latMedia = ((c.sul + c.norte) / 2) * (Math.PI / 180);
  const alturaKm = (c.norte - c.sul) * 111.32;
  const larguraKm = (c.leste - c.oeste) * 111.32 * Math.cos(latMedia);
  return Math.abs(alturaKm * larguraKm);
}

export function caixaValida(c: unknown): c is CaixaGeografica {
  if (!c || typeof c !== 'object') return false;
  const { sul, oeste, norte, leste } = c as Record<string, unknown>;
  const n = [sul, oeste, norte, leste];
  if (!n.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  const k = c as CaixaGeografica;
  return k.sul < k.norte && k.oeste < k.leste && k.sul >= -90 && k.norte <= 90 && k.oeste >= -180 && k.leste <= 180;
}

/**
 * As classes do WorldCover dentro da caixa, na grade global do produto. Quadrícula inexistente
 * (mar aberto) e nodata → 0. Caixa maior que `AREA_MAXIMA_KM2` → erro (quem chama devolve 400).
 */
export async function coberturaNaCaixa(
  caixa: CaixaGeografica,
  lerFaixa: LerFaixa,
  arquivos: Map<string, ArquivoCog> = new Map(),
  urlDaQuadricula: (latSul: number, lonOeste: number) => string = urlWorldCover,
): Promise<GradeDeCobertura> {
  if (!caixaValida(caixa)) throw new RangeError('Caixa geográfica inválida.');
  if (areaDaCaixaKm2(caixa) > AREA_MAXIMA_KM2) throw new RangeError(`Área maior que ${AREA_MAXIMA_KM2} km².`);
  // Alinhada à grade global: coluna/linha global = floor(grau × 12000).
  const c0 = Math.floor(caixa.oeste * PIXELS_POR_GRAU);
  const c1 = Math.ceil(caixa.leste * PIXELS_POR_GRAU);
  const l0 = Math.ceil(caixa.norte * PIXELS_POR_GRAU); // a borda norte, em "linhas de latitude" crescentes para o norte
  const l1 = Math.floor(caixa.sul * PIXELS_POR_GRAU);
  const colunas = c1 - c0;
  const linhas = l0 - l1;
  const classes = new Uint8Array(colunas * linhas);

  const arquivo = (latSul: number, lonOeste: number) => {
    const chave = `${latSul}|${lonOeste}`;
    let a = arquivos.get(chave);
    if (!a) {
      a = new ArquivoCog(urlDaQuadricula(latSul, lonOeste), lerFaixa);
      arquivos.set(chave, a);
    }
    return a;
  };

  for (let r = 0; r < linhas; r++) {
    const lat = (l0 - r - 0.5) / PIXELS_POR_GRAU; // centro do pixel
    for (let k = 0; k < colunas; k++) {
      const lon = (c0 + k + 0.5) / PIXELS_POR_GRAU;
      const { latSul, lonOeste } = quadriculaWorldCover(lat, lon);
      const a = arquivo(latSul, lonOeste);
      const cab = await a.cabecalho();
      if (!cab) continue; // quadrícula inexistente (mar): fica 0
      const g = cab.geo;
      if (!g || g.afim[1] !== 0 || g.afim[3] !== 0) throw new TiffNaoSuportado('WorldCover sem georreferência de grade alinhada.');
      const [pa, , cx, , pe, f] = g.afim;
      const i = Math.floor((lon - cx) / pa);
      const j = Math.floor((lat - f) / pe);
      const v = await a.valor(i, j);
      classes[r * colunas + k] = v === null ? 0 : v;
    }
  }
  return { oeste: c0 / PIXELS_POR_GRAU, norte: l0 / PIXELS_POR_GRAU, passoGraus: PASSO_GRAUS, colunas, linhas, classes };
}
