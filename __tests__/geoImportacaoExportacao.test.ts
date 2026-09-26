/**
 * A3 — shapefile/DEM entrando pelo importador de sempre, topografia saindo em
 * Shapefile, e a mancha de inundação.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importarPontos } from '../utils/blueprintTopografiaImportacao';
import { lerZipDeShapefiles, lerShp } from '../utils/geo/shapefile';
import { resultadoDoDem, textoDoShapefile } from '../utils/geo/importacaoGis';
import { camadasDaTopografia } from '../utils/geo/exportacaoGis';
import { crsDoEpsg, crsDoWkt } from '../utils/geo/raster';
import { lerTiff } from '../utils/geo/tiff';
import { converter, projetadoParaGeo } from '../utils/geo/projecao';
import { SIRGAS2000_GEO } from '../utils/geo/crs';
import { geoParaLocal } from '../utils/blueprintTopografia';
import { manchaDeInundacao } from '../utils/blueprintTopografiaAnalises';
import { fonteDeElevacao } from '../utils/blueprintElevacaoProvedores';

const fixture = (nome: string) => readFileSync(path.join(__dirname, 'fixtures', 'geo', nome));

/** Lote com origem do desenho em (611000, 7797000) do UTM 23S SIRGAS. */
const ll0 = projetadoParaGeo({ este: 611000, norte: 7797000 }, crsDoEpsg(31983)!).valor;
const GEO = { latitude: ll0.lat, longitude: ll0.lon, elevacaoM: 0 };

describe('shapefile → importador', () => {
  it('com .prj: vira GeoJSON; pontos com Z entram com nome e o polígono vira o contorno do lote, no lugar', async () => {
    const camadas = await lerZipDeShapefiles(fixture('pyshp_referencia.zip'));
    const t = textoDoShapefile(camadas);
    expect(t.formato).toBe('GEOJSON');
    expect(t.crs).toBe('EPSG:31983');
    const r = importarPontos(t.texto, 'GEOJSON', { anel: null, georreferencia: GEO });
    // 2 pontos + 3 vértices da curva com Z = 5 pontos cotados
    expect(r.pontos).toHaveLength(5);
    const poco = r.pontos.find((p) => p.nome === 'Poço')!;
    // (611010, 7797005) está 10 m a leste e 5 m ao norte NA QUADRÍCULA. No desenho (plano
    // do terreno, Y no norte VERDADEIRO) a distância muda pelo fator de escala (< 0,1 %) e a
    // direção gira pela convergência meridiana (~0,36° aqui) — não é igualdade de mm.
    const dist = Math.hypot(poco.x, poco.y);
    expect(Math.abs(dist - Math.hypot(10_000, 5000)) / Math.hypot(10_000, 5000)).toBeLessThan(0.001);
    const giro = (Math.atan2(poco.y, poco.x) - Math.atan2(5000, 10_000)) * (180 / Math.PI);
    expect(Math.abs(giro)).toBeLessThan(0.5);
    expect(Math.abs(giro)).toBeGreaterThan(0.2);
    expect(poco.cotaM).toBeCloseTo(801.5, 6);
    expect(r.contorno).toBeTruthy();
    expect(Math.abs(r.contorno!.areaM2 - 600) / 600).toBeLessThan(0.002);
  });

  it('sem .prj: CSV local em metros, e o polígono NÃO vira contorno — dito', async () => {
    const camadas = (await lerZipDeShapefiles(fixture('pyshp_referencia.zip'))).map((c) => ({ ...c, prj: null }));
    const t = textoDoShapefile(camadas);
    expect(t.formato).toBe('TEXTO');
    expect(t.avisos.join(' ')).toMatch(/não tem \.prj.*não vira contorno/);
    const r = importarPontos(t.texto, 'TEXTO', { anel: null, georreferencia: null }, { ancoragem: 'DIRETO', unidade: 'M' });
    expect(r.pontos).toHaveLength(5);
    expect(r.pontos.find((p) => p.nome === 'P1')!.x).toBeCloseTo(611000.5 * 1000, 0);
  });

  it('.prj de sistema fora do catálogo: recusa dizendo o que fazer', () => {
    expect(() => textoDoShapefile([{ nome: 'x', tipo: 'PONTO', prj: 'PROJCS["Lambert"]', feicoes: [] }])).toThrow(/Reprojete para SIRGAS 2000/);
  });
});

describe('DEM → resultado de importação', () => {
  it('DEM de 1 m entra como levantamento; a classe depende da resolução', async () => {
    const tiff = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    const d = resultadoDoDem(tiff, GEO, null);
    expect(d.preliminar).toBe(false);
    expect(d.resultado.pontos).toHaveLength(50 * 40 - 1);
    expect(d.resultado.detectado.linhasIgnoradas).toBe(1);
    expect(d.crs).toBe('EPSG:31983');
    // Um DEM "de 30 m" (a mesma grade com a escala trocada) sai PRELIMINAR.
    const grosso = { ...tiff, geo: { ...tiff.geo!, afim: [30, 0, 611000, 0, -30, 7797000] as [number, number, number, number, number, number] } };
    const g = resultadoDoDem(grosso, GEO, null);
    expect(g.preliminar).toBe(true);
    expect(g.resultado.avisos.join(' ')).toMatch(/PRELIMINAR/);
    expect(fonteDeElevacao('DEM_ARQUIVO').classe).toBe('PRELIMINAR_REMOTO');
    expect(fonteDeElevacao('DEM_ARQUIVO').tipo).toBe('LOCAL');
  });

  it('sem georreferência do lote: recusa dizendo onde informar', async () => {
    const tiff = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    expect(() => resultadoDoDem(tiff, null, null)).toThrow(/Onde fica/);
  });

  it('o DEM de um plano inclinado dá curvas iguais: cota no ponto = plano, ± 1 mm', async () => {
    // A grade do fixture é z = 800 + 0,01·col + 0,02·lin, com pixel de 1 m: um PLANO.
    const tiff = await lerTiff(fixture('dem_f32_deflate_31983.tif'));
    const d = resultadoDoDem(tiff, GEO, null);
    for (const p of d.resultado.pontos.filter((_, i) => i % 97 === 0)) {
      // de volta ao UTM: col = E − 611000 − 0,5 ; lin = 7797000 − N − 0,5
      const ll = { lat: 0, lon: 0 };
      void ll;
      const back = converter(SIRGAS2000_GEO, crsDoEpsg(31983)!, ...lonLat(p));
      const col = back.valor.x - 611000 - 0.5;
      const lin = 7797000 - back.valor.y - 0.5;
      expect(p.cotaM).toBeCloseTo(800 + 0.01 * col + 0.02 * lin, 2);
    }
  });
});

function lonLat(p: { x: number; y: number }): [number, number] {
  // o inverso de geoParaLocal para a georreferência GEO (sem rotação)
  const um = geoParaLocal({ lat: GEO.latitude + 0.001, lon: GEO.longitude + 0.001 }, GEO);
  return [GEO.longitude + (p.x / um.x) * 0.001, GEO.latitude + (p.y / um.y) * 0.001];
}

describe('topografia → Shapefile', () => {
  const t = {
    curvas: [{ cotaM: 800, mestra: true, pontos: [{ x: 0, y: 0 }, { x: 10_000, y: 5000 }] }],
    pontos: [{ x: 1000, y: 2000, cotaM: 800.5, nome: 'P1', codigo: 'CE1' }],
    anel: [{ x: 0, y: 0 }, { x: 30_000, y: 0 }, { x: 30_000, y: 20_000 }, { x: 0, y: 20_000 }],
    lotes: [{ quadra: 'A', numero: '1', areaM2: 300, pontos: [{ x: 0, y: 0 }, { x: 15_000, y: 0 }, { x: 15_000, y: 20_000 }, { x: 0, y: 20_000 }] }],
  };

  it('georreferenciado: SIRGAS 2000 / UTM do fuso, com .prj, e a origem cai em (611000, 7797000) ± 1 cm', () => {
    const { camadas, georreferenciado, crs } = camadasDaTopografia(t, GEO);
    expect(georreferenciado).toBe(true);
    expect(crs).toBe('EPSG:31983');
    expect(camadas.map((c) => c.nome)).toEqual(['curvas_de_nivel', 'pontos_cotados', 'lote', 'lotes']);
    expect(crsDoWkt(camadas[0].prj)?.codigo).toBe('EPSG:31983');
    const lote = camadas.find((c) => c.nome === 'lote')!;
    const v0 = lote.feicoes[0].partes[0][0];
    expect(v0.x).toBeCloseTo(611000, 1);
    expect(v0.y).toBeCloseTo(7797000, 1);
    expect(lote.feicoes[0].atributos.area_m2).toBeCloseTo(600, 6);
    expect(camadas.find((c) => c.nome === 'pontos_cotados')!.feicoes[0].partes[0][0].z).toBe(800.5);
  });

  it('sem georreferência: metros LOCAIS, sem .prj', () => {
    const { camadas, georreferenciado } = camadasDaTopografia(t, null);
    expect(georreferenciado).toBe(false);
    expect(camadas.every((c) => c.prj === null)).toBe(true);
    expect(camadas.find((c) => c.nome === 'pontos_cotados')!.feicoes[0].partes[0][0]).toEqual({ x: 1, y: 2, z: 800.5 });
    void lerShp;
  });
});

describe('mancha de inundação', () => {
  const grade = { origem: { x: 0, y: 0 }, espacamentoMm: 1000, colunas: 11, linhas: 11, cotasM: Array.from({ length: 121 }, (_, i) => 100 + (i % 11) * 0.1) };

  it('rampa de 1 m em 10 m: cheia a 100,5 alaga as 5 colunas mais baixas', () => {
    const m = manchaDeInundacao(grade, 100.5);
    // células com média < 100,5: colunas 0..4 (médias 100,05 … 100,45) × 10 linhas
    expect(m.areaM2).toBeCloseTo(50, 6);
    expect(m.laminaMaxM).toBeCloseTo(0.45, 6);
    expect(m.classeDaCelula.filter((c) => c === 0)).toHaveLength(50);
    expect(m.classeDaCelula[0]).toBe(0);
    expect(m.classeDaCelula[9]).toBeNull();
  });

  it('cheia abaixo de tudo: nada alaga; o anel recorta', () => {
    expect(manchaDeInundacao(grade, 99).areaM2).toBe(0);
    const anel = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 10_000 }, { x: 0, y: 10_000 }];
    expect(manchaDeInundacao(grade, 101, anel).areaM2).toBeCloseTo(20, 6);
  });
});
