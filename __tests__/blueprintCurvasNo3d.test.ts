/**
 * Curvas de nível no 3D (12/10/2026): as linhas da planta sobre o relevo, na
 * convenção do 3D (X = x/1000, Y = cota − zero + folga, Z = y/1000), em
 * grupos por cor e tipo.
 */
import { describe, expect, it } from 'vitest';
import { COR_CURVA_3D, curvasDeNivel3d, FOLGA_DA_CURVA_3D_M } from '../utils/blueprintTopografia3dExtras';
import { amostradorDaMalha, gerarCurvas, planejarGrade } from '../utils/blueprintTopografia';
import type { CurvaDeNivel } from '../utils/blueprintTopografia';

const quadrado = (cotaM: number, mestra: boolean, lado = 10_000): CurvaDeNivel => ({
  cotaM,
  mestra,
  fechada: true,
  pontos: [
    { x: 0, y: 0 },
    { x: lado, y: 0 },
    { x: lado, y: lado },
    { x: 0, y: lado },
    { x: 0, y: 0 },
  ],
});

describe('curvasDeNivel3d', () => {
  it('cada trecho vira um par de pontas, na cota relativa ao zero + a folga', () => {
    const [g] = curvasDeNivel3d([quadrado(890, false)], 887.94);
    expect(g.cor).toBe(COR_CURVA_3D);
    expect(g.mestra).toBe(false);
    // 4 trechos × 2 pontas × 3 coordenadas.
    expect(g.posicoes).toHaveLength(24);
    const y = 890 - 887.94 + FOLGA_DA_CURVA_3D_M;
    expect(Array.from(g.posicoes.slice(0, 6))).toEqual([0, expect.closeTo(y, 5), 0, 10, expect.closeTo(y, 5), 0]);
  });

  it('agrupa por cor e por mestra: um grupo por combinação, não um por curva', () => {
    const gs = curvasDeNivel3d([quadrado(880, true), quadrado(881, false), quadrado(882, false), quadrado(885, true)], 880);
    expect(gs).toHaveLength(2);
    expect(gs.find((g) => g.mestra)!.posicoes).toHaveLength(48);
    expect(gs.find((g) => !g.mestra)!.posicoes).toHaveLength(48);
  });

  it('com a cor pela cota (arco-íris), cada cor vira um grupo', () => {
    const cor = (c: number) => (c < 881 ? '#0000ff' : '#ff0000');
    const gs = curvasDeNivel3d([quadrado(880, false), quadrado(882, false)], 880, cor);
    expect(gs.map((g) => g.cor).sort()).toEqual(['#0000ff', '#ff0000']);
  });

  it('curva com menos de 2 pontos é ignorada; lista vazia dá lista vazia', () => {
    expect(curvasDeNivel3d([{ cotaM: 1, mestra: false, fechada: false, pontos: [{ x: 0, y: 0 }] }], 0)).toEqual([]);
    expect(curvasDeNivel3d([], 0)).toEqual([]);
  });

  it('com curvas geradas de verdade (cone), todos os vértices ficam na cota da sua curva', () => {
    const anel = [
      { x: -50_000, y: -50_000 },
      { x: 50_000, y: -50_000 },
      { x: 50_000, y: 50_000 },
      { x: -50_000, y: 50_000 },
    ];
    const g0 = planejarGrade(anel, 2000);
    const cotasM = g0.cotasM.map((_, k) => {
      const x = g0.origem.x + (k % g0.colunas) * g0.espacamentoMm;
      const y = g0.origem.y + Math.floor(k / g0.colunas) * g0.espacamentoMm;
      return 900 - Math.hypot(x, y) / 2000; // cone: 900 m no centro, −1 m a cada 2 m
    });
    const curvas = gerarCurvas({ ...g0, cotasM }, anel, 5);
    expect(curvas.length).toBeGreaterThan(3);
    const gs = curvasDeNivel3d(curvas, 875);
    const ys = new Set<number>();
    for (const g of gs) for (let i = 1; i < g.posicoes.length; i += 3) ys.add(Math.round((g.posicoes[i] - FOLGA_DA_CURVA_3D_M) * 1000) / 1000);
    const esperadas = new Set(curvas.map((c) => Math.round((c.cotaM - 875) * 1000) / 1000));
    expect([...ys].sort()).toEqual([...esperadas].sort());
  });
});

describe('amostradorDaMalha (a superfície exata do 3D)', () => {
  // Grade 2 × 2 (uma célula de 10 m): cantos 0, 10, 20, 40 — o "torcido" (0 + 40 ≠ 10 + 20)
  // faz os dois triângulos discordarem da bilinear, que é o caso que importa.
  const grade = { origem: { x: 0, y: 0 }, espacamentoMm: 10_000, colunas: 2, linhas: 2, cotasM: [0, 10, 20, 40] };
  const altura = amostradorDaMalha(grade);

  it('nos nós, a cota do nó', () => {
    expect(altura({ x: 0, y: 0 })).toBe(0);
    expect(altura({ x: 10_000, y: 0 })).toBe(10);
    expect(altura({ x: 0, y: 10_000 })).toBe(20);
    expect(altura({ x: 10_000, y: 10_000 })).toBe(40);
  });

  it('dentro, o PLANO do triângulo (diagonal 00→11), não a bilinear', () => {
    // u = 0,75, v = 0,25 (u ≥ v): triângulo 00-10-11 → 0 + 0,75·10 + 0,25·(40 − 10) = 15.
    expect(altura({ x: 7_500, y: 2_500 })).toBeCloseTo(15, 9);
    // u = 0,25, v = 0,75: triângulo 00-11-01 → 0 + 0,75·20 + 0,25·(40 − 20) = 20.
    expect(altura({ x: 2_500, y: 7_500 })).toBeCloseTo(20, 9);
    // A bilinear no centro daria 17,5; o triângulo dá (0 + 40)/2 = 20 — é essa diferença que escondia linha.
    expect(altura({ x: 5_000, y: 5_000 })).toBeCloseTo(20, 9);
  });

  it('fora da grade, ou célula com canto sem dado: null', () => {
    expect(altura({ x: -1, y: 0 })).toBeNull();
    expect(altura({ x: 0, y: 10_001 })).toBeNull();
    expect(amostradorDaMalha({ ...grade, cotasM: [0, 10, null, 40] })({ x: 5_000, y: 5_000 })).toBeNull();
  });

  it('com a malha, cada trecho é subdividido e assenta na superfície (+ folga)', () => {
    const curva = { cotaM: 15, mestra: false, fechada: false, pontos: [{ x: 7_500, y: 0 }, { x: 7_500, y: 10_000 }] };
    const [g] = curvasDeNivel3d([curva], 0, null, { altura, passoMm: 2_500 });
    // 10 m em pedaços de 2,5 m = 4 trechos.
    expect(g.posicoes).toHaveLength(4 * 6);
    // Cada trecho são 6 números (ponta + ponta). A 2,5 m (índice 7, y da 1ª ponta do 2º trecho):
    // u 0,75 ≥ v 0,25 → 0,75·10 + 0,25·30 = 15. No meio, a 5 m (índice 10, y da 2ª ponta do
    // 2º trecho): 0,75·10 + 0,5·30 = 22,5 — acima da cota 15 da curva, assentada na malha.
    expect(g.posicoes[7]).toBeCloseTo(15 + FOLGA_DA_CURVA_3D_M, 5);
    expect(g.posicoes[10]).toBeCloseTo(22.5 + FOLGA_DA_CURVA_3D_M, 5);
  });
});
