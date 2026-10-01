/**
 * Harness da SINALIZAÇÃO (E7.2, 01/10/2026): o `BlueprintCanvas` REAL com o
 * prédio da rota de fuga (2 pavimentos, caixa da escada, porta da rua), um
 * extintor e um hidrante no térreo, e a PROPOSTA de sinalização aplicada:
 * placa de cada equipamento e placas de rota (seta virada, "saída" na porta).
 * `?nivel=0|1`.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { percursoDeFuga } from '../../../utils/blueprintRotaDeFuga';
import { analisarSinalizacao, proporSinalizacao } from '../../../utils/blueprintSinalizacao';

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
const t0 = m.levels[0].id;
m = applyBatch(m, [
  { type: 'AddEscada', levelId: t0, pontos: [point(8000, 1000), point(8000, 5000)], larguraMm: 1200, rotulo: 'E1' } as Command,
  { type: 'AddTerminal', levelId: t0, disciplina: 'INCENDIO', tipo: 'EXTINTOR', tipoHidraulico: 'EXTINTOR', at: point(500, 5000), cotaMm: 1600, agenteExtintor: 'PQS_ABC' } as Command,
  { type: 'AddTerminal', levelId: t0, disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES', tipoHidraulico: 'HIDRANTE_SIMPLES', at: point(500, 8000), cotaMm: 1300 } as Command,
]).model;
const p = percursoDeFuga(m, 'A', t0);
m = applyBatch(m, proporSinalizacao(m, analisarSinalizacao(m, p, t0))).model;
const nivel = m.levels[Number(q.get('nivel') ?? 0)].id;
document.getElementById('dump')!.textContent = JSON.stringify(m.terminais!.filter((t) => t.tipoHidraulico === 'PLACA').map((t) => ({ cod: t.codigoPlaca, at: t.at, rot: t.rotacaoGraus ?? 0, nivel: m.levels.find((l) => l.id === t.levelId)!.name })), null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={nivel} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} rotasDeFuga={p.ambientes.flatMap((a) => a.rota.map((r) => ({ ...r, falta: false })))} />,
);
