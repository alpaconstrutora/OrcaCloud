/**
 * Harness isolado da VISTA 3D.
 *
 * Monta o `Blueprint3DViewer` REAL (via a aba lazy) com um modelo fixo de dois
 * pavimentos, planta em "L", porta e janela. `?paredes=N` gera uma cena de
 * stress com ~N paredes para medir fps. `?niveis=terreo` mostra só o térreo.
 *
 * Abrir em: /docs/spikes/blueprint-3d/index.html?laje=1&arestas=1
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const T = 150;
const H = 2800;

function pavimento(model: BlueprintModel, levelId: string): BlueprintModel {
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  const m = applyBatch(model, [
    w(0, 0, 8000, 0),
    w(8000, 0, 8000, 3000),
    w(8000, 3000, 5000, 3000),
    w(5000, 3000, 5000, 5000),
    w(5000, 5000, 0, 5000),
    w(0, 5000, 0, 0),
    w(3000, 0, 3000, 5000),
  ]).model;
  const fachada = m.walls.find((x) => x.levelId === levelId && x.a.y === 0 && x.b.y === 0)!;
  return applyBatch(m, [
    { type: 'AddOpening', wallId: fachada.id, kind: 'door', offsetMm: 700, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: fachada.id, kind: 'window', offsetMm: 4200, widthMm: 1600, heightMm: 1200, sillMm: 1000 },
  ]).model;
}

function construirCasa(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  const terreoId = base.model.levels[0].id;
  let m = pavimento(base.model, terreoId);
  m = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: H, defaultHeightMm: H }).model;
  m = pavimento(m, m.levels[1].id);
  return { model: m, terreoId };
}

function construirStress(alvo: number): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  const terreoId = base.model.levels[0].id;
  const cmds: Command[] = [];
  const lado = Math.ceil(Math.sqrt(alvo / 2));
  const s = 3000;
  for (let i = 0; i <= lado; i++) {
    for (let j = 0; j < lado; j++) {
      cmds.push({ type: 'AddWall', levelId: terreoId, a: point(j * s, i * s), b: point((j + 1) * s, i * s), thicknessMm: T, heightMm: H });
      cmds.push({ type: 'AddWall', levelId: terreoId, a: point(i * s, j * s), b: point(i * s, (j + 1) * s), thicknessMm: T, heightMm: H });
    }
  }
  return { model: applyBatch(base.model, cmds).model, terreoId };
}

const params = new URLSearchParams(location.search);
const stress = Number(params.get('paredes') || 0);
const { model, terreoId } = stress > 0 ? construirStress(stress) : construirCasa();
const soTerreo = params.get('niveis') === 'terreo';

function App() {
  return (
    <>
      <div id="barra">
        Paredes: {model.walls.length} · Pavimentos: {model.levels.length}
        {stress > 0 && ' · STRESS'}
      </div>
      <div id="tela">
        <Blueprint3DTab
          model={model}
          levelIds={soTerreo ? [terreoId] : undefined}
          mostrarLaje={params.get('laje') === '1'}
          mostrarArestas={params.get('arestas') !== '0'}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
