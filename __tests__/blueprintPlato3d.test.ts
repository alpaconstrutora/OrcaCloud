/**
 * As contas puras da edição do platô no 3D (25/11/2026, P3 do platô desenhado): mover um canto (com trava de
 * 90°), validar o contorno e a cota da seta (passo de 5 cm).
 */
import { describe, expect, it } from 'vitest';
import { anelValido, cotaDaSeta, inserirCanto, moverCanto, removerCanto } from '../utils/blueprintPlato3d';

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
  // Prova em produção (25/11): 1 m de arraste = 1 m de cota deixava a seta sensível demais (lote de 344 m: 50 px ≈
  // +56 m). Normal = 0,2 do arraste; Shift (fino) = 0,02. Sempre arredondado a 5 cm.
  it('gesto normal: 0,2 do deslocamento, arredondado a 5 cm', () => {
    expect(cotaDaSeta(100, 10)).toBe(102);
    expect(cotaDaSeta(45.7, -5.1)).toBe(44.7);
    expect(cotaDaSeta(100, 0.37)).toBe(100.05);
  });
  it('com Shift (fino): 0,02 do deslocamento', () => {
    expect(cotaDaSeta(100, 10, true)).toBe(100.2);
    expect(cotaDaSeta(100, 1, true)).toBe(100);
    expect(cotaDaSeta(100, 50, true)).toBe(101);
  });
});

describe('inserirCanto e removerCanto (25/11: duplo clique num lado / botão direito numa bolinha)', () => {
  it('inserirCanto põe o ponto PROJETADO no lado mais próximo, entre as duas pontas dele', () => {
    // Clique perto do lado de baixo (y = 0), um pouco fora: entra (4000, 0) entre os cantos 0 e 1.
    const r = inserirCanto(RET, { x: 4000.4, y: -300 });
    expect(r).toEqual([RET[0], { x: 4000, y: 0 }, RET[1], RET[2], RET[3]]);
  });
  it('perto do lado de fecho (do último ao primeiro canto), entra no fim', () => {
    const r = inserirCanto(RET, { x: 200, y: 3000 });
    expect(r).toEqual([...RET, { x: 0, y: 3000 }]);
  });
  it('em cima de um canto existente não duplica', () => {
    expect(inserirCanto(RET, { x: 10000, y: 0 })).toEqual(RET);
  });
  it('removerCanto tira o i-ésimo; com 3 cantos não remove (o platô precisa de 3)', () => {
    expect(removerCanto(RET, 1)).toEqual([RET[0], RET[2], RET[3]]);
    const tri = [RET[0], RET[1], RET[2]];
    expect(removerCanto(tri, 0)).toEqual(tri);
  });
});
