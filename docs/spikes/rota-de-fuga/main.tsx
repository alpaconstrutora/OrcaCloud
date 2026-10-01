/**
 * Harness da ROTA DE FUGA (E6.3, 01/10/2026): o `BlueprintCanvas` REAL com o
 * prédio do teste (2 pavimentos 10 × 10 m, caixa da escada em x 6–10, y 0–6,
 * porta da rua no térreo) e as rotas derivadas. `?nivel=0|1` escolhe o
 * pavimento; `?limite=` força um percurso máximo (rota vermelha quando estoura).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { percursoDeFuga } from '../../../utils/blueprintRotaDeFuga';

const q = new URLSearchParams(location.search);
let m = emptyModel();
for (let i = 0; i < 2; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : '1º', elevationMm: 3000 * i, defaultHeightMm: 3000 }).model;
const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
m.levels.forEach((lv, i) => {
  const l = lv.id;
  m = applyBatch(m, [w(l, 0, 0, 6000, 0), w(l, 6000, 0, 10000, 0), w(l, 10000, 0, 10000, 10000), w(l, 10000, 10000, 0, 10000), w(l, 0, 10000, 0, 0), w(l, 6000, 0, 6000, 6000), w(l, 6000, 6000, 10000, 6000)]).model;
  const porta = (wallId: string): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command;
  m = applyCommand(m, porta(m.walls.find((x) => x.levelId === l && x.a.x === 6000 && x.b.x === 6000)!.id)).model;
  if (i === 0) m = applyCommand(m, porta(m.walls.find((x) => x.levelId === l && x.a.y === 0 && x.b.y === 0 && x.a.x === 0)!.id)).model;
});
m = applyCommand(m, { type: 'AddEscada', levelId: m.levels[0].id, pontos: [point(8000, 1000), point(8000, 5000)], larguraMm: 1200, rotulo: 'E1' } as Command).model;
const p = percursoDeFuga(m, 'A', m.levels[0].id, q.get('limite') ? Number(q.get('limite')) : null);
const rotas = p.ambientes.flatMap((a) => a.rota.map((r) => ({ ...r, falta: a.atende === false })));
const nivel = m.levels[Number(q.get('nivel') ?? 1)].id;
document.getElementById('dump')!.textContent = JSON.stringify(p.ambientes.map((a) => ({ amb: a.rotulo || a.spaceId, nivel: m.levels.find((l) => l.id === a.levelId)!.name, m: a.distanciaM?.toFixed(2), escada: a.pelaEscada, origem: a.origem })), null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={nivel} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} rotasDeFuga={rotas} />,
);
