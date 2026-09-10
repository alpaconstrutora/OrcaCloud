/**
 * HARNESS VISUAL do eletroduto em "L" no 3D (10/09/2026).
 *
 * O caminho em L foi implementado e provado por geometria
 * (`blueprintEletrodutoCaminho.test.ts`), mas NUNCA olhado no viewer — e o
 * viewer é `@ts-nocheck`. Uma sala, uma tomada a 300, uma luminária a 2.800 e o
 * eletroduto entre elas: tem de SUBIR pela parede e correr pelo teto, e não
 * atravessar o cômodo em diagonal.
 *
 *   npx vite --port 3141 → http://localhost:3141/docs/spikes/eletroduto-3d/index.html
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type Command } from '../../../utils/blueprintKernel';

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const t = base.levels[0].id;
const p = (ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
let m = applyBatch(base, [p(0, 0, 5000, 0), p(5000, 0, 5000, 4000), p(5000, 4000, 0, 4000), p(0, 4000, 0, 0)]).model;
m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600 }).model;
m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: point(2500, 75), cotaMm: 300, tipoEletrico: 'TUG' }).model;
m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Luz', at: point(2500, 2000), cotaMm: 2800, tipoEletrico: 'ILUMINACAO_TETO' }).model;
// Quadro → tomada (corre a 300 pela parede, sobe no quadro) e tomada → luz (sobe na tomada, corre no teto).
m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(75, 1000), b: point(2500, 75), cotaAMm: 1600, cotaBMm: 300, bitolaMm: 25 }).model;
m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(2500, 75), b: point(2500, 2000), cotaAMm: 300, cotaBMm: 2800, bitolaMm: 25 }).model;
m = recomputeSpaces(m);

createRoot(document.getElementById('raiz')!).render(
  <div style={{ height: '100vh' }}>
    <Blueprint3DViewer model={m} mostrarLaje={false} mostrarArestas />
  </div>,
);
