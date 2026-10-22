/**
 * 22/10/2026 — com os textos sem colisão, cada "Ø 25" da planta Garden ganhou lugar próprio e virou
 * ruído. Convenção de prancha: o diâmetro predominante não se escreve (a legenda diz), o diferente
 * se escreve uma vez por trecho contínuo, no pedaço mais longo.
 */
import { describe, expect, it } from 'vitest';
import { diametrosAnotados } from '../utils/blueprintDiametroDosEletrodutos';

const tr = (id: string, ax: number, bx: number, bitolaMm: number, levelId = 'L1', disciplina = 'ELETRICA') => ({
  id,
  levelId,
  disciplina: disciplina as 'ELETRICA',
  a: { x: ax, y: 0 },
  b: { x: bx, y: 0 },
  bitolaMm,
});

describe('diametrosAnotados', () => {
  it('o predominante (maior comprimento somado) não se escreve; o diferente, uma vez por trecho contínuo, no pedaço mais longo', () => {
    const r = diametrosAnotados([
      tr('a', 0, 3000, 25),
      tr('b', 3000, 6000, 25),
      // Um trecho contínuo de Ø40 em três pedaços: só o do meio (o mais longo) escreve.
      tr('c', 10000, 10500, 40),
      tr('d', 10500, 12000, 40),
      tr('e', 12000, 12300, 40),
      // Um Ø40 solto, longe: escreve o seu.
      tr('f', 20000, 20400, 40),
      // Encostado no tronco de Ø40, um Ø32: outro diâmetro, outro texto.
      tr('g', 12300, 12800, 32),
    ]);
    expect(r.padraoMm).toBe(25);
    expect([...r.escrever].sort()).toEqual(['d', 'f', 'g']);
  });

  it('pavimentos diferentes não se encadeiam, e o que não é elétrico não conta', () => {
    const r = diametrosAnotados([tr('a', 0, 5000, 25), tr('b', 0, 1000, 40, 'L1'), tr('c', 1000, 2000, 40, 'L2'), tr('h', 0, 99999, 100, 'L1', 'ESGOTO')]);
    expect(r.padraoMm).toBe(25);
    expect([...r.escrever].sort()).toEqual(['b', 'c']);
  });

  it('sem eletroduto: nada a escrever', () => {
    expect(diametrosAnotados([])).toEqual({ padraoMm: null, escrever: new Set() });
  });
});
