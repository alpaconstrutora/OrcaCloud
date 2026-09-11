/**
 * Declividade, corte/aterro e curva sob o cursor (`utils/blueprintTopografiaAnalises.ts`).
 *
 * Fixtures com resposta conhecida de antemão: plano dá 0 %; rampa de 0,5 m/m
 * dá 50 % em toda célula; platô na cota de equilíbrio dá corte = aterro; platô
 * acima do ponto mais alto dá só aterro, com volume = Δ × área.
 */

import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { gerarCurvas, nosDaGrade, planejarGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
import {
  comprimentoDaCurvaM,
  cotaDeEquilibrio,
  curvaSob,
  declividadeDaGrade,
  faixaDe,
  FAIXAS_DE_DECLIVIDADE,
  terraplenagemPreliminar,
} from '../utils/blueprintTopografiaAnalises';

const QUADRADO: Point[] = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 20000 },
  { x: 0, y: 20000 },
];

function gradeDe(fn: (x: number, y: number) => number | null, esp = 1000): GradeDeElevacao {
  const grade = planejarGrade(QUADRADO, esp);
  return { ...grade, cotasM: nosDaGrade(grade).map((n) => fn(n.x, n.y)) };
}

const RAMPA = (x: number) => 100 + (x / 1000) * 0.5;

describe('declividade', () => {
  it('plano: 0 % em toda parte, tudo na primeira faixa, área = lote', () => {
    const d = declividadeDaGrade(gradeDe(() => 100), QUADRADO);
    expect(d.maximaP).toBe(0);
    expect(d.mediaP).toBe(0);
    expect(d.areaPorFaixaM2[0]).toBeCloseTo(400, 6);
    expect(d.areaPorFaixaM2.slice(1).every((a) => a === 0)).toBe(true);
    expect(d.areaAnalisadaM2).toBeCloseTo(400, 6);
  });

  it('rampa de 0,5 m/m: 50 % em toda célula → faixa "> 30 %"', () => {
    const d = declividadeDaGrade(gradeDe(RAMPA), QUADRADO);
    for (const p of d.celulasP) expect(p).toBeCloseTo(50, 9);
    expect(d.mediaP).toBeCloseTo(50, 9);
    expect(d.areaPorFaixaM2[3]).toBeCloseTo(400, 6);
    expect(FAIXAS_DE_DECLIVIDADE[faixaDe(50)].rotulo).toBe('> 30 %');
  });

  it('as faixas cortam em 5, 15 e 30', () => {
    expect(faixaDe(0)).toBe(0);
    expect(faixaDe(5)).toBe(0);
    expect(faixaDe(5.1)).toBe(1);
    expect(faixaDe(15)).toBe(1);
    expect(faixaDe(29.9)).toBe(2);
    expect(faixaDe(31)).toBe(3);
  });

  it('célula com nodata não entra na conta nem na área', () => {
    const d = declividadeDaGrade(gradeDe((x, y) => (x === 10000 && y === 10000 ? null : 100)), QUADRADO);
    expect(d.faixaDaCelula.filter((f) => f === null)).toHaveLength(4);
    expect(d.areaAnalisadaM2).toBeCloseTo(396, 6);
  });
});

describe('corte e aterro', () => {
  it('platô na cota de equilíbrio: corte = aterro', () => {
    const g = gradeDe(RAMPA);
    const cota = cotaDeEquilibrio(g, QUADRADO)!;
    expect(cota).toBeCloseTo(105, 6);
    const t = terraplenagemPreliminar(g, QUADRADO, cota);
    expect(t.corteM3).toBeCloseTo(t.aterroM3, 6);
    expect(Math.abs(t.saldoM3)).toBeLessThan(1e-6);
    expect(t.areaPlatoM2).toBeCloseTo(400, 6);
  });

  it('platô acima do ponto mais alto: só aterro, volume = Δ médio × área', () => {
    const g = gradeDe(RAMPA);
    const t = terraplenagemPreliminar(g, QUADRADO, 120);
    expect(t.corteM3).toBe(0);
    // Terreno médio 105 m sobre 400 m² → (120 − 105) × 400 = 6.000 m³.
    expect(t.aterroM3).toBeCloseTo(6000, 6);
    // A maior altura de aterro fica na célula mais BAIXA (centro em x = 500).
    expect(t.alturaMaxAterroM).toBeCloseTo(120 - RAMPA(500), 6);
    expect(t.ladoDaCelula.filter((l) => l === 'ATERRO')).toHaveLength(400);
  });

  it('platô abaixo do ponto mais baixo: só corte', () => {
    const t = terraplenagemPreliminar(gradeDe(RAMPA), QUADRADO, 90);
    expect(t.aterroM3).toBe(0);
    expect(t.corteM3).toBeCloseTo(6000, 6);
  });

  it('platô só numa parte do lote conta só aquelas células', () => {
    const metade: Point[] = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 20000 },
      { x: 0, y: 20000 },
    ];
    const t = terraplenagemPreliminar(gradeDe(RAMPA), metade, 200);
    expect(t.areaPlatoM2).toBeCloseTo(200, 6);
  });

  it('sem cota no platô, a sugestão é nula', () => {
    expect(cotaDeEquilibrio(gradeDe(() => null), QUADRADO)).toBeNull();
  });
});

describe('curva sob o cursor', () => {
  it('acha a curva certa e recusa fora da tolerância', () => {
    const g = gradeDe(RAMPA, 500);
    const curvas = gerarCurvas(g, QUADRADO, 1); // retas verticais em x = (cota − 100) / 0,5
    const i = curvaSob(curvas, { x: 10050, y: 7000 }, 200)!;
    expect(curvas[i].cotaM).toBe(105);
    expect(curvaSob(curvas, { x: 10600, y: 7000 }, 200)).toBeNull();
    expect(comprimentoDaCurvaM(curvas[i])).toBeCloseTo(20, 6);
  });
});
