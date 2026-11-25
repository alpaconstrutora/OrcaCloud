/**
 * As contas puras da edição do platô no 3D (25/11/2026, P3 do platô desenhado): mover um canto (com trava de
 * 90°), validar o contorno e a cota da seta (passo de 5 cm).
 */
import { describe, expect, it } from 'vitest';
import { anelValido, cotaDaSeta, moverCanto } from '../utils/blueprintPlato3d';

const RET = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 6000 },
  { x: 0, y: 6000 },
];

describe('moverCanto', () => {
  it('move só o i-ésimo canto, arredondado a mm', () => {
    const r = moverCanto(RET, 2, { x: 12000.4, y: 7000.6 }, false);
    expect(r).toEqual([RET[0], RET[1], { x: 12000, y: 7001 }, RET[3]]);
    expect(RET[2]).toEqual({ x: 10000, y: 6000 }); // não muta
  });

  it('com a trava, alinha ao vizinho mais próximo do destino (como a trava de 90° da planta)', () => {
    // Perto do vizinho de baixo (10000, 0): fica na vertical dele.
    expect(moverCanto(RET, 2, { x: 10400, y: 1500 }, true)[2]).toEqual({ x: 10000, y: 1500 });
    // Perto do vizinho da esquerda (0, 6000): fica na horizontal dele.
    expect(moverCanto(RET, 2, { x: 2000, y: 6300 }, true)[2]).toEqual({ x: 2000, y: 6000 });
  });
});

describe('anelValido', () => {
  it('aceita o retângulo; recusa o contorno que se cruza (gravata)', () => {
    expect(anelValido(RET)).toBe(true);
    expect(anelValido([RET[0], RET[2], RET[1], RET[3]])).toBe(false);
  });
  it('recusa menos de 3 cantos distintos', () => {
    expect(anelValido([RET[0], RET[1], RET[1]])).toBe(false);
    expect(anelValido([RET[0], RET[1]])).toBe(false);
  });
});

describe('cotaDaSeta', () => {
  it('soma o deslocamento vertical e arredonda a 5 cm', () => {
    expect(cotaDaSeta(100, 0.37)).toBe(100.35);
    expect(cotaDaSeta(100, 0.38)).toBe(100.4);
    expect(cotaDaSeta(45.7, -1.02)).toBe(44.7);
  });
});
