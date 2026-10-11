/**
 * COG lido por partes (11/10/2026) — a fonte Copernicus GLO-30 da topografia.
 *
 * Dois oráculos, nenhum deles o próprio leitor:
 *  - COG SINTÉTICO com cota ANALÍTICA, linear no índice global do pixel: a
 *    bilinear de uma função linear é exata, então o valor esperado em qualquer
 *    ponto — inclusive na divisa entre dois arquivos — sai da conta, não do
 *    leitor. O escritor daqui é mínimo (sem compressão): a decodificação de
 *    Deflate/preditor é a do `tiff.ts`, coberta pelo fixture do PIL abaixo e
 *    pela prova com o arquivo real (`docs/spikes/topografia/medir-copernicus.mjs`).
 *  - O GeoTIFF do PIL (`dem_f32_deflate_31983.tif`) lido por FAIXAS tem de dar
 *    o mesmo que o `lerTiff` lendo o arquivo inteiro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AmostradorCog, ArquivoCog, nomeCopernicus, quadriculaDe, urlCopernicus, type LerFaixa } from '../utils/geo/cog';
import { lerTiff } from '../utils/geo/tiff';

// ── Escritor mínimo de GeoTIFF em blocos, float32, sem compressão ──────────

interface Sintetico {
  largura: number;
  altura: number;
  bloco: number;
  /** Centro do pixel (0,0) — PixelIsPoint, como o Copernicus. */
  lon0: number;
  lat0: number;
  passo: number;
  valor: (i: number, j: number) => number;
}

function escreverCog(s: Sintetico): Uint8Array {
  const bx = Math.ceil(s.largura / s.bloco);
  const by = Math.ceil(s.altura / s.bloco);
  const nBlocos = bx * by;
  const bytesBloco = s.bloco * s.bloco * 4;
  type Tag = { tag: number; tipo: 3 | 4 | 12; vals: number[] };
  const tags: Tag[] = [
    { tag: 256, tipo: 4, vals: [s.largura] },
    { tag: 257, tipo: 4, vals: [s.altura] },
    { tag: 258, tipo: 3, vals: [32] },
    { tag: 259, tipo: 3, vals: [1] },
    { tag: 262, tipo: 3, vals: [1] },
    { tag: 277, tipo: 3, vals: [1] },
    { tag: 284, tipo: 3, vals: [1] },
    { tag: 322, tipo: 3, vals: [s.bloco] },
    { tag: 323, tipo: 3, vals: [s.bloco] },
    { tag: 324, tipo: 4, vals: new Array(nBlocos).fill(0) },
    { tag: 325, tipo: 4, vals: new Array(nBlocos).fill(bytesBloco) },
    { tag: 339, tipo: 3, vals: [3] },
    { tag: 33550, tipo: 12, vals: [s.passo, s.passo, 0] },
    { tag: 33922, tipo: 12, vals: [0, 0, 0, s.lon0, s.lat0, 0] },
    // GeoKeyDirectory: modelo geográfico (1024=2), PixelIsPoint (1025=2), WGS 84 (2048=4326).
    { tag: 34735, tipo: 3, vals: [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 2, 2048, 0, 1, 4326] },
  ];
  const tam = { 3: 2, 4: 4, 12: 8 } as const;
  const ifd = 8;
  let dados = ifd + 2 + tags.length * 12 + 4;
  const posDados = tags.map((t) => {
    const n = t.vals.length * tam[t.tipo];
    if (n <= 4) return -1;
    const p = dados;
    dados += n + (n % 2);
    return p;
  });
  const inicioBlocos = dados;
  tags.find((t) => t.tag === 324)!.vals = Array.from({ length: nBlocos }, (_, k) => inicioBlocos + k * bytesBloco);
  const b = new Uint8Array(inicioBlocos + nBlocos * bytesBloco);
  const v = new DataView(b.buffer);
  b[0] = 0x49;
  b[1] = 0x49;
  v.setUint16(2, 42, true);
  v.setUint32(4, ifd, true);
  v.setUint16(ifd, tags.length, true);
  const escreve = (o: number, tipo: 3 | 4 | 12, x: number) =>
    tipo === 3 ? v.setUint16(o, x, true) : tipo === 4 ? v.setUint32(o, x, true) : v.setFloat64(o, x, true);
  tags.forEach((t, i) => {
    const o = ifd + 2 + i * 12;
    v.setUint16(o, t.tag, true);
    v.setUint16(o + 2, t.tipo, true);
    v.setUint32(o + 4, t.vals.length, true);
    const base = posDados[i] === -1 ? o + 8 : posDados[i];
    if (posDados[i] !== -1) v.setUint32(o + 8, posDados[i], true);
    t.vals.forEach((x, k) => escreve(base + k * tam[t.tipo], t.tipo, x));
  });
  for (let k = 0; k < nBlocos; k++) {
    const x0 = (k % bx) * s.bloco;
    const y0 = Math.floor(k / bx) * s.bloco;
    for (let l = 0; l < s.bloco; l++)
      for (let c = 0; c < s.bloco; c++) {
        const i = x0 + c;
        const j = y0 + l;
        const z = i < s.largura && j < s.altura ? s.valor(i, j) : 0;
        v.setFloat32(inicioBlocos + k * bytesBloco + (l * s.bloco + c) * 4, z, true);
      }
  }
  return b;
}

/** Servidor falso: `url → bytes`; conta os pedidos. Arquivo ausente = 404 (`null`). */
function servidor(arquivos: Record<string, Uint8Array>) {
  const pedidos: { url: string; inicio: number; fim: number }[] = [];
  const lerFaixa: LerFaixa = async (url, inicio, fim) => {
    pedidos.push({ url, inicio, fim });
    const b = arquivos[url];
    return b ? b.subarray(inicio, Math.min(fim + 1, b.length)) : null;
  };
  return { lerFaixa, pedidos };
}

// Quadrículas de 1° com 100 × 100 pixels (passo 0,01°) e blocos de 32 — 100
// não é múltiplo de 32, então o último bloco de cada linha é parcial.
const N = 100;
const PASSO = 1 / N;
/** Cota linear no índice GLOBAL (coluna a partir de −47°, linha a partir de −22°). */
const cotaGlobal = (I: number, J: number) => 800 + 0.5 * I + 2 * J;
const quadricula = (latSul: number, lonOeste: number) => {
  const offI = (lonOeste + 47) * N;
  const offJ = (-22 - (latSul + 1)) * N;
  return escreverCog({
    largura: N,
    altura: N,
    bloco: 32,
    lon0: lonOeste,
    lat0: latSul + 1,
    passo: PASSO,
    valor: (i, j) => cotaGlobal(offI + i, offJ + j),
  });
};
/** Índice global FRACIONÁRIO de um ponto (entre centros de pixel). */
const esperado = (lat: number, lon: number) => cotaGlobal((lon + 47) / PASSO, (-22 - lat) / PASSO);

describe('nome e quadrícula do Copernicus GLO-30', () => {
  it('nome pelo canto, nos quatro quadrantes', () => {
    expect(nomeCopernicus(-23, -47)).toBe('Copernicus_DSM_COG_10_S23_00_W047_00_DEM');
    expect(nomeCopernicus(48, 16)).toBe('Copernicus_DSM_COG_10_N48_00_E016_00_DEM');
    expect(nomeCopernicus(-1, 0)).toBe('Copernicus_DSM_COG_10_S01_00_E000_00_DEM');
    expect(nomeCopernicus(0, -1)).toBe('Copernicus_DSM_COG_10_N00_00_W001_00_DEM');
    expect(urlCopernicus(-23, -47)).toBe(
      'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S23_00_W047_00_DEM/Copernicus_DSM_COG_10_S23_00_W047_00_DEM.tif',
    );
  });

  it('o terreno do pedido (−22,6153; −46,0426) cai no S23 W047 — o arquivo medido em 11/10', () => {
    expect(quadriculaDe(-22.6153, -46.0426)).toEqual({ latSul: -23, lonOeste: -47 });
  });

  it('a linha exata do grau é do arquivo do SUL (o tiepoint é o grau do norte)', () => {
    expect(quadriculaDe(-22, -46.5)).toEqual({ latSul: -23, lonOeste: -47 });
    expect(quadriculaDe(-21.9999, -46.5)).toEqual({ latSul: -22, lonOeste: -47 });
    expect(quadriculaDe(-22.5, -46)).toEqual({ latSul: -23, lonOeste: -46 });
  });
});

describe('AmostradorCog — bilinear sobre o COG sintético', () => {
  const arquivos = {
    [urlCopernicus(-23, -47)]: quadricula(-23, -47),
    [urlCopernicus(-23, -46)]: quadricula(-23, -46),
    [urlCopernicus(-24, -47)]: quadricula(-24, -47),
    [urlCopernicus(-24, -46)]: quadricula(-24, -46),
  };

  it('no meio de um arquivo, a cota é a da função linear (exata)', async () => {
    const { lerFaixa } = servidor(arquivos);
    const a = new AmostradorCog(lerFaixa);
    for (const [lat, lon] of [
      [-22.3337, -46.505],
      [-22.6153, -46.0426],
      [-22.01, -46.99],
      [-22.5, -46.5],
    ]) {
      expect(await a.cota({ lat, lon })).toBeCloseTo(esperado(lat, lon), 3);
    }
  });

  it('na divisa leste-oeste, metade de cada arquivo', async () => {
    const { lerFaixa } = servidor(arquivos);
    const a = new AmostradorCog(lerFaixa);
    // Entre o último centro do W047 (−46,01) e o primeiro do W046 (−46,00).
    expect(await a.cota({ lat: -22.5, lon: -46.005 })).toBeCloseTo(esperado(-22.5, -46.005), 3);
    expect(await a.cota({ lat: -22.5, lon: -46.0001 })).toBeCloseTo(esperado(-22.5, -46.0001), 3);
  });

  it('na divisa norte-sul e no canto de quatro arquivos', async () => {
    const { lerFaixa } = servidor(arquivos);
    const a = new AmostradorCog(lerFaixa);
    expect(await a.cota({ lat: -22.995, lon: -46.5 })).toBeCloseTo(esperado(-22.995, -46.5), 3);
    expect(await a.cota({ lat: -22.995, lon: -46.005 })).toBeCloseTo(esperado(-22.995, -46.005), 3);
    // Na linha exata do grau: o centro da linha 0 do S24.
    expect(await a.cota({ lat: -23, lon: -46.5 })).toBeCloseTo(esperado(-23, -46.5), 3);
  });

  it('arquivo vizinho inexistente (mar) → null, nunca zero', async () => {
    const { lerFaixa } = servidor({ [urlCopernicus(-23, -47)]: quadricula(-23, -47) });
    const a = new AmostradorCog(lerFaixa);
    expect(await a.cota({ lat: -22.5, lon: -46.005 })).toBeNull();
    expect(await a.cota({ lat: -22.5, lon: -45.5 })).toBeNull();
    expect(await a.cota({ lat: -22.5, lon: -46.5 })).toBeCloseTo(esperado(-22.5, -46.5), 3);
  });

  it('coordenada inválida → null', async () => {
    const a = new AmostradorCog(servidor(arquivos).lerFaixa);
    expect(await a.cotas([{ lat: Number.NaN, lon: 0 }, { lat: 91, lon: 0 }])).toEqual([null, null]);
  });

  it('cabeçalho uma vez e cada bloco uma vez, mesmo em chamadas separadas', async () => {
    const { lerFaixa, pedidos } = servidor(arquivos);
    const a = new AmostradorCog(lerFaixa);
    const pts = Array.from({ length: 50 }, (_, k) => ({ lat: -22.40 - k * 0.0005, lon: -46.40 - k * 0.0005 }));
    await a.cotas(pts);
    const primeiro = pedidos.length;
    await a.cotas(pts);
    expect(pedidos.length).toBe(primeiro);
    // 1 cabeçalho + os blocos tocados (os 50 pontos ficam num só bloco de 32 px).
    expect(pedidos.filter((p) => p.inicio === 0)).toHaveLength(1);
    expect(primeiro).toBe(2);
  });

  it('cabeçalho maior que o trecho inicial: pede de novo, dobrando', async () => {
    const { lerFaixa, pedidos } = servidor(arquivos);
    const a = new AmostradorCog(lerFaixa, urlCopernicus, 16);
    expect(await a.cota({ lat: -22.5, lon: -46.5 })).toBeCloseTo(esperado(-22.5, -46.5), 3);
    expect(pedidos.filter((p) => p.inicio === 0).length).toBeGreaterThan(1);
  });
});

describe('ArquivoCog — o GeoTIFF do PIL lido por faixas', () => {
  it('cada pixel igual ao lerTiff do arquivo inteiro', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/geo/dem_f32_deflate_31983.tif')));
    const inteiro = await lerTiff(bytes);
    const { lerFaixa, pedidos } = servidor({ pil: bytes });
    const arq = new ArquivoCog('pil', lerFaixa, 256);
    const amostra = [
      [0, 0],
      [inteiro.largura - 1, 0],
      [0, inteiro.altura - 1],
      [inteiro.largura - 1, inteiro.altura - 1],
      [Math.floor(inteiro.largura / 2), Math.floor(inteiro.altura / 3)],
    ];
    for (const [i, j] of amostra) {
      expect(await arq.valor(i, j)).toBeCloseTo(inteiro.amostras[j * inteiro.largura + i], 4);
    }
    expect(await arq.valor(-1, 0)).toBeNull();
    expect(await arq.valor(0, inteiro.altura)).toBeNull();
    // Nenhum pedido baixou o arquivo inteiro de uma vez.
    expect(pedidos.every((p) => p.fim - p.inicio + 1 < bytes.length || p.inicio === 0)).toBe(true);
  });
});
