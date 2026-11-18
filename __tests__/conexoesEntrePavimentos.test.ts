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
});
