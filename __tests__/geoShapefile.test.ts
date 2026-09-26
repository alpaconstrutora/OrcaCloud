/**
 * A3 — Shapefile e KMZ.
 *
 * Leitura: contra `fixtures/geo/pyshp_referencia.zip`, escrito pelo pyshp
 * (escritor independente) — pontos Z, polilinha Z e polígono Z com atributos
 * acentuados. Escrita: ida e volta pelo próprio leitor MAIS as conferências de
 * byte que o formato exige (códigos, endianness, tamanhos, anel horário). A
 * leitura cruzada da nossa escrita pelo pyshp está em `docs/spikes/geo/conferir-shp.py`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crsDoWkt } from '../utils/geo/raster';
import { escreverShapefile, kmlDoKmz, kmzDoKml, lerShp, lerZipDeShapefiles, prjSirgasUtm, zipDeShapefiles, type CamadaShp } from '../utils/geo/shapefile';

describe('leitura (referência do pyshp)', () => {
  it('três camadas, geometria com Z, atributos UTF-8 e o .prj', async () => {
    const camadas = await lerZipDeShapefiles(readFileSync(path.join(__dirname, 'fixtures', 'geo', 'pyshp_referencia.zip')));
    const porNome = Object.fromEntries(camadas.map((c) => [c.nome, c]));
    expect(Object.keys(porNome).sort()).toEqual(['curvas', 'lote', 'pontos']);

    const p = porNome.pontos;
    expect(p.tipo).toBe('PONTO');
    expect(p.feicoes[0].partes).toEqual([[{ x: 611000.5, y: 7797000.25, z: 800.125 }]]);
    expect(p.feicoes[1].atributos).toEqual({ NOME: 'Poço', COTA: 801.5 });

    const c = porNome.curvas;
    expect(c.tipo).toBe('LINHA');
    expect(c.feicoes[0].partes[0]).toHaveLength(3);
    expect(c.feicoes[0].partes[0][2]).toEqual({ x: 611030, y: 7797010, z: 800 });

    const l = porNome.lote;
    expect(l.tipo).toBe('POLIGONO');
    expect(l.feicoes[0].atributos).toEqual({ NOME: 'Lote Ação', AREA: 600 });
    expect(l.feicoes[0].partes[0]).toHaveLength(5);
    expect(crsDoWkt(l.prj)?.codigo).toBe('EPSG:31983');
  });
});

describe('escrita', () => {
  const lote: CamadaShp = {
    nome: 'lote',
    tipo: 'POLIGONO',
    prj: prjSirgasUtm(23),
    // anti-horário de propósito: a escrita tem de virar para horário
    feicoes: [{ partes: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }]], atributos: { nome: 'Lote 1', área_m2: 600, quadra: 'A' } }],
  };

  it('cabeçalho: 9994 big-endian, versão 1000 e tipo little-endian, tamanho em palavras de 16 bits', () => {
    const a = escreverShapefile(lote);
    const v = new DataView(a.shp.buffer);
    expect(v.getInt32(0, false)).toBe(9994);
    expect(v.getInt32(24, false) * 2).toBe(a.shp.length);
    expect(v.getInt32(28, true)).toBe(1000);
    expect(v.getInt32(32, true)).toBe(15);
    const x = new DataView(a.shx.buffer);
    expect(x.getInt32(24, false) * 2).toBe(a.shx.length);
    expect(x.getInt32(100, false)).toBe(50); // 1º registro começa no byte 100 = palavra 50
  });

  it('anel externo fechado e HORÁRIO', () => {
    const { feicoes } = lerShp(escreverShapefile(lote).shp);
    const anel = feicoes[0][0];
    expect(anel[0]).toEqual(anel[anel.length - 1]);
    let s = 0;
    for (let i = 0; i + 1 < anel.length; i++) s += anel[i].x * anel[i + 1].y - anel[i + 1].x * anel[i].y;
    expect(s).toBeLessThan(0);
  });

  it('ida e volta pelo zip: tipos, Z, atributos (nome do campo em dBase: ≤ 10, sem acento, caixa alta)', async () => {
    const pontos: CamadaShp = {
      nome: 'pontos',
      tipo: 'PONTO',
      prj: null,
      feicoes: [
        { partes: [[{ x: 1.5, y: 2.25, z: 800.125 }]], atributos: { nome: 'P1', codigo: 'CE1', cota: 800.125 } },
        { partes: [[{ x: 3, y: 4, z: 801 }]], atributos: { nome: 'Árvore', codigo: '', cota: 801 } },
      ],
    };
    const curvas: CamadaShp = { nome: 'curvas', tipo: 'LINHA', prj: null, feicoes: [{ partes: [[{ x: 0, y: 0, z: 800 }, { x: 10, y: 5, z: 800 }]], atributos: { cota: 800, mestra: 'sim' } }] };
    const vazia: CamadaShp = { nome: 'vazia', tipo: 'PONTO', prj: null, feicoes: [] };
    const zip = await zipDeShapefiles([lote, pontos, curvas, vazia]);
    const lidas = await lerZipDeShapefiles(zip);
    expect(lidas.map((c) => c.nome).sort()).toEqual(['curvas', 'lote', 'pontos']); // camada vazia não sai
    const p = lidas.find((c) => c.nome === 'pontos')!;
    expect(p.feicoes[0].partes[0][0]).toEqual({ x: 1.5, y: 2.25, z: 800.125 });
    expect(p.feicoes[1].atributos).toEqual({ NOME: 'Árvore', CODIGO: '', COTA: 801 });
    expect(p.prj).toBeNull();
    const l = lidas.find((c) => c.nome === 'lote')!;
    expect(l.feicoes[0].atributos).toEqual({ NOME: 'Lote 1', AREA_M2: 600, QUADRA: 'A' });
    expect(crsDoWkt(l.prj)?.codigo).toBe('EPSG:31983');
  });

  it('zip sem .shp: erro dito', async () => {
    const kmz = await kmzDoKml('<kml/>');
    await expect(lerZipDeShapefiles(kmz)).rejects.toThrow(/nenhum \.shp/);
  });
});

describe('KMZ', () => {
  it('ida e volta; o doc.kml é o escolhido', async () => {
    const kml = '<?xml version="1.0"?><kml><Document><name>Lote Ação</name></Document></kml>';
    expect(await kmlDoKmz(await kmzDoKml(kml))).toBe(kml);
  });
});
