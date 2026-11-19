/**
 * As CONEXÕES derivadas entre pavimentos (`conexoesDerivadas`, utils/blueprintKernel/conexoes.ts) usam a mesma descida
 * pela cota da chave da rede (PE6b, 18/11/2026; revisão do PR #584): o recalque do esgoto que sobe do −3 até a rua tem o
 * trecho do lote a −6000 — a ponta dele é o teto da garagem, três pavimentos abaixo, e não uma ponta aberta.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, conexoesDerivadas, emptyModel, type Command } from '../utils/blueprintKernel';

describe('conexões — a descida pela cota atravessa pavimentos', () => {
  it('o trecho do lote a −6000 encontra o topo do trecho da garagem do −3 (sem ponta aberta entre eles)', () => {
    let m = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Lote', elevationMm: 0, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: '−1', elevationMm: -3000, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: '−2', elevationMm: -6000, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: '−3', elevationMm: -9000, defaultHeightMm: 3000 },
    ] as Command[]).model;
    const [lote, , , g3] = m.levels.map((l) => l.id);
    const P = { x: 1000, y: 1000 };
    m = applyBatch(m, [
      { type: 'AddTrecho', levelId: g3, disciplina: 'ESGOTO', a: P, b: P, cotaAMm: 300, cotaBMm: 3000, bitolaMm: 75 },
      { type: 'AddTrecho', levelId: lote, disciplina: 'ESGOTO', a: P, b: P, cotaAMm: -6000, cotaBMm: -600, bitolaMm: 75 },
    ] as Command[]).model;
    const abertas = conexoesDerivadas(m).pontasAbertas;
    // A junção (o teto do −3 = o −6000 do lote) não é ponta aberta.
    expect(abertas.filter((x) => (x as { levelId: string; cotaMm?: number }).levelId === g3 && (x as { cotaMm?: number }).cotaMm === 3000)).toEqual([]);
    expect(abertas).toHaveLength(2); // só as duas pontas de fora: o pé no −3 (300) e o topo no lote (−600)
  });

  // PE8a (19/11/2026): torres com pé-direito diferente — o 0 desce à torre do ponto (as pegadas das paredes).
  it('pé-direito diferente: a prumada da Torre B (−2880) encontra o trecho do lote, sem ponta aberta na laje', () => {
    let m = applyBatch(emptyModel(), [
      { type: 'AddLevel', name: 'Lote', elevationMm: 0, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: 'Garagem A', elevationMm: -2700, defaultHeightMm: 2700 },
      { type: 'AddLevel', name: '−1 B', elevationMm: -2880, defaultHeightMm: 2880 },
    ] as Command[]).model;
    const [lote, gA, b1] = m.levels.map((l) => l.id);
    const caixa = (levelId: string, x0: number): Command[] => [
      [x0, 0, x0 + 10000, 0], [x0 + 10000, 0, x0 + 10000, 10000], [x0 + 10000, 10000, x0, 10000], [x0, 10000, x0, 0],
    ].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessMm: 150, heightMm: 2700 }) as Command);
    const P = { x: 25000, y: 5000 };
    m = applyBatch(m, [
      ...caixa(gA, 0),
      ...caixa(b1, 20000),
      { type: 'AddTrecho', levelId: b1, disciplina: 'ESGOTO', a: P, b: P, cotaAMm: 300, cotaBMm: 2730, bitolaMm: 100 },
      { type: 'AddTrecho', levelId: lote, disciplina: 'ESGOTO', a: P, b: P, cotaAMm: -150, cotaBMm: 500, bitolaMm: 100 },
    ] as Command[]).model;
    const abertas = conexoesDerivadas(m).pontasAbertas as { levelId: string; cotaMm?: number }[];
    // Só as duas pontas de fora (o pé no −1 da B e o alto no lote) — nada na laje entre eles.
    expect(abertas).toHaveLength(2);
  });
});

