/**
 * Fase 9: importação de pontos cotados por arquivo — texto (PNEZD e cia),
 * GeoJSON, KML, DXF e SVG — com ordem, unidade e ancoragem.
 */
import { describe, expect, it } from 'vitest';
import type { Georreferencia, Point } from '../utils/blueprintKernel';
import { geoParaLocal, localParaGeo } from '../utils/blueprintTopografia';
import {
  formatoPeloNome,
  importarPontos,
  numeroFlexivel,
  utmParaLatLon,
  zonaUtmDe,
} from '../utils/blueprintTopografiaImportacao';

const LOTE: Point[] = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 30000 },
  { x: 0, y: 30000 },
];
const GEO: Georreferencia = { latitude: -22.6136, longitude: -46.0578, elevacaoM: 100, rotacaoNorteDeg: 0 };
const CTX = { anel: LOTE, georreferencia: GEO };

describe('números e formato', () => {
  it('lê ponto, vírgula e milhar', () => {
    expect(numeroFlexivel('101,25')).toBe(101.25);
    expect(numeroFlexivel('101.25')).toBe(101.25);
    expect(numeroFlexivel('1.234,56')).toBe(1234.56);
    expect(numeroFlexivel('1,234.56')).toBe(1234.56);
    expect(numeroFlexivel('"7.485.123,40"')).toBe(7485123.4);
    expect(numeroFlexivel('P12')).toBeNull();
    expect(numeroFlexivel('')).toBeNull();
  });
  it('formato pela extensão', () => {
    expect(formatoPeloNome('levantamento.csv')).toBe('TEXTO');
    expect(formatoPeloNome('pontos.TXT')).toBe('TEXTO');
    expect(formatoPeloNome('a.geojson')).toBe('GEOJSON');
    expect(formatoPeloNome('a.kml')).toBe('KML');
    expect(formatoPeloNome('a.dxf')).toBe('DXF');
    expect(formatoPeloNome('a.svg')).toBe('SVG');
    expect(formatoPeloNome('a.pdf')).toBeNull();
  });
});

describe('texto de estação total', () => {
  it('PNEZD sem cabeçalho, ponto e vírgula, vírgula decimal: N vai para Y, E para X', () => {
    const r = importarPontos('1;10,000;2,000;100,50;LOTE\n2;20,000;4,000;101,00;LOTE\n3;5,000;8,000;100,80;LOTE', 'TEXTO', CTX);
    expect(r.detectado.separador).toBe(';');
    expect(r.detectado.cabecalho).toBe(false);
    expect(r.detectado.ordem).toBe('NEZ');
    expect(r.detectado.unidade).toBe('M');
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos[0]).toMatchObject({ x: 2000, y: 10000, cotaM: 100.5, nome: '1', codigo: 'LOTE' });
    expect(r.detectado.ancoragem).toBe('DIRETO');
    expect(r.dentroDoLote).toBe(3);
    expect(r.avisos.some((a) => /PNEZD/.test(a))).toBe(true);
  });

  it('cabeçalho decide a ordem: X,Y,Z vira E,N', () => {
    const r = importarPontos('Ponto,X,Y,Z,Desc\nA,2.5,10.0,100.5,cerca\nB,4.0,20.0,101.0,cerca\nC,8.0,5.0,100.8,', 'TEXTO', CTX);
    expect(r.detectado.cabecalho).toBe(true);
    expect(r.detectado.separador).toBe(',');
    expect(r.pontos[0]).toMatchObject({ x: 2500, y: 10000, cotaM: 100.5, nome: 'A', codigo: 'cerca' });
    expect(r.avisos.some((a) => /PNEZD/.test(a))).toBe(false);
  });

  it('cabeçalho Norte/Este e tab; linhas vazias, comentários e lixo são ignorados', () => {
    const r = importarPontos('# levantamento\nP\tNorte\tEste\tCota\n\n1\t10\t2\t100,5\n2\t20\t4\t101\nxx\tsem\tcota\n', 'TEXTO', CTX);
    expect(r.detectado.separador).toBe('tab');
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[1]).toMatchObject({ x: 4000, y: 20000 });
    expect(r.detectado.linhasIgnoradas).toBe(1);
  });

  it('opção de ordem ENZ troca as colunas; espaços como separador', () => {
    const r = importarPontos('1 2.000 10.000 100.5\n2 4.000 20.000 101\n3 8.000 5.000 100.8', 'TEXTO', CTX, { ordem: 'ENZ' });
    expect(r.detectado.ordem).toBe('ENZ');
    expect(r.pontos[0]).toMatchObject({ x: 2000, y: 10000 });
  });

  it('coordenadas em mm do desenho são reconhecidas pela grandeza', () => {
    const r = importarPontos('2000,10000,100.5\n4000,20000,101\n8000,5000,100.8', 'TEXTO', CTX, { ordem: 'ENZ' });
    expect(r.detectado.unidade).toBe('MM');
    expect(r.pontos[0]).toMatchObject({ x: 2000, y: 10000 });
  });

  it('coordenadas locais longe do lote são ancoradas no centro dele, com aviso; "Direto" respeita', () => {
    const txt = '1;1010;1002;100,5\n2;1020;1004;101\n3;1005;1008;100,8';
    const auto = importarPontos(txt, 'TEXTO', CTX);
    expect(auto.detectado.ancoragem).toBe('CENTRO_DO_LOTE');
    expect(auto.dentroDoLote).toBe(3);
    expect(auto.avisos.some((a) => /centro do lote/.test(a))).toBe(true);
    const direto = importarPontos(txt, 'TEXTO', CTX, { ancoragem: 'DIRETO' });
    expect(direto.detectado.ancoragem).toBe('DIRETO');
    expect(direto.dentroDoLote).toBe(0);
    expect(direto.avisos.some((a) => /Nenhum ponto cai dentro/.test(a))).toBe(true);
  });

  it('UTM: detecta pela grandeza, deduz a zona da georreferência e cai no lugar certo', () => {
    // Gera o UTM "de verdade" a partir de pontos do desenho: local → geo → (inverso numérico do UTM).
    const zona = zonaUtmDe(GEO.longitude);
    expect(zona).toBe(23);
    const alvo = { x: 6000, y: 15000 };
    const geo = localParaGeo(alvo, GEO);
    // Procura (E, N) cujo utmParaLatLon devolve `geo` — bisseção simples em torno do centro da zona.
    let E = 500000;
    let N = 7500000;
    for (let it = 0; it < 60; it++) {
      const c = utmParaLatLon(E, N, zona, 'S');
      const dLat = geo.lat - c.lat;
      const dLon = geo.lon - c.lon;
      N += dLat * 111000;
      E += dLon * 111000 * Math.cos((geo.lat * Math.PI) / 180);
      if (Math.abs(dLat) < 1e-10 && Math.abs(dLon) < 1e-10) break;
    }
    const txt = `1;${N.toFixed(3)};${E.toFixed(3)};101,00\n2;${(N + 5).toFixed(3)};${E.toFixed(3)};101,50\n3;${N.toFixed(3)};${(E + 3).toFixed(3)};100,90`;
    const r = importarPontos(txt, 'TEXTO', CTX);
    expect(r.detectado.unidade).toBe('UTM');
    expect(r.detectado.zonaUtm).toBe(23);
    expect(r.detectado.ancoragem).toBe('GEORREFERENCIA');
    expect(Math.abs(r.pontos[0].x - 6000)).toBeLessThan(20);
    expect(Math.abs(r.pontos[0].y - 15000)).toBeLessThan(20);
    expect(Math.abs(r.pontos[1].y - 20000)).toBeLessThan(40); // +5 m ao norte
    expect(r.dentroDoLote).toBe(3);
    // Sem georreferência, UTM não tem onde cair.
    expect(() => importarPontos(txt, 'TEXTO', { anel: LOTE, georreferencia: null })).toThrow(/georreferência/);
  });
});

describe('geoParaLocal', () => {
  it('é o inverso de localParaGeo, com giro do norte', () => {
    const geo = { ...GEO, rotacaoNorteDeg: 25 };
    for (const p of [{ x: 0, y: 0 }, { x: 8000, y: 27000 }, { x: -3000, y: 5000 }]) {
      const volta = geoParaLocal(localParaGeo(p, geo), geo);
      expect(volta.x).toBeCloseTo(p.x, 3);
      expect(volta.y).toBeCloseTo(p.y, 3);
    }
  });
});

describe('GeoJSON e KML', () => {
  it('GeoJSON: pontos com z na coordenada ou em properties; precisa de georreferência', () => {
    const p1 = localParaGeo({ x: 3000, y: 6000 }, GEO);
    const p2 = localParaGeo({ x: 9000, y: 24000 }, GEO);
    const p3 = localParaGeo({ x: 6000, y: 15000 }, GEO);
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [p1.lon, p1.lat, 100.5] }, properties: { name: 'A' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [p2.lon, p2.lat] }, properties: { cota: '101,2', name: 'B' } },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[p3.lon, p3.lat, 100.9]] }, properties: {} },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      ],
    });
    const r = importarPontos(gj, 'GEOJSON', CTX);
    expect(r.detectado.unidade).toBe('GEO');
    expect(r.detectado.ancoragem).toBe('GEORREFERENCIA');
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos[0].x).toBeCloseTo(3000, 0);
    expect(r.pontos[0].y).toBeCloseTo(6000, 0);
    expect(r.pontos[0]).toMatchObject({ cotaM: 100.5, nome: 'A' });
    expect(r.pontos[1].cotaM).toBe(101.2);
    expect(r.dentroDoLote).toBe(3);
    expect(r.avisos.some((a) => /ignoradas/.test(a))).toBe(true);
    expect(() => importarPontos(gj, 'GEOJSON', { anel: LOTE, georreferencia: null })).toThrow(/georreferência/);
    expect(() => importarPontos('{nada', 'GEOJSON', CTX)).toThrow(/JSON/);
  });

  it('KML: Placemark com Point e altitude; sem Point é ignorado', () => {
    const p1 = localParaGeo({ x: 3000, y: 6000 }, GEO);
    const kml = `<?xml version="1.0"?><kml><Document>
      <Placemark><name>P1</name><Point><coordinates>${p1.lon},${p1.lat},100.5</coordinates></Point></Placemark>
      <Placemark><name>linha</name><LineString><coordinates>0,0,0 1,1,0</coordinates></LineString></Placemark>
      <Placemark><name>P2</name><ExtendedData><Data name="cota"><value>101,3</value></Data></ExtendedData><Point><coordinates>${p1.lon},${p1.lat}</coordinates></Point></Placemark>
    </Document></kml>`;
    const r = importarPontos(kml, 'KML', CTX);
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[0]).toMatchObject({ cotaM: 100.5, nome: 'P1' });
    expect(r.pontos[0].x).toBeCloseTo(3000, 0);
    expect(r.pontos[1].cotaM).toBe(101.3);
    expect(r.detectado.linhasIgnoradas).toBe(1);
  });
});

describe('DXF e SVG', () => {
  const par = (c: number | string, v: number | string) => `${c}\n${v}\n`;
  it('DXF: POINT com Z entra direto; CIRCLE sem Z casa com o TEXT numérico mais próximo; unidade do $INSUNITS', () => {
    const dxf =
      par(0, 'SECTION') + par(2, 'HEADER') + par(9, '$INSUNITS') + par(70, 6) + par(0, 'ENDSEC') +
      par(0, 'SECTION') + par(2, 'ENTITIES') +
      par(0, 'POINT') + par(8, 'TOPO') + par(10, 2) + par(20, 10) + par(30, 100.5) +
      par(0, 'CIRCLE') + par(8, 'TOPO') + par(10, 4) + par(20, 20) + par(30, 0) + par(40, 0.1) +
      par(0, 'TEXT') + par(8, 'TOPO') + par(10, 4.3) + par(20, 20.2) + par(30, 0) + par(40, 0.25) + par(1, '101,00') +
      par(0, 'CIRCLE') + par(8, 'TOPO') + par(10, 8) + par(20, 5) + par(30, 0) + par(40, 0.1) +
      par(0, 'TEXT') + par(8, 'X') + par(10, 50) + par(20, 50) + par(30, 0) + par(40, 0.25) + par(1, '999') +
      par(0, 'ENDSEC') + par(0, 'EOF');
    const r = importarPontos(dxf, 'DXF', CTX);
    expect(r.detectado.unidade).toBe('M');
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[0]).toMatchObject({ x: 2000, y: 10000, cotaM: 100.5 });
    expect(r.pontos[1]).toMatchObject({ x: 4000, y: 20000, cotaM: 101 });
    expect(r.avisos.some((a) => /1 marca/.test(a))).toBe(true);
  });

  it('SVG: círculos casados com o texto mais próximo, Y invertido pela viewBox e escala informada', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 300">
      <circle cx="20" cy="200" r="2"/><text x="24" y="197" font-size="6">100,50</text>
      <circle cx="40" cy="100" r="2"/><text x="44" y="97">101.00</text>
      <circle cx="80" cy="250" r="2"/><text x="84" y="247">cota 100,80</text>
      <rect x="100" y="10" width="2" height="2"/><text x="10" y="10">sem par</text>
    </svg>`;
    // 1 unidade do SVG = 100 mm (o desenho tem 12 × 30 m → 120 × 300 unidades).
    const r = importarPontos(svg, 'SVG', CTX, { escalaSvgMmPorUnidade: 100 });
    expect(r.detectado.unidade).toBe('SVG');
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos[0]).toMatchObject({ x: 2000, y: 10000, cotaM: 100.5 }); // y = (300 − 200) × 100
    expect(r.pontos[1]).toMatchObject({ x: 4000, y: 20000, cotaM: 101 });
    expect(r.pontos[2]).toMatchObject({ x: 8000, y: 5000, cotaM: 100.8 });
    expect(r.dentroDoLote).toBe(3);
    expect(r.avisos.some((a) => /1 marca/.test(a))).toBe(true);
  });
});
