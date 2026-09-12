/**
 * Walk no relevo e câmera de sombra (fase 2 da topografia, 10/09/2026).
 */
import { describe, expect, it } from 'vitest';
import { ALTURA_DO_OLHO_M, alturaDoOlho } from '../utils/blueprint3dWalk';
import { sombraDaCena } from '../utils/blueprint3dEnquadramento';

describe('alturaDoOlho', () => {
  it('sem relevo, o olho fica a 1,6 m do zero — como sempre', () => {
    expect(alturaDoOlho(null)).toBe(ALTURA_DO_OLHO_M);
  });
  it('com relevo, acompanha o chão: subir 3 m sobe o olho 3 m', () => {
    expect(alturaDoOlho(3)).toBeCloseTo(3 + ALTURA_DO_OLHO_M, 9);
    expect(alturaDoOlho(-2)).toBeCloseTo(-2 + ALTURA_DO_OLHO_M, 9);
  });
});

describe('sombraDaCena', () => {
  it('cresce com a cena e nunca fica menor que uma casa', () => {
    expect(sombraDaCena(6).meia).toBe(8);
    expect(sombraDaCena(60).meia).toBeCloseTo(45, 9);
    expect(sombraDaCena(60).far).toBeGreaterThan(60);
  });
  it('mapa maior só na cena grande', () => {
    expect(sombraDaCena(12).mapa).toBe(2048);
    expect(sombraDaCena(80).mapa).toBe(4096);
  });
});

describe('amostradorDoChao (fase 14: sem degrau ao sair do lote)', () => {
  // Grade 3×3 de 1 m: cota = 100 + x (em m), plana em y.
  const grade = {
    origem: { x: 0, y: 0 },
    espacamentoMm: 1000,
    colunas: 3,
    linhas: 3,
    cotasM: [100, 101, 102, 100, 101, 102, 100, 101, 102],
  };
  it('dentro da grade é a bilinear de sempre; fora, a cota do nó válido mais próximo', async () => {
    const { amostradorDaGrade, amostradorDoChao } = await import('../utils/blueprintTopografia');
    const grade_ = amostradorDaGrade(grade);
    const chao = amostradorDoChao(grade);
    expect(chao({ x: 500, y: 500 })).toBeCloseTo(100.5, 9);
    expect(chao({ x: 500, y: 500 })).toBe(grade_({ x: 500, y: 500 }));
    // Fora pela esquerda/direita: a cota da borda (100 / 102), não null nem zero.
    expect(grade_({ x: -800, y: 1000 })).toBeNull();
    expect(chao({ x: -800, y: 1000 })).toBe(100);
    expect(chao({ x: 5000, y: 1000 })).toBe(102);
    // Fora por cima e por baixo, e na diagonal: o canto.
    expect(chao({ x: 1000, y: -3000 })).toBe(101);
    expect(chao({ x: 9000, y: 9000 })).toBe(102);
    // A altura do olho é contínua ao cruzar a divisa.
    const { alturaDoOlho } = await import('../utils/blueprint3dWalk');
    expect(alturaDoOlho(chao({ x: 1999, y: 1000 })!)).toBeCloseTo(alturaDoOlho(chao({ x: 2001, y: 1000 })!), 2);
  });
  it('sobre nodata (a margem da grade que a triangulação não cobre) vale o nó válido mais próximo; grade vazia dá null', async () => {
    const { amostradorDaGrade, amostradorDoChao } = await import('../utils/blueprintTopografia');
    // Coluna 0 inteira sem dado: é a margem à esquerda do lote.
    const margem = { ...grade, cotasM: [null, 101, 102, null, 101, 102, null, 101, 102] };
    expect(amostradorDaGrade(margem)({ x: 200, y: 1000 })).toBeNull();
    expect(amostradorDoChao(margem)({ x: 200, y: 1000 })).toBe(101);
    expect(amostradorDoChao(margem)({ x: -5000, y: 1000 })).toBe(101);
    const vazia = { ...grade, cotasM: Array(9).fill(null) };
    expect(amostradorDoChao(vazia)({ x: 500, y: 500 })).toBeNull();
  });
});
