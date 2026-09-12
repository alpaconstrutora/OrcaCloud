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

  it('coordenada menor que 1 não engana a coluna do número do ponto (achado em produção)', () => {
    const r = importarPontos('4;0,500;8,300;101,60;CERCA\n5;3,200;4,400;101,30;TERRENO\n6;0,500;0,500;100,20;CERCA', 'TEXTO', CTX);
    expect(r.pontos[0]).toMatchObject({ x: 8300, y: 500, cotaM: 101.6, nome: '4', codigo: 'CERCA' });
    expect(r.pontos[2]).toMatchObject({ x: 500, y: 500, cotaM: 100.2 });
    // Só três números: não há número do ponto.
    expect(importarPontos('0,5;8,3;101,6\n1;1;100\n2;3;100', 'TEXTO', CTX).pontos[0]).toMatchObject({ x: 8300, y: 500, cotaM: 101.6 });
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

// ── Fase 10: perfis do próprio ÒPURA ───────────────────────────────────────
import { perfilAoLongo, estatisticasDoPerfil } from '../utils/blueprintTopografiaAnalises';
import { csvDoPerfil, svgDoPerfil } from '../utils/blueprintTopografiaExport';
import { colineares, detectarFormato, lerPerfilSvgDoOpura, perfilSobreLinha } from '../utils/blueprintTopografiaImportacao';

/** O arquivo que o usuário mandou como "app de referência": é a exportação do próprio ÒPURA. */
const SVG_DO_USUARIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" font-family="sans-serif">
<text x="44" y="14" font-size="11" fill="#334155">Planta 10/09/2026 — perfil (linha desenhada)</text>
<line x1="44" y1="22" x2="44" y2="192" stroke="#94a3b8" stroke-width="1"/>
<line x1="44" y1="192" x2="614" y2="192" stroke="#94a3b8" stroke-width="1"/>
<line x1="44" y1="192.0" x2="614" y2="192.0" stroke="#e2e8f0" stroke-width="1"/>
<text x="40" y="195.0" font-size="9" text-anchor="end" fill="#64748b">0,8</text>
<text x="44.0" y="204" font-size="9" text-anchor="middle" fill="#64748b">0,0 m</text>
<line x1="44" y1="149.5" x2="614" y2="149.5" stroke="#e2e8f0" stroke-width="1"/>
<text x="40" y="152.5" font-size="9" text-anchor="end" fill="#64748b">1,4</text>
<text x="186.5" y="204" font-size="9" text-anchor="middle" fill="#64748b">2,5 m</text>
<line x1="44" y1="107.0" x2="614" y2="107.0" stroke="#e2e8f0" stroke-width="1"/>
<text x="40" y="110.0" font-size="9" text-anchor="end" fill="#64748b">2,1</text>
<text x="329.0" y="204" font-size="9" text-anchor="middle" fill="#64748b">4,9 m</text>
<line x1="44" y1="64.5" x2="614" y2="64.5" stroke="#e2e8f0" stroke-width="1"/>
<text x="40" y="67.5" font-size="9" text-anchor="end" fill="#64748b">2,7</text>
<text x="471.5" y="204" font-size="9" text-anchor="middle" fill="#64748b">7,4 m</text>
<line x1="44" y1="22.0" x2="614" y2="22.0" stroke="#e2e8f0" stroke-width="1"/>
<text x="40" y="25.0" font-size="9" text-anchor="end" fill="#64748b">3,3</text>
<text x="614.0" y="204" font-size="9" text-anchor="middle" fill="#64748b">9,8 m</text>
<path d="M58.5 53.2L73.1 53.4L87.6 50.1L102.2 46.8L116.7 43.5L131.2 40.2L145.8 36.8L148.7 36.2L163.2 45.8L177.8 55.4L192.3 65.0L206.9 74.6L221.4 84.1L235.9 92.5L250.5 96.2L265.0 99.4L279.6 102.6L288.3 104.5L302.8 107.9L317.4 111.2L331.9 114.5L346.4 115.0L361.0 111.7L375.5 108.3L390.1 105.0L393.0 104.3L407.5 113.9L422.1 123.5L436.6 133.1L439.5 135.0L454.1 131.7L468.6 128.4L483.1 125.1L497.7 121.7L512.2 131.3L526.8 140.9L541.3 150.5L555.8 160.1L570.4 168.0L584.9 171.2L590.7 172.5L605.3 175.8L614.0 177.8 L614.0 192 L58.5 192 Z" fill="rgba(146,64,14,0.10)"/>
<path d="M58.5 53.2L73.1 53.4L87.6 50.1L102.2 46.8L116.7 43.5L131.2 40.2L145.8 36.8L148.7 36.2L163.2 45.8L177.8 55.4L192.3 65.0L206.9 74.6L221.4 84.1L235.9 92.5L250.5 96.2L265.0 99.4L279.6 102.6L288.3 104.5L302.8 107.9L317.4 111.2L331.9 114.5L346.4 115.0L361.0 111.7L375.5 108.3L390.1 105.0L393.0 104.3L407.5 113.9L422.1 123.5L436.6 133.1L439.5 135.0L454.1 131.7L468.6 128.4L483.1 125.1L497.7 121.7L512.2 131.3L526.8 140.9L541.3 150.5L555.8 160.1L570.4 168.0L584.9 171.2L590.7 172.5L605.3 175.8L614.0 177.8" fill="none" stroke="#92400e" stroke-width="1.5"/>
<circle cx="58.5" cy="53.2" r="2.5" fill="#92400e"/>
<text x="58.5" y="47.2" font-size="9" text-anchor="start" fill="#92400e">2,87 m</text>
<circle cx="614.0" cy="177.8" r="2.5" fill="#92400e"/>
<text x="614.0" y="171.8" font-size="9" text-anchor="end" fill="#92400e">1,00 m</text>
<text x="614" y="216" font-size="8" text-anchor="end" fill="#94a3b8">exagero vertical 0,9×</text>
</svg>`;

describe('perfil do ÒPURA (fase 10)', () => {
  it('reconhece o SVG e o CSV de perfil pelo conteúdo', () => {
    expect(detectarFormato('perfil.svg', SVG_DO_USUARIO)).toBe('PERFIL_SVG');
    expect(detectarFormato('perfil.svg', '<svg><circle cx="1" cy="2"/></svg>')).toBe('SVG');
    expect(detectarFormato('perfil.csv', '# t\nseq;dist_m;x_mm;y_mm;cota_m;status\n1;0;0;0;1;valido')).toBe('PERFIL_CSV');
    expect(detectarFormato('lev.csv', '1;2;3;4')).toBe('TEXTO');
  });

  it('o SVG do usuário: eixos de 0 a 9,8 m e cotas de 2,87 m a 1,00 m, 43 pontos', () => {
    const p = lerPerfilSvgDoOpura(SVG_DO_USUARIO);
    expect(p.titulo).toMatch(/perfil \(linha desenhada\)/);
    expect(p.comprimentoM).toBe(9.8);
    expect(p.pontos).toHaveLength(43);
    expect(p.pontos[0].distM).toBeCloseTo(0.25, 1);
    expect(p.pontos[0].cotaM).toBeCloseTo(2.87, 1);
    expect(p.pontos[p.pontos.length - 1].distM).toBeCloseTo(9.8, 1);
    expect(p.pontos[p.pontos.length - 1].cotaM).toBeCloseTo(1.0, 1);
    // Sem linha de perfil no contexto, o importador explica o que falta.
    expect(() => importarPontos(SVG_DO_USUARIO, 'PERFIL_SVG', CTX)).toThrow(/Perfil altimétrico/);
  });

  it('ida e volta: o SVG que svgDoPerfil escreve volta com cotas a 2 cm e distâncias a 5 cm', () => {
    const grade = { origem: { x: -1000, y: -1000 }, espacamentoMm: 1000, colunas: 16, linhas: 34, cotasM: [] as (number | null)[] };
    grade.cotasM = Array.from({ length: 16 * 34 }, (_, i) => 100 + ((i % 16) - 1) * 0.15 + Math.floor(i / 16) * 0.05);
    const cotaEm = (q: { x: number; y: number }) => {
      const c = Math.round((q.x - grade.origem.x) / 1000);
      const l = Math.round((q.y - grade.origem.y) / 1000);
      return c < 0 || l < 0 || c >= 16 || l >= 34 ? null : grade.cotasM[l * 16 + c];
    };
    const linha = [{ x: 1000, y: 2000 }, { x: 6000, y: 20000 }, { x: 11000, y: 28000 }];
    const perfil = perfilAoLongo(cotaEm, linha, 500);
    const svg = svgDoPerfil(perfil, estatisticasDoPerfil(perfil), { titulo: 'Teste — perfil' });
    const r = importarPontos(svg, 'PERFIL_SVG', { ...CTX, linhaDoPerfil: perfil });
    expect(r.formato).toBe('PERFIL_SVG');
    expect(r.pontos.length).toBe(perfil.length);
    perfil.forEach((p, i) => {
      expect(Math.abs(r.pontos[i].cotaM - (p.cotaM as number))).toBeLessThanOrEqual(0.02);
      expect(Math.hypot(r.pontos[i].x - p.x, r.pontos[i].y - p.y)).toBeLessThanOrEqual(50);
    });
    expect(r.avisos.some((a) => /precisão/.test(a))).toBe(true);
    // A linha tem uma dobra: não são colineares.
    expect(colineares(r.pontos)).toBe(false);

    // O CSV traz x, y do desenho (arredondados ao mm) e cota com 3 casas —
    // ambos pelo próprio `csvDoPerfil`, não pelo importador.
    const csv = csvDoPerfil(perfil, estatisticasDoPerfil(perfil), 'Teste');
    const rc = importarPontos(csv, 'PERFIL_CSV', CTX);
    expect(rc.pontos.length).toBe(perfil.length);
    expect(rc.pontos[3].x).toBe(Math.round(perfil[3].x));
    expect(rc.pontos[3].y).toBe(Math.round(perfil[3].y));
    expect(rc.pontos[3].cotaM).toBeCloseTo(perfil[3].cotaM as number, 3);
  });

  it('perfil sobre uma reta: apoia pela distância, avisa colinearidade e o que passa do fim', () => {
    const linha = [{ distM: 0, x: 0, y: 0 }, { distM: 10, x: 10000, y: 0 }];
    const r = perfilSobreLinha([{ distM: 0, cotaM: 1 }, { distM: 2.5, cotaM: 1.5 }, { distM: 10, cotaM: 2 }, { distM: 12, cotaM: 2 }], linha);
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos[1]).toMatchObject({ x: 2500, y: 0, cotaM: 1.5 });
    expect(r.foraDaLinha).toBe(1);
    expect(colineares(r.pontos)).toBe(true);
    expect(colineares([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 600 }])).toBe(false);
  });
});
