/**
 * A3 — GeoTIFF, world file, ortofoto e DEM.
 *
 * Os TIFFs de `__tests__/fixtures/geo/` foram escritos pelo PIL (Python), um
 * escritor INDEPENDENTE deste leitor — ver o gerador registrado no plano. O
 * conteúdo de cada pixel é uma fórmula conhecida, então o teste confere valor
 * a valor e não "parece uma imagem".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { descomprimirLzw, lerTiff, TiffNaoSuportado } from '../utils/geo/tiff';
import {
  crsDoEpsg,
  crsDoWkt,
  crsParaPixel,
  encaixarOrtofoto,
  janelaDoRaster,
  lerWorldFile,
  localParaCrs,
  pixelParaCrs,
  pixelParaLocal,
  pontosDoDem,
  rasterNoMundo,
  rgbaDaJanela,
} from '../utils/geo/raster';
import { projetadoParaGeo } from '../utils/geo/projecao';
import { pixelParaModelo } from '../utils/blueprintUnderlay';

const fixture = (nome: string) => readFileSync(path.join(__dirname, 'fixtures', 'geo', nome));
const E0 = 611000;
const N0 = 7797000;

/** A georreferência do lote no ponto (E0 + dE, N0 − dN) do UTM 23S SIRGAS. */
function georreferenciaEm(dE: number, dN: number) {
  const ll = projetadoParaGeo({ este: E0 + dE, norte: N0 - dN }, crsDoEpsg(31983)!).valor;
  return { latitude: ll.lat, longitude: ll.lon, elevacaoM: 0 };
}

describe('lerTiff', () => {
  it('RGB 8 bits LZW: cada pixel é (col, lin, col+lin) e a georreferência é a do arquivo', async () => {
    const t = await lerTiff(fixture('orto_rgb_lzw_31983.tif'));
    expect([t.largura, t.altura, t.amostrasPorPixel, t.bitsPorAmostra]).toEqual([200, 100, 3, 8]);
    for (const [c, l] of [
      [0, 0],
      [199, 0],
      [0, 99],
      [137, 42],
      [199, 99],
    ]) {
      const i = (l * 200 + c) * 3;
      expect([t.amostras[i], t.amostras[i + 1], t.amostras[i + 2]]).toEqual([c % 256, l % 256, (c + l) % 256]);
    }
    expect(t.geo?.epsg).toBe(31983);
    expect(t.geo?.modelo).toBe(1);
    expect(t.geo?.afim).toEqual([0.5, 0, E0, 0, -0.5, N0]);
  });

  it('DEM float32 Deflate: z = 800 + 0,01·col + 0,02·lin, com NODATA', async () => {
    const t = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    expect([t.largura, t.altura, t.formatoDaAmostra, t.bitsPorAmostra]).toEqual([50, 40, 3, 32]);
    expect(t.nodata).toBe(-9999);
    expect(t.amostras[7 * 50 + 5]).toBe(-9999);
    for (const [c, l] of [
      [0, 0],
      [49, 39],
      [20, 10],
    ]) {
      expect(t.amostras[l * 50 + c]).toBeCloseTo(800 + 0.01 * c + 0.02 * l, 3);
    }
  });

  it('cinza 16 bits PackBits com PixelIsPoint: a afim é levada ao CANTO do pixel', async () => {
    const t = await lerTiff(fixture('cinza_u16_packbits_32723_ponto.tif'));
    expect(t.amostras[5 * 30 + 7]).toBe(7 * 100 + 5);
    expect(t.geo?.pixelEhPonto).toBe(true);
    expect(t.geo?.epsg).toBe(32723);
    // Escala 2 m: o centro do pixel (0,0) está em (E0, N0) → o canto está 1 m a oeste e 1 m ao norte.
    expect(t.geo?.afim).toEqual([2, 0, E0 - 1, 0, -2, N0 + 1]);
  });

  it('sem georreferência lê a imagem e rasterNoMundo DIZ o que falta', async () => {
    const t = await lerTiff(fixture('rgb_sem_geo.tif'));
    expect(t.geo).toBeNull();
    expect(() => rasterNoMundo(t)).toThrow(/não tem georreferência.*world file/);
  });

  it('recusas nomeadas: não-TIFF, BigTIFF', async () => {
    await expect(lerTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow(TiffNaoSuportado);
    const big = new Uint8Array(16);
    big.set([0x49, 0x49, 43, 0]);
    await expect(lerTiff(big)).rejects.toThrow(/BigTIFF/);
  });

  it('LZW: o exemplo da especificação (TIFF 6.0, seção 13) volta ao original', () => {
    // "7-7-7-8-8-7-7-6-6" — codificado à mão pelo algoritmo da especificação:
    // Clear(256) 7 258(7,7) 8 8 258 6 6 EOI, em 9 bits MSB-first.
    const codigos = [256, 7, 258, 8, 8, 258, 6, 6, 257];
    let bits = '';
    for (const c of codigos) bits += c.toString(2).padStart(9, '0');
    while (bits.length % 8) bits += '0';
    const bytes = Uint8Array.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
    expect([...descomprimirLzw(bytes, 9)]).toEqual([7, 7, 7, 8, 8, 7, 7, 6, 6]);
  });
});

describe('CRS do raster', () => {
  it('EPSG do catálogo, WGS 84 / UTM e Web Mercator só de leitura', () => {
    expect(crsDoEpsg(31983)?.nome).toBe('SIRGAS 2000 / UTM 23S');
    expect(crsDoEpsg(32723)?.nome).toBe('WGS 84 / UTM 23S');
    expect(crsDoEpsg(3857)?.codigo).toBe('EPSG:3857');
    expect(crsDoEpsg(2193)).toBeNull();
  });

  it('WKT do ESRI e do OGC', () => {
    expect(crsDoWkt('PROJCS["SIRGAS_2000_UTM_Zone_23S",GEOGCS["GCS_SIRGAS_2000"]]')?.codigo).toBe('EPSG:31983');
    expect(crsDoWkt('PROJCS["WGS 84 / UTM zone 24S",GEOGCS["WGS 84"],AUTHORITY["EPSG","32724"]]')?.codigo).toBe('EPSG:32724');
    expect(crsDoWkt('PROJCS["SAD69 / UTM zone 22S",GEOGCS["SAD69",DATUM["South_American_Datum_1969"]]]')?.codigo).toBe('EPSG:29192');
    expect(crsDoWkt('GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000"]]')?.codigo).toBe('EPSG:4674');
    expect(crsDoWkt('PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere"]')?.codigo).toBe('EPSG:3857');
    expect(crsDoWkt('PROJCS["Lambert qualquer"]')).toBeNull();
  });

  it('world file: centro do pixel → canto; inversa exata', () => {
    const afim = lerWorldFile('0.5\n0\n0\n-0.5\n611000.25\n7796999.75\n');
    expect(afim).toEqual([0.5, 0, 611000, 0, -0.5, 7797000]);
    const r = { afim, crs: crsDoEpsg(31983)!, largura: 10, altura: 10 };
    const q = pixelParaCrs(r, 3.5, 7.25);
    expect(crsParaPixel(r, q.x, q.y).col).toBeCloseTo(3.5, 9);
    expect(crsParaPixel(r, q.x, q.y).lin).toBeCloseTo(7.25, 9);
    expect(() => lerWorldFile('1\n2\n3')).toThrow(/seis números/);
  });
});

describe('ortofoto → planta de fundo, sem aferir', () => {
  it('o lote no meio da imagem: a janela recorta, o encaixe erra menos de 1 pixel, e o pixel conhecido cai no ponto do desenho', async () => {
    const t = await lerTiff(fixture('orto_rgb_lzw_31983.tif'));
    const r = rasterNoMundo(t);
    // Lote de 20 × 10 m cuja origem do desenho está em (E0 + 50, N0 − 25) — pixel (100, 50).
    const geo = georreferenciaEm(50, 25);
    const anel = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: 10_000 },
      { x: 0, y: 10_000 },
    ];
    const janela = janelaDoRaster(r, geo, anel, 5000)!;
    expect(janela).toBeTruthy();
    expect(janela.largura).toBeLessThan(200);
    const e = encaixarOrtofoto(r, geo, janela);
    expect(e.residuoPx).toBeLessThan(1);
    expect(e.pixelM).toBeCloseTo(0.5, 2);
    // A origem do desenho (0,0) corresponde ao canto do pixel (100, 50) do arquivo.
    const p = pixelParaModelo(e.underlay, { px: 100 - janela.col0, py: 50 - janela.lin0 });
    expect(Math.hypot(p.x, p.y)).toBeLessThan(e.underlay.mmPorPixel); // < 1 pixel
    // E a cadeia exata concorda.
    const exato = pixelParaLocal(r, geo, 100, 50);
    expect(Math.hypot(exato.x, exato.y)).toBeLessThan(5); // mm
    // O RGBA da janela é o pixel do arquivo.
    const rgba = rgbaDaJanela(t, janela);
    const k = ((50 - janela.lin0) * janela.largura + (100 - janela.col0)) * 4;
    expect([rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]]).toEqual([100, 50, 150, 255]);
  });

  it('lote fora da imagem: janela nula', async () => {
    const t = await lerTiff(fixture('orto_rgb_lzw_31983.tif'));
    const r = rasterNoMundo(t);
    const geo = georreferenciaEm(5000, 5000);
    expect(janelaDoRaster(r, geo, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], 0)).toBeNull();
  });
});

describe('DEM → pontos cotados', () => {
  it('um ponto por pixel no centro, cota do arquivo, NODATA fora e contado', async () => {
    const t = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    const r = rasterNoMundo(t);
    const geo = georreferenciaEm(10, 10);
    const anel = [
      { x: 0, y: 0 },
      { x: 20_000, y: 0 },
      { x: 20_000, y: -15_000 },
      { x: 0, y: -15_000 },
    ];
    const d = pontosDoDem(t, r, geo, anel, 3000);
    expect(d.resolucaoM).toBeCloseTo(1, 2);
    expect(d.passo).toBe(1);
    expect(d.pontos.length).toBeGreaterThan(300);
    const amostra = d.pontos[Math.floor(d.pontos.length / 2)];
    // Volta do desenho ao pixel do arquivo e confere a fórmula.
    const c = localParaCrs(r, geo, amostra);
    const px = crsParaPixel(r, c.x, c.y);
    const col = Math.floor(px.col);
    const lin = Math.floor(px.lin);
    expect(px.col - col).toBeCloseTo(0.5, 2);
    expect(amostra.cotaM).toBeCloseTo(800 + 0.01 * col + 0.02 * lin, 3);
    expect(d.avisos, d.avisos.join(' | ')).toEqual([]);
  });

  it('NODATA dentro da janela é contado e avisado', async () => {
    const t = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    const r = rasterNoMundo(t);
    const geo = georreferenciaEm(0, 0);
    const d = pontosDoDem(t, r, geo, [{ x: 0, y: 0 }, { x: 50_000, y: 0 }, { x: 50_000, y: -40_000 }, { x: 0, y: -40_000 }], 0);
    expect(d.semValor).toBe(1);
    expect(d.avisos.join(' ')).toMatch(/1 pixels sem valor/);
    expect(d.pontos).toHaveLength(50 * 40 - 1);
  });

  it('imagem colorida não é DEM: recusa dizendo o que fazer', async () => {
    const t = await lerTiff(fixture('orto_rgb_lzw_31983.tif'));
    expect(() => pontosDoDem(t, rasterNoMundo(t), georreferenciaEm(0, 0), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toThrow(/3 bandas.*planta de fundo/);
  });
});
