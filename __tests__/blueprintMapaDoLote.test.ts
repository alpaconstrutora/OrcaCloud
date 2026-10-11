/**
 * O lote desenhado no mapa (11/10/2026): coordenada colada, origem no centro,
 * pontos em mm, medidas iguais às da recusa por resolução, e as recusas.
 */
import { describe, expect, it } from 'vitest';
import {
  areaParaLote,
  georreferenciaNoCentro,
  lerCoordenadaColada,
  retanguloGeoPorCantos,
} from '../utils/blueprintMapaDoLote';
import { localParaGeo } from '../utils/blueprintTopografia';

// O retângulo do `contours (1).kml` do pedido: ~288 m (L-O) × ~248 m (N-S).
const NORTE = -22.615333;
const SUL = -22.617571;
const OESTE = -46.042601;
const LESTE = -46.039801;
const AREA_DO_PEDIDO = retanguloGeoPorCantos({ lat: NORTE, lon: OESTE }, { lat: SUL, lon: LESTE });

describe('lerCoordenadaColada', () => {
  it.each([
    ['-22.6153, -46.0426', -22.6153, -46.0426],
    ['-22,6153, -46,0426', -22.6153, -46.0426],
    ['-22,6153 -46,0426', -22.6153, -46.0426],
    ['-22.615330,-46.042601', -22.61533, -46.042601],
    ['-22,6153;-46,0426', -22.6153, -46.0426],
    ['  -22.6153    -46.0426  ', -22.6153, -46.0426],
  ])('%s', (texto, lat, lon) => {
    expect(lerCoordenadaColada(texto)).toEqual({ lat, lon });
  });

  it.each(['', 'Rua das Flores, 100', '-22.6', '1 2 3', '-95, 10', '10, 190', '-22.6153, -46.0426 Brasil'])('recusa "%s"', (texto) => {
    expect(lerCoordenadaColada(texto)).toBeNull();
  });
});

describe('areaParaLote', () => {
  it('sem georreferência: origem no centro da caixa, norte para cima, medidas do terreno do pedido', () => {
    const r = areaParaLote(AREA_DO_PEDIDO, null);
    if (!r.ok) throw new Error(r.erro);
    expect(r.georreferenciaNova).toBe(true);
    expect(r.georreferencia.latitude).toBeCloseTo((NORTE + SUL) / 2, 6);
    expect(r.georreferencia.longitude).toBeCloseTo((OESTE + LESTE) / 2, 6);
    expect(r.georreferencia.rotacaoNorteDeg ?? 0).toBe(0);
    // Simétrico em volta da origem: o 1º vértice (NO) em −x, +y.
    expect(r.pontosMm[0].x).toBeLessThan(0);
    expect(r.pontosMm[0].y).toBeGreaterThan(0);
    expect(r.pontosMm[0].x).toBeCloseTo(-r.pontosMm[2].x, -1);
    expect(r.medidas.ladoMenorM).toBeGreaterThan(245);
    expect(r.medidas.ladoMenorM).toBeLessThan(252);
    expect(r.medidas.perimetroM).toBeGreaterThan(1060);
    expect(r.medidas.perimetroM).toBeLessThan(1085);
    expect(r.medidas.serveCopernicus).toBe(true);
  });

  it('ida e volta: os pontos em mm voltam aos vértices clicados (erro < 1 cm)', () => {
    const r = areaParaLote(AREA_DO_PEDIDO, null);
    if (!r.ok) throw new Error(r.erro);
    r.pontosMm.forEach((p, i) => {
      const g = localParaGeo(p, r.georreferencia);
      expect(Math.abs(g.lat - AREA_DO_PEDIDO[i].lat) * 111_000).toBeLessThan(0.01);
      expect(Math.abs(g.lon - AREA_DO_PEDIDO[i].lon) * 102_000).toBeLessThan(0.01);
    });
  });

  it('com georreferência já informada: ela é mantida, e o desenho respeita o giro do norte', () => {
    const geo = { latitude: NORTE, longitude: OESTE, rotacaoNorteDeg: 90, elevacaoM: 880 };
    const r = areaParaLote(AREA_DO_PEDIDO, geo);
    if (!r.ok) throw new Error(r.erro);
    expect(r.georreferenciaNova).toBe(false);
    expect(r.georreferencia).toBe(geo);
    // O 1º vértice é a própria origem.
    expect(Math.hypot(r.pontosMm[0].x, r.pontosMm[0].y)).toBeLessThan(2);
    // Girado 90°: o lado leste-oeste (288 m) vira o eixo Y do desenho.
    const ys = r.pontosMm.map((p) => p.y);
    expect((Math.max(...ys) - Math.min(...ys)) / 1000).toBeGreaterThan(285);
  });

  it('lote pequeno: aceito, mas avisa que não serve ao Copernicus (mesma conta da recusa)', () => {
    const r = areaParaLote(retanguloGeoPorCantos({ lat: -22.6, lon: -46.04 }, { lat: -22.6003, lon: -46.0403 }), null);
    if (!r.ok) throw new Error(r.erro);
    expect(r.medidas.ladoMenorM).toBeLessThan(90);
    expect(r.medidas.serveCopernicus).toBe(false);
  });

  it('o duplo clique que repete o último vértice e o fechamento explícito não viram lados', () => {
    const v = [...AREA_DO_PEDIDO, AREA_DO_PEDIDO[3], AREA_DO_PEDIDO[0]];
    const r = areaParaLote(v, null);
    if (!r.ok) throw new Error(r.erro);
    expect(r.pontosMm).toHaveLength(4);
  });

  it('recusas: < 3 vértices, contorno cruzado, longe demais da origem', () => {
    expect(areaParaLote(AREA_DO_PEDIDO.slice(0, 2), null)).toEqual({ ok: false, erro: 'Marque ao menos três vértices no mapa.' });
    const [no, ne, se, so] = AREA_DO_PEDIDO;
    const cruzado = areaParaLote([no, se, ne, so], null);
    expect(cruzado.ok).toBe(false);
    if (!cruzado.ok) expect(cruzado.erro).toMatch(/se cruza/);
    // 3 km de lado: vértice a ~1,5 km do centro.
    const grande = areaParaLote(retanguloGeoPorCantos({ lat: -22.6, lon: -46.04 }, { lat: -22.627, lon: -46.011 }), null);
    expect(grande.ok).toBe(false);
    if (!grande.ok) expect(grande.erro).toMatch(/até 1 km/);
    // Área pequena, mas a 5 km da origem já informada.
    const longe = areaParaLote(AREA_DO_PEDIDO, { latitude: -22.57, longitude: -46.04 });
    expect(longe.ok).toBe(false);
    if (!longe.ok) expect(longe.erro).toMatch(/origem já informada/);
  });

  it('georreferenciaNoCentro arredonda a ~1 cm', () => {
    const g = georreferenciaNoCentro([{ lat: -22.123456789, lon: -46.987654321 }, { lat: -22.123456789, lon: -46.987654321 }]);
    expect(g).toEqual({ latitude: -22.1234568, longitude: -46.9876543 });
  });
});
