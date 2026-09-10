/**
 * A área construída com uma PONTA SOLTA no contorno (10/09/2026).
 *
 * Vista no painel de ambientes de uma planta real: *"136,79 m² úteis ·
 * 91.863.221.361.873,47 m² construídos"*. O contorno externo passava por uma
 * parede que entra e volta pela mesma linha (ponta solta) — um giro de 180°,
 * e a fórmula analítica do canto usa `tan(giro/2)`: tan(90°).
 *
 * O cálculo de canto vale para mitra; ponta não tem mitra. O giro fica
 * limitado a 160°, e a área volta a ser um número de planta.
 */
import { describe, expect, it } from 'vitest';
import { areaRecuada, point, type Wall } from '../utils/blueprintKernel';

const parede = (id: string, ax: number, ay: number, bx: number, by: number): Wall =>
  ({ id, uid: id, levelId: 'l', a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Wall;

describe('área recuada · a ponta solta', () => {
  // Sala 6 × 4 com um toco de parede de 1 m entrando pelo lado de cima.
  const ring = [
    point(0, 0),
    point(6000, 0),
    point(6000, 4000),
    point(3000, 4000),
    point(3000, 3000), // a ponta solta
    point(3000, 4000),
    point(0, 4000),
  ];
  const walls = [
    parede('w1', 0, 0, 6000, 0),
    parede('w2', 6000, 0, 6000, 4000),
    parede('w3', 6000, 4000, 0, 4000),
    parede('w4', 0, 4000, 0, 0),
    parede('w5', 3000, 4000, 3000, 3000),
  ];

  it('⚠️ o giro de 180° não explode: área útil ≈ 24 m² menos o toco, não 10¹³', () => {
    const { areaMm2 } = areaRecuada(ring, walls, 1);
    const m2 = areaMm2 / 1e6;
    // Eixo 24 m²; a face interna tira ≈ 1,5 m²; o toco tira ≈ 0,15 m².
    expect(m2).toBeGreaterThan(21);
    expect(m2).toBeLessThan(23);
  });

  it('⚠️ para FORA também — é a área construída que estourou', () => {
    const m2 = areaRecuada(ring, walls, -1).areaMm2 / 1e6;
    expect(m2).toBeGreaterThan(24);
    expect(m2).toBeLessThan(27);
  });

  it('sem ponta solta o número não mudou: retângulo 6 × 4, paredes de 15', () => {
    const limpo = ring.filter((_, i) => i !== 4 && i !== 5);
    const m2 = areaRecuada(limpo, walls.slice(0, 4), 1).areaMm2 / 1e6;
    expect(m2).toBeCloseTo(5.85 * 3.85, 6);
  });
});
