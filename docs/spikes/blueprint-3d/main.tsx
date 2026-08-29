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
  m = comLote(m, terreoId);
  return { model: m, terreoId };
}

/**
 * Lote 16 × 12 m em volta da casa (que ocupa 8 × 5), recuada 3 m da frente.
 * As divisas são `TERRENO` — é o que `medirTerreno` reconhece como lote.
 */
function comLote(model: BlueprintModel, levelId: string): BlueprintModel {
  const cantos: [number, number][] = [
    [-4000, -3000],
    [12000, -3000],
    [12000, 9000],
    [-4000, 9000],
  ];
  const cmds: Command[] = cantos.map((a, i) => {
    const b = cantos[(i + 1) % cantos.length];
    return {
      type: 'AddBoundary',
      levelId,
      a: point(a[0], a[1]),
      b: point(b[0], b[1]),
      kind: 'TERRENO',
    };
  });
  return applyBatch(model, cmds).model;
}

/**
 * O LOTE REAL do estudo "Planta 23/08/2026", copiado do `draft_payload`.
 *
 * Existe porque o retângulo sintético acima desenhava certo e o lote de
 * produção não aparecia. As duas diferenças que ele carrega: coordenadas longe
 * da origem (y de −43 m a −18 m) e uma divisa de 10 mm — sim, DEZ milímetros —
 * entre dois vértices quase coincidentes. `?lote=real` reproduz isso.
 */
function comLoteReal(model: BlueprintModel, levelId: string): BlueprintModel {
  const arestas: [number, number, number, number][] = [
    [17020, -43280, 27020, -43280],
    [17020, -18260, 17020, -43280],
    [17020, -18250, 17020, -18260],
    [27020, -43280, 27020, -18250],
    [27020, -18250, 17020, -18250],
  ];
  return applyBatch(
    model,
    arestas.map(([ax, ay, bx, by]) => ({
      type: 'AddBoundary',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      kind: 'TERRENO',
    })),
  ).model;
}

/** Paredes na posição real da casa daquele estudo, para o lote não ficar solto. */
function casaNoLoteReal(model: BlueprintModel, levelId: string): BlueprintModel {
  const cantos: [number, number][] = [
    [17095, -38080],
    [26945, -38080],
    [26945, -18355],
    [17095, -18355],
  ];
  return applyBatch(
    model,
    cantos.map((a, i) => {
      const b = cantos[(i + 1) % cantos.length];
      return {
        type: 'AddWall',
        levelId,
        a: point(a[0], a[1]),
        b: point(b[0], b[1]),
        thicknessMm: T,
        heightMm: H,
      };
    }),
  ).model;
}

function construirLoteReal(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const terreoId = base.model.levels[0].id;
  let m = casaNoLoteReal(base.model, terreoId);
  m = comLoteReal(m, terreoId);
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
const { model, terreoId } =
  params.get('lote') === 'real'
    ? construirLoteReal()
    : stress > 0
      ? construirStress(stress)
      : construirCasa();
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
          mostrarTerreno={params.get('terreno') === '1'}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
