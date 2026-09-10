/**
 * O relevo entra no enquadramento do 3D — em Y também.
 *
 * O lote plano só tocava X/Z, e a caixa centrava em `topo/2` do pé-direito. Com
 * uma colina de 8 m a câmera olharia para a casa e a colina sairia por cima do
 * quadro, sem erro nenhum (a memória do enquadramento cego, 05/09/2026).
 */

import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
import { enquadramentoDoModelo } from '../utils/blueprint3dEnquadramento';
import { malhaDaGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';

function loteComCasa() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const cmds: Command[] = [
    { type: 'AddWall', levelId, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 },
    { type: 'AddBoundary', levelId, a: point(-5000, -5000), b: point(25000, -5000), kind: 'TERRENO' },
    { type: 'AddBoundary', levelId, a: point(25000, -5000), b: point(25000, 25000), kind: 'TERRENO' },
    { type: 'AddBoundary', levelId, a: point(25000, 25000), b: point(-5000, 25000), kind: 'TERRENO' },
    { type: 'AddBoundary', levelId, a: point(-5000, 25000), b: point(-5000, -5000), kind: 'TERRENO' },
  ];
  return applyBatch(base.model, cmds).model;
}

/** Colina: 0 m no canto sudoeste, 8 m no nordeste. */
function colina(): GradeDeElevacao {
  const colunas = 4;
  const linhas = 4;
  const cotasM: number[] = [];
  for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) cotasM.push(100 + (l + c) * (8 / 6));
  return { origem: { x: -5000, y: -5000 }, espacamentoMm: 10000, colunas, linhas, cotasM };
}

describe('enquadramento 3d · relevo', () => {
  it('sem relevo a conta é a de sempre', () => {
    const m = loteComCasa();
    expect(enquadramentoDoModelo(m, true, null)).toEqual(enquadramentoDoModelo(m, true));
  });

  it('a colina entra em Y: o topo sobe até 8 m', () => {
    const m = loteComCasa();
    const malha = malhaDaGrade(colina(), 100)!;
    const sem = enquadramentoDoModelo(m, true);
    const com = enquadramentoDoModelo(m, true, malha);
    expect(com.alturaTopo).toBeCloseTo(8, 6);
    expect(com.alturaTopo).toBeGreaterThan(sem.alturaTopo);
    expect(com.raio[1]).toBeGreaterThan(sem.raio[1]);
    expect(com.spread).toBeGreaterThanOrEqual(sem.spread);
  });

  it('com o terreno DESLIGADO o relevo não conta, mesmo se vier', () => {
    const m = loteComCasa();
    const malha = malhaDaGrade(colina(), 100)!;
    expect(enquadramentoDoModelo(m, false, malha)).toEqual(enquadramentoDoModelo(m, false));
  });
});
