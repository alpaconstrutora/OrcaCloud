/**
 * F11 — o CONTORNO DE TRABALHO do gerador: decomposição do contorno ortogonal em retângulos,
 * os trechos de um lado que caem na borda (com a normal externa) e a subtração da borda.
 */
import { describe, expect, it } from 'vitest';
import { point } from '../utils/blueprintKernel';
import { areaDoRetangulo, ehOrtogonal, retangulosDoContorno, subtrairBorda, trechosNaBorda } from '../utils/blueprintContorno';

// L: 10 × 10 sem o canto 5 × 5 de cima à direita (75 m²), anti-horário.
const L = [point(0, 0), point(10000, 0), point(10000, 5000), point(5000, 5000), point(5000, 10000), point(0, 10000)];

describe('contorno — decomposição em retângulos', () => {
  it('o L vira 2 retângulos que cobrem os 75 m², o maior primeiro (50 m²)', () => {
    const rs = retangulosDoContorno(L);
    expect(rs).toHaveLength(2);
    expect(rs.reduce((s, r) => s + areaDoRetangulo(r), 0)).toBe(75e6);
    expect(areaDoRetangulo(rs[0])).toBe(50e6);
  });

  it('retângulo = 1 peça; U = 3 peças cobrindo a área; horário dá o mesmo', () => {
    expect(retangulosDoContorno([point(0, 0), point(8000, 0), point(8000, 6000), point(0, 6000)])).toEqual([{ x0: 0, x1: 8000, y0: 0, y1: 6000 }]);
    const U = [point(0, 0), point(9000, 0), point(9000, 6000), point(6000, 6000), point(6000, 3000), point(3000, 3000), point(3000, 6000), point(0, 6000)];
    const rs = retangulosDoContorno(U);
    expect(rs.reduce((s, r) => s + areaDoRetangulo(r), 0)).toBe(9000 * 6000 - 3000 * 3000);
    expect(rs.length).toBeLessThanOrEqual(3);
    expect(retangulosDoContorno([...L].reverse()).reduce((s, r) => s + areaDoRetangulo(r), 0)).toBe(75e6);
  });

  it('oblíquo não é ortogonal e não decompõe', () => {
    const torto = [point(0, 0), point(10000, 1000), point(9000, 8000), point(0, 7000)];
    expect(ehOrtogonal(torto)).toBe(false);
    expect(retangulosDoContorno(torto)).toEqual([]);
  });
});

describe('contorno — borda e normal externa', () => {
  it('lado de baixo do L olha para o SUL; o trecho de cima da ala direita olha para o NORTE (anti-horário ou horário)', () => {
    expect(trechosNaBorda(point(2000, 0), point(8000, 0), L)).toEqual([{ a: { x: 2000, y: 0 }, b: { x: 8000, y: 0 }, lado: 'S' }]);
    expect(trechosNaBorda(point(4000, 5000), point(10000, 5000), L)).toEqual([{ a: { x: 5000, y: 5000 }, b: { x: 10000, y: 5000 }, lado: 'N' }]);
    expect(trechosNaBorda(point(4000, 5000), point(10000, 5000), [...L].reverse())[0].lado).toBe('N');
    expect(trechosNaBorda(point(10000, 1000), point(10000, 4000), L)[0].lado).toBe('L');
    expect(trechosNaBorda(point(0, 1000), point(0, 4000), L)[0].lado).toBe('O');
  });

  it('subtrair a borda deixa só a parte interna (a parede interna do canto do L)', () => {
    // y = 5000 de x 0 a 10000: de 5000 a 10000 é borda; de 0 a 5000, interno.
    expect(subtrairBorda(point(0, 5000), point(10000, 5000), L)).toEqual([{ a: { x: 0, y: 5000 }, b: { x: 5000, y: 5000 } }]);
    expect(subtrairBorda(point(2000, 0), point(8000, 0), L)).toEqual([]);
    expect(subtrairBorda(point(3000, 1000), point(3000, 9000), L)).toEqual([{ a: { x: 3000, y: 1000 }, b: { x: 3000, y: 9000 } }]);
  });
});
