/**
 * COG — GeoTIFF na nuvem lido por PARTES (11/10/2026).
 *
 * Para gerar curvas de nível sem ferramenta externa e sem custo, a cota vem do
 * Copernicus DEM GLO-30, publicado no AWS Open Data como COG: um arquivo por
 * grau (3600 × 3600 pixels de ~30 m), blocos de 1024 × 1024 em float32,
 * Deflate e preditor 3 — exatamente o que `tiff.ts` já decodifica. Um arquivo
 * tem ~40 MB; um terreno cai em um ou dois blocos de ~2,5 MB. Então: o
 * cabeçalho num pedido `Range`, depois só os blocos que os pontos tocam.
 *
 * Medido em 11/10/2026: o bucket responde `Range` (206) mas SEM
 * `Access-Control-Allow-Origin` — o navegador não lê direto. Este módulo é
 * puro (o `lerFaixa` é injetado) e roda na Edge Function `topografia-copernicus`
 * por bundle (`scripts/build-topografia-copernicus.mjs`), e no Vitest.
 *
 * ─── GEOMETRIA ──────────────────────────────────────────────────────────────
 *
 * O Copernicus é PixelIsPoint com o tiepoint na linha do grau: o arquivo
 * `S23_00_W047_00` tem o CENTRO do pixel (0,0) em (−47, −22) e cobre os centros
 * de −22 a −22,99972 e de −47 a −46,00028. O vizinho a leste começa em −46. A
 * interpolação é bilinear entre os quatro centros em volta do ponto; o centro
 * que cai fora do arquivo é lido no arquivo vizinho (decidido pelo ÍNDICE que
 * transbordou, não pela coordenada — na linha exata do grau, `floor` escolheria
 * o arquivo errado).
 *
 * Arquivo que não existe (oceano: o Copernicus não publica quadrícula só de
 * mar) → `null`. Qualquer canto sem cota → `null`: a curva para onde falta
 * dado, nunca desce a zero (CA-009).
 */
import { decodificarBloco, lerCabecalhoTiff, linhasDoBloco, TiffNaoSuportado, type CabecalhoTiff } from './tiff';

/** Lê os bytes [inicio, fim] (inclusivo) de `url`. `null` = o arquivo não existe (404). */
export type LerFaixa = (url: string, inicio: number, fim: number) => Promise<Uint8Array | null>;

export interface LatLonCog {
  lat: number;
  lon: number;
}

// ── Copernicus GLO-30 ───────────────────────────────────────────────────────

export const URL_COPERNICUS_GLO30 = 'https://copernicus-dem-30m.s3.amazonaws.com';

const dois = (n: number) => String(Math.abs(n)).padStart(2, '0');
const tres = (n: number) => String(Math.abs(n)).padStart(3, '0');

/**
 * Nome do arquivo pelo canto: `latSul` é a latitude do NOME (o grau inteiro ao
 * sul da faixa), `lonOeste` a longitude do canto oeste. Ex.: (−23, −47) →
 * `Copernicus_DSM_COG_10_S23_00_W047_00_DEM`.
 */
export function nomeCopernicus(latSul: number, lonOeste: number): string {
  const ns = latSul < 0 ? `S${dois(latSul)}` : `N${dois(latSul)}`;
  const ew = lonOeste < 0 ? `W${tres(lonOeste)}` : `E${tres(lonOeste)}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}

export function urlCopernicus(latSul: number, lonOeste: number): string {
  const nome = nomeCopernicus(latSul, lonOeste);
  return `${URL_COPERNICUS_GLO30}/${nome}/${nome}.tif`;
}

/**
 * A quadrícula que contém o CENTRO de pixel mais próximo de (lat, lon). O
 * arquivo começa no grau do norte (linha 0 = latitude inteira) e termina um
 * pixel antes do grau do sul: lat −22 exata é do S23, não do S22.
 */
export function quadriculaDe(lat: number, lon: number): { latSul: number; lonOeste: number } {
  return { latSul: Math.ceil(lat) - 1, lonOeste: Math.floor(lon) };
}

// ── Um arquivo ──────────────────────────────────────────────────────────────

const TRECHO_INICIAL = 64 * 1024;
const TRECHO_MAXIMO = 16 * 1024 * 1024;

/** Um COG, lido por partes: o cabeçalho uma vez, cada bloco uma vez (com cache). */
export class ArquivoCog {
  private cab: Promise<CabecalhoTiff | null> | null = null;
  private readonly blocos = new Map<number, Promise<Float32Array | Float64Array>>();

  constructor(
    readonly url: string,
    private readonly lerFaixa: LerFaixa,
    private readonly trechoInicial = TRECHO_INICIAL,
  ) {}

  /** `null` = o arquivo não existe. */
  cabecalho(): Promise<CabecalhoTiff | null> {
    if (!this.cab) {
      this.cab = this.lerCabecalho();
      // Falha de rede não pode ficar presa no cache: o próximo pedido tenta de novo.
      this.cab.catch(() => {
        this.cab = null;
      });
    }
    return this.cab;
  }

  private async lerCabecalho(): Promise<CabecalhoTiff | null> {
    // O IFD do COG fica no começo (é a definição de COG), mas o tamanho do
    // trecho com as tags não é sabido antes: dobra até caber.
    for (let n = this.trechoInicial; ; n *= 2) {
      const b = await this.lerFaixa(this.url, 0, n - 1);
      if (!b) return null;
      try {
        return lerCabecalhoTiff(b);
      } catch (e) {
        const curto = e instanceof RangeError;
        if (!curto || b.length < n || n >= TRECHO_MAXIMO) {
          if (curto) throw new TiffNaoSuportado(`O cabeçalho de ${this.url} não coube em ${b.length} bytes.`);
          throw e;
        }
      }
    }
  }

  /** Cota do pixel (coluna `i`, linha `j`). Fora do arquivo, nodata ou NaN → `null`. */
  async valor(i: number, j: number): Promise<number | null> {
    const c = await this.cabecalho();
    if (!c) return null;
    if (i < 0 || j < 0 || i >= c.largura || j >= c.altura) return null;
    const bx = Math.floor(i / c.larguraBloco);
    const by = Math.floor(j / c.alturaBloco);
    const k = c.emBlocos ? by * Math.ceil(c.largura / c.larguraBloco) + bx : by;
    const amostras = await this.bloco(c, k);
    const v = amostras[(j - by * c.alturaBloco) * c.larguraBloco + (i - bx * c.larguraBloco)];
    if (v === undefined || !Number.isFinite(v)) return null;
    if (c.nodata !== null && v === c.nodata) return null;
    return v;
  }

  private bloco(c: CabecalhoTiff, k: number): Promise<Float32Array | Float64Array> {
    let p = this.blocos.get(k);
    if (!p) {
      p = this.lerBloco(c, k);
      this.blocos.set(k, p);
      p.catch(() => this.blocos.delete(k));
    }
    return p;
  }

  private async lerBloco(c: CabecalhoTiff, k: number): Promise<Float32Array | Float64Array> {
    if (c.amostrasPorPixel !== 1) throw new TiffNaoSuportado('Modelo de elevação com mais de uma banda não é lido.');
    const inicio = c.offsets[k];
    const n = c.contagens[k] ?? 0;
    if (inicio === undefined || n <= 0) throw new TiffNaoSuportado(`Bloco ${k} ausente em ${this.url}.`);
    const bruto = await this.lerFaixa(this.url, inicio, inicio + n - 1);
    if (!bruto) throw new TiffNaoSuportado(`Bloco ${k} de ${this.url} não foi encontrado.`);
    const linhas = linhasDoBloco(c, k);
    const bytes = await decodificarBloco(c, bruto.subarray(0, n), linhas);
    const total = c.larguraBloco * linhas;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tam = c.bitsPorAmostra / 8;
    const saida = c.bitsPorAmostra === 64 ? new Float64Array(total) : new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const o = i * tam;
      saida[i] =
        c.formatoDaAmostra === 3
          ? tam === 4 ? v.getFloat32(o, c.le) : v.getFloat64(o, c.le)
          : tam === 2
            ? c.formatoDaAmostra === 2 ? v.getInt16(o, c.le) : v.getUint16(o, c.le)
            : tam === 4
              ? c.formatoDaAmostra === 2 ? v.getInt32(o, c.le) : v.getUint32(o, c.le)
              : c.formatoDaAmostra === 2 ? v.getInt8(o) : v.getUint8(o);
    }
    return saida;
  }
}

// ── Mosaico de quadrículas de 1° ────────────────────────────────────────────

/** Quantos arquivos ficam abertos: cada um guarda blocos decodificados (~4 MB). */
const MAX_ARQUIVOS_ABERTOS = 8;

/**
 * Cotas de um mosaico de COGs de 1° × 1° (Copernicus por padrão). Mantém os
 * arquivos abertos entre chamadas — a Edge Function reaproveita o mesmo
 * amostrador enquanto a instância vive, então a 2ª requisição do mesmo terreno
 * não baixa o bloco de novo.
 */
export class AmostradorCog {
  private readonly arquivos = new Map<string, ArquivoCog>();

  constructor(
    private readonly lerFaixa: LerFaixa,
    private readonly urlDaQuadricula: (latSul: number, lonOeste: number) => string = urlCopernicus,
    private readonly trechoInicial = TRECHO_INICIAL,
  ) {}

  private arquivo(latSul: number, lonOeste: number): ArquivoCog | null {
    if (latSul < -90 || latSul >= 90) return null;
    // Antimeridiano: a quadrícula a leste de 179 é a −180.
    const lon = lonOeste >= 180 ? lonOeste - 360 : lonOeste < -180 ? lonOeste + 360 : lonOeste;
    const chave = `${latSul}|${lon}`;
    let a = this.arquivos.get(chave);
    if (a) {
      // Recém-usado vai para o fim: o despejo tira o mais antigo.
      this.arquivos.delete(chave);
      this.arquivos.set(chave, a);
      return a;
    }
    a = new ArquivoCog(this.urlDaQuadricula(latSul, lon), this.lerFaixa, this.trechoInicial);
    this.arquivos.set(chave, a);
    while (this.arquivos.size > MAX_ARQUIVOS_ABERTOS) this.arquivos.delete(this.arquivos.keys().next().value!);
    return a;
  }

  /** Índice FRACIONÁRIO do ponto no arquivo, medido entre CENTROS de pixel. */
  private static indice(c: CabecalhoTiff, lat: number, lon: number): { u: number; v: number } | null {
    const g = c.geo;
    if (!g || g.afim[1] !== 0 || g.afim[3] !== 0) return null;
    const [a, , cx, , e, f] = g.afim;
    // afim leva o CANTO do pixel; o centro de (i, j) está em i + ½, j + ½.
    return { u: (lon - cx) / a - 0.5, v: (lat - f) / e - 0.5 };
  }

  /**
   * Cota do centro de pixel (i, j) do arquivo `q`. Índice que transborda vai ao
   * arquivo vizinho na direção do transbordo, e lá o índice é recalculado pela
   * coordenada do centro (a largura muda nas faixas de latitude alta).
   */
  private async centro(q: { latSul: number; lonOeste: number }, c: CabecalhoTiff, i: number, j: number): Promise<number | null> {
    const dLat = j < 0 ? 1 : j >= c.altura ? -1 : 0;
    const dLon = i < 0 ? -1 : i >= c.largura ? 1 : 0;
    const proprio = this.arquivo(q.latSul, q.lonOeste);
    if (!proprio) return null;
    if (dLat === 0 && dLon === 0) return proprio.valor(i, j);
    const [a, , cx, , e, f] = c.geo!.afim;
    const lonC = cx + a * (i + 0.5);
    const latC = f + e * (j + 0.5);
    const viz = this.arquivo(q.latSul + dLat, q.lonOeste + dLon);
    if (!viz) return null;
    const cv = await viz.cabecalho();
    if (!cv) return null;
    const ix = AmostradorCog.indice(cv, latC, lonC);
    if (!ix) return null;
    return viz.valor(Math.round(ix.u), Math.round(ix.v));
  }

  /** Cota bilinear em cada coordenada, na mesma ordem. */
  async cotas(coordenadas: LatLonCog[]): Promise<(number | null)[]> {
    return Promise.all(coordenadas.map((p) => this.cota(p)));
  }

  async cota(p: LatLonCog): Promise<number | null> {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
    const q = quadriculaDe(p.lat, p.lon);
    const arq = this.arquivo(q.latSul, q.lonOeste);
    if (!arq) return null;
    const c = await arq.cabecalho();
    if (!c) return null;
    const ix = AmostradorCog.indice(c, p.lat, p.lon);
    if (!ix) throw new TiffNaoSuportado(`${arq.url} não é um GeoTIFF norte-para-cima com georreferência.`);
    const i0 = Math.floor(ix.u);
    const j0 = Math.floor(ix.v);
    const fx = ix.u - i0;
    const fy = ix.v - j0;
    const [z00, z10, z01, z11] = await Promise.all([
      this.centro(q, c, i0, j0),
      this.centro(q, c, i0 + 1, j0),
      this.centro(q, c, i0, j0 + 1),
      this.centro(q, c, i0 + 1, j0 + 1),
    ]);
    if (z00 === null || z10 === null || z01 === null || z11 === null) return null;
    const topo = z00 + (z10 - z00) * fx;
    const base = z01 + (z11 - z01) * fx;
    return topo + (base - topo) * fy;
  }
}
