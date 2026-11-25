/**
 * Os prédios do OpenStreetMap na Maquete (25/11/2026), pelos ladrilhos vetoriais do OpenFreeMap: a
 * caixa do terreno, os ladrilhos que a cobrem, o recorte na borda do ladrilho e os prismas no
 * desenho com a base no relevo.
 */
import { describe, expect, it } from 'vitest';
import {
  areaNoLadrilho,
  caixaGeoDaGrade,
  geoDoLadrilho,
  ladrilhosDaCaixa,
  MAX_LADRILHOS,
  prediosDoLadrilho,
  prediosNoDesenho,
  recortarNoLadrilho,
  type PredioGeo,
} from '../utils/blueprintMaqueteOsm';
import type { CamadaMvt } from '../utils/geo/mvt';
import { localParaGeo } from '../utils/blueprintTopografia';

const GEO = { latitude: -22.9, longitude: -47.06 };

describe('caixa e ladrilhos', () => {
  const grade = { origem: { x: -50_000, y: -50_000 }, espacamentoMm: 10_000, colunas: 11, linhas: 11 };

  it('a caixa cobre os quatro cantos da grade; com o norte girado, cresce', () => {
    const c = caixaGeoDaGrade(grade, GEO);
    expect(c.sul).toBeLessThan(GEO.latitude);
    expect(c.norte).toBeGreaterThan(GEO.latitude);
    expect(c.norte - c.sul).toBeCloseTo(100 / 111_000, 4);
    const girada = caixaGeoDaGrade(grade, { ...GEO, rotacaoNorteDeg: 45 });
    expect(girada.norte - girada.sul).toBeGreaterThan((c.norte - c.sul) * 1.3);
  });

  it('o centro de Campinas (−22,9056; −47,0608) cai no ladrilho 14/6050/9263 (linha = 9263,39 pela fórmula do Web Mercator)', () => {
    expect(ladrilhosDaCaixa({ sul: -22.906, oeste: -47.061, norte: -22.905, leste: -47.06 })).toEqual([{ z: 14, x: 6050, y: 9263 }]);
  });

  it('caixa na divisa pega os vizinhos; terreno grande demais → null', () => {
    const t = geoDoLadrilho({ z: 14, x: 6050, y: 9262 }, 0, 0, 4096); // canto NO do ladrilho
    const ls = ladrilhosDaCaixa({ sul: t.lat - 0.001, oeste: t.lon - 0.001, norte: t.lat + 0.001, leste: t.lon + 0.001 })!;
    expect(ls).toHaveLength(4);
    expect(ladrilhosDaCaixa({ sul: -23.2, oeste: -47.3, norte: -22.8, leste: -46.9 })).toBeNull();
    expect(MAX_LADRILHOS).toBe(16);
  });

  it('geoDoLadrilho: o canto NO do ladrilho 0/0/0 é (85,05…, −180); o SE é (−85,05…, 180)', () => {
    const no = geoDoLadrilho({ z: 0, x: 0, y: 0 }, 0, 0, 4096);
    const se = geoDoLadrilho({ z: 0, x: 0, y: 0 }, 4096, 4096, 4096);
    expect(no.lon).toBe(-180);
    expect(no.lat).toBeCloseTo(85.0511, 3);
    expect(se.lon).toBe(180);
    expect(se.lat).toBeCloseTo(-85.0511, 3);
  });
});

describe('recorte e anéis', () => {
  it('o anel que passa da borda é cortado no quadrado do ladrilho', () => {
    const r = recortarNoLadrilho([{ x: -100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 }, { x: -100, y: 300 }, { x: -100, y: 100 }], 4096);
    expect(Math.min(...r.map((p) => p.x))).toBe(0);
    expect(Math.abs(areaNoLadrilho(r))).toBeCloseTo(200 * 200, 6);
  });

  it('anel todo fora: vazio; todo dentro: igual', () => {
    expect(recortarNoLadrilho([{ x: -50, y: -50 }, { x: -10, y: -50 }, { x: -10, y: -10 }], 4096)).toEqual([]);
    const dentro = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }];
    expect(recortarNoLadrilho(dentro, 4096)).toEqual(dentro);
  });

  it('área com sinal: anel externo (horário com y para baixo) > 0, furo < 0', () => {
    expect(areaNoLadrilho([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(100);
    expect(areaNoLadrilho([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }])).toBe(-100);
  });
});

describe('prediosDoLadrilho', () => {
  const t = { z: 14, x: 6050, y: 9262 };
  const quadrado = (x: number, y: number, l: number, horario = true) =>
    horario
      ? [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }, { x, y }]
      : [{ x, y }, { x, y: y + l }, { x: x + l, y: y + l }, { x: x + l, y }, { x, y }];

  it('cada anel EXTERNO da feição juntada vira um prédio com a altura dela; furo e hide_3d ficam de fora', () => {
    const camada: CamadaMvt = {
      nome: 'building',
      extent: 4096,
      feicoes: [
        { id: null, tipo: 3, propriedades: { render_height: 5, render_min_height: 0 }, geometria: [quadrado(100, 100, 50), quadrado(300, 300, 40), quadrado(110, 110, 10, false)] },
        { id: null, tipo: 3, propriedades: { render_height: 60, render_min_height: 3 }, geometria: [quadrado(1000, 1000, 80)] },
        { id: null, tipo: 3, propriedades: { render_height: 30, hide_3d: true }, geometria: [quadrado(2000, 2000, 80)] },
        { id: null, tipo: 2, propriedades: {}, geometria: [[{ x: 0, y: 0 }, { x: 10, y: 10 }]] },
      ],
    };
    const ps = prediosDoLadrilho(camada, t);
    expect(ps.map((p) => p.alturaM)).toEqual([5, 5, 60]);
    expect(ps[2].inicioM).toBe(3);
    // O 1º anel, em lat/lon, cai dentro do ladrilho.
    const no = geoDoLadrilho(t, 0, 0, 4096);
    const se = geoDoLadrilho(t, 4096, 4096, 4096);
    expect(ps[0].anel.every((c) => c.lon >= no.lon && c.lon <= se.lon && c.lat <= no.lat && c.lat >= se.lat)).toBe(true);
  });
});

describe('prediosNoDesenho', () => {
  // Relevo: plano inclinado 100 + x/10 m (x em m), definido só em |x|, |y| ≤ 50 m.
  const cotaEm = (p: { x: number; y: number }) => (Math.abs(p.x) <= 50_000 && Math.abs(p.y) <= 50_000 ? 100 + p.x / 10_000 : null);
  const predio = (x: number, y: number, lado: number, alturaM = 9, inicioM = 0): PredioGeo => ({
    anel: [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }].map((p) => localParaGeo(p, GEO)),
    alturaM,
    inicioM,
  });

  it('o contorno volta ao desenho, com a base na MENOR cota sob ele (+ o início do volume)', () => {
    const [p] = prediosNoDesenho([predio(10_000, 0, 10_000)], GEO, cotaEm);
    expect(p.anel).toHaveLength(4);
    expect(p.anel[0].x).toBeCloseTo(10_000, 0);
    // x vai de 10 a 20 m → cotas 101 a 102; a base fica na de baixo.
    expect(p.baseM).toBeCloseTo(101, 3);
    expect(p.alturaM).toBe(9);
    const [elevado] = prediosNoDesenho([predio(10_000, 0, 10_000, 9, 3)], GEO, cotaEm);
    expect(elevado.baseM).toBeCloseTo(104, 3);
    expect(elevado.alturaM).toBe(6);
  });

  it('vértice fora do relevo: fora (não pendura na borda do bloco)', () => {
    expect(prediosNoDesenho([predio(45_000, 0, 10_000)], GEO, cotaEm)).toEqual([]);
  });

  it('cruza o que o estudo desenhou: sai — ali o projeto substitui o existente', () => {
    const construido = [{ minX: -1_000, minY: -1_000, maxX: 2_000, maxY: 2_000 }];
    const ps = prediosNoDesenho([predio(0, 0, 5_000), predio(20_000, 20_000, 5_000)], GEO, cotaEm, construido);
    expect(ps).toHaveLength(1);
    expect(ps[0].anel[0].x).toBeCloseTo(20_000, 0);
  });
});
