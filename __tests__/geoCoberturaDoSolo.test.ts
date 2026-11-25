/**
 * Cobertura do solo — ESA WorldCover 10 m lido por partes (25/11/2026), para as árvores da Maquete.
 *
 * Oráculo: um COG SINTÉTICO uint8 de pixel de ÁREA (como o WorldCover), pequeno e ancorado num ponto
 * de Campinas com o passo do produto (1/12000°). A classe de cada pixel sai de uma conta no índice
 * GLOBAL dele, então o esperado em qualquer célula da grade devolvida vem da conta, não do leitor.
 * A decodificação Deflate do arquivo real é a do `tiff.ts` (coberta em `geoCog.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import type { LerFaixa } from '../utils/geo/cog';
import {
  areaDaCaixaKm2,
  AREA_MAXIMA_KM2,
  caixaValida,
  CLASSE_ARVORE,
  classesEmBase64,
  coberturaNaCaixa,
  gradeDaResposta,
  nomeWorldCover,
  PIXELS_POR_GRAU,
  quadriculaWorldCover,
  urlWorldCover,
} from '../utils/geo/coberturaDoSolo';

/** Escritor mínimo de GeoTIFF em blocos, uint8, sem compressão, PixelIsArea. */
function escreverCogUint8(s: { largura: number; altura: number; bloco: number; lonOeste: number; latNorte: number; passo: number; valor: (i: number, j: number) => number }): Uint8Array {
  const bx = Math.ceil(s.largura / s.bloco);
  const by = Math.ceil(s.altura / s.bloco);
  const nBlocos = bx * by;
  const bytesBloco = s.bloco * s.bloco;
  type Tag = { tag: number; tipo: 3 | 4 | 12; vals: number[] };
  const tags: Tag[] = [
    { tag: 256, tipo: 4, vals: [s.largura] },
    { tag: 257, tipo: 4, vals: [s.altura] },
    { tag: 258, tipo: 3, vals: [8] },
    { tag: 259, tipo: 3, vals: [1] },
    { tag: 262, tipo: 3, vals: [1] },
    { tag: 277, tipo: 3, vals: [1] },
    { tag: 284, tipo: 3, vals: [1] },
    { tag: 322, tipo: 3, vals: [s.bloco] },
    { tag: 323, tipo: 3, vals: [s.bloco] },
    { tag: 324, tipo: 4, vals: new Array(nBlocos).fill(0) },
    { tag: 325, tipo: 4, vals: new Array(nBlocos).fill(bytesBloco) },
    { tag: 339, tipo: 3, vals: [1] },
    { tag: 33550, tipo: 12, vals: [s.passo, s.passo, 0] },
    // Tiepoint no CANTO noroeste do pixel (0,0) — PixelIsArea.
    { tag: 33922, tipo: 12, vals: [0, 0, 0, s.lonOeste, s.latNorte, 0] },
    // GeoKeyDirectory: modelo geográfico (1024=2), PixelIsArea (1025=1), WGS 84 (2048=4326).
    { tag: 34735, tipo: 3, vals: [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326] },
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
        b[inicioBlocos + k * bytesBloco + l * s.bloco + c] = i < s.largura && j < s.altura ? s.valor(i, j) : 0;
      }
  }
  return b;
}

// O arquivo sintético: 200 × 200 pixels a partir do canto NO (−47,07; −22,89), alinhado à grade global.
const COL0 = Math.round(-47.07 * PIXELS_POR_GRAU); // coluna global da coluna 0 do arquivo
const LIN0 = Math.round(-22.89 * PIXELS_POR_GRAU); // "linha de latitude" global da borda norte
/** Árvore nas colunas globais pares, pasto (30) nas ímpares; a última linha do arquivo é nodata (0). */
const classeGlobal = (colGlobal: number) => (colGlobal % 2 === 0 ? CLASSE_ARVORE : 30);
const ARQUIVO = escreverCogUint8({
  largura: 200,
  altura: 200,
  bloco: 64,
  lonOeste: COL0 / PIXELS_POR_GRAU,
  latNorte: LIN0 / PIXELS_POR_GRAU,
  passo: 1 / PIXELS_POR_GRAU,
  valor: (i, j) => (j === 199 ? 0 : classeGlobal(COL0 + i)),
});

function servidor() {
  const url = urlWorldCover(-24, -48);
  const pedidos: string[] = [];
  const lerFaixa: LerFaixa = async (u, inicio, fim) => {
    pedidos.push(u);
    return u === url ? ARQUIVO.subarray(inicio, Math.min(fim + 1, ARQUIVO.length)) : null;
  };
  return { lerFaixa, pedidos };
}

describe('resposta da function (base64)', () => {
  it('ida e volta: as classes chegam iguais, inclusive acima de 32 KB (fatias)', () => {
    const classes = Uint8Array.from({ length: 300 * 200 }, (_, i) => (i * 7) % 256);
    const g = gradeDaResposta({ oeste: -47, norte: -22, passoGraus: 1 / PIXELS_POR_GRAU, colunas: 300, linhas: 200, classes: classesEmBase64(classes) });
    expect(g.classes).toEqual(classes);
    expect(g.colunas).toBe(300);
  });
  it('tamanho que não fecha com colunas × linhas: erro', () => {
    expect(() => gradeDaResposta({ oeste: 0, norte: 0, passoGraus: 1, colunas: 3, linhas: 3, classes: classesEmBase64(new Uint8Array(8)) })).toThrow();
  });
});

describe('nome e quadrícula do WorldCover', () => {
  it('canto SUDOESTE de 3°: Campinas cai em S24W048', () => {
    expect(quadriculaWorldCover(-22.9, -47.06)).toEqual({ latSul: -24, lonOeste: -48 });
    expect(nomeWorldCover(-24, -48)).toBe('ESA_WorldCover_10m_2021_v200_S24W048_Map');
    expect(urlWorldCover(-24, -48)).toBe('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S24W048_Map.tif');
    expect(nomeWorldCover(3, 6)).toBe('ESA_WorldCover_10m_2021_v200_N03E006_Map');
  });
});

describe('caixa', () => {
  it('valida números, ordem e faixa', () => {
    expect(caixaValida({ sul: -22.91, oeste: -47.07, norte: -22.9, leste: -47.06 })).toBe(true);
    expect(caixaValida({ sul: -22.9, oeste: -47.07, norte: -22.91, leste: -47.06 })).toBe(false);
    expect(caixaValida({ sul: '1', oeste: 0, norte: 2, leste: 1 })).toBe(false);
    expect(caixaValida(null)).toBe(false);
  });

  it('área em km² (1 km ≈ 0,009°) e a recusa acima do teto', async () => {
    const umKm = { sul: -22.9, oeste: -47.06, norte: -22.9 + 1 / 111.32, leste: -47.06 + 1 / (111.32 * Math.cos((-22.9 * Math.PI) / 180)) };
    expect(areaDaCaixaKm2(umKm)).toBeCloseTo(1, 2);
    const grande = { sul: -22.95, oeste: -47.1, norte: -22.9, leste: -47.05 };
    expect(areaDaCaixaKm2(grande)).toBeGreaterThan(AREA_MAXIMA_KM2);
    await expect(coberturaNaCaixa(grande, servidor().lerFaixa)).rejects.toThrow(RangeError);
  });
});

describe('coberturaNaCaixa', () => {
  it('⚠️ PRONTO QUANDO: cada célula tem a classe do pixel GLOBAL dela (árvore = 10), linha 0 ao norte', async () => {
    // Uma caixa dentro do arquivo, longe das bordas.
    const caixa = { sul: -22.8995, oeste: -47.069, norte: -22.8965, leste: -47.066 };
    const g = await coberturaNaCaixa(caixa, servidor().lerFaixa);
    expect(g.colunas).toBe(Math.ceil(caixa.leste * PIXELS_POR_GRAU) - Math.floor(caixa.oeste * PIXELS_POR_GRAU));
    expect(g.oeste).toBeLessThanOrEqual(caixa.oeste);
    expect(g.norte).toBeGreaterThanOrEqual(caixa.norte);
    for (let r = 0; r < g.linhas; r++)
      for (let k = 0; k < g.colunas; k++) {
        const colGlobal = Math.round(g.oeste * PIXELS_POR_GRAU) + k;
        expect(g.classes[r * g.colunas + k]).toBe(classeGlobal(colGlobal));
      }
    expect([...g.classes].filter((c) => c === CLASSE_ARVORE).length).toBeGreaterThan(0);
  });

  it('nodata e fora do arquivo viram 0; o cabeçalho é lido uma vez para a caixa toda', async () => {
    // A última linha do arquivo (nodata) e um trecho ao sul dele (fora: o arquivo sintético é pequeno).
    const sulDoArquivo = (LIN0 - 200) / PIXELS_POR_GRAU;
    const caixa = { sul: sulDoArquivo - 0.0005, oeste: -47.069, norte: sulDoArquivo + 0.0003, leste: -47.068 };
    const s = servidor();
    const g = await coberturaNaCaixa(caixa, s.lerFaixa);
    const ultima = g.linhas - 1;
    expect([...g.classes.subarray(ultima * g.colunas)].every((c) => c === 0)).toBe(true);
    expect(g.classes.some((c) => c !== 0)).toBe(true);
    // Um pedido de cabeçalho + os blocos tocados; nunca um pedido por pixel.
    expect(s.pedidos.length).toBeLessThan(10);
  });

  it('quadrícula inexistente (mar): tudo 0, sem erro', async () => {
    const lerFaixa: LerFaixa = async () => null;
    const g = await coberturaNaCaixa({ sul: -22.8995, oeste: -47.069, norte: -22.8985, leste: -47.068 }, lerFaixa);
    expect(g.classes.every((c) => c === 0)).toBe(true);
  });
});
