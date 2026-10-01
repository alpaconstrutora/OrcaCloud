/**
 * Harness dos EXTINTORES (E7.1, 01/10/2026): o `BlueprintCanvas` REAL com o
 * andar do teste (corredor de 60 × 2 m, dez salas de 6 × 6 m, a 1 é cozinha e
 * a 10 casa de máquinas) e os extintores da PROPOSTA (risco médio, 20 m) já
 * aplicados. Mostra o símbolo e onde a proposta põe cada um.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_EXTINTORES_PADRAO as HE, analisarExtintores, proporExtintores } from '../../../utils/blueprintExtintores';

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
const l = m.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
const cmds: Command[] = [w(0, 0, 60000, 0), w(60000, 0, 60000, 8000), w(60000, 8000, 0, 8000), w(0, 8000, 0, 0)];
for (let k = 0; k < 10; k++) cmds.push(w(k * 6000, 2000, (k + 1) * 6000, 2000));
for (let k = 1; k < 10; k++) cmds.push(w(k * 6000, 2000, k * 6000, 8000));
m = applyBatch(m, cmds).model;
m = applyBatch(m, m.walls.filter((x) => x.a.y === 2000 && x.b.y === 2000).map((x) => ({ type: 'AddOpening', wallId: x.id, kind: 'door', offsetMm: 2500, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command)).model;
m = applyBatch(m, m.spaces.map((s) => {
  const k = Math.round(Math.min(...s.ring.map((p) => p.x)) / 6000) + 1;
  return { type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? 'Corredor' : k === 1 ? 'Cozinha' : k === 10 ? 'Casa de máquinas' : `Sala ${k}` } as Command;
})).model;
const p = proporExtintores(m, analisarExtintores(m, 'MEDIA', HE), HE);
m = applyBatch(m, p.comandos).model;
const depois = analisarExtintores(m, 'MEDIA', HE);
document.getElementById('dump')!.textContent = JSON.stringify({ lancados: p.pontos.map((x) => x.at), semCobertura: p.semCobertura, todosAtendem: depois.ambientes.every((a) => a.atende), pior: Math.max(...depois.ambientes.map((a) => a.distanciaM ?? 999)).toFixed(1) }, null, 1);
createRoot(document.getElementById('raiz')!).render(
  <BlueprintCanvas model={m} tool="selecionar" levelId={l} selectedIds={[]} onSelecionar={() => {}} onAddWall={() => null} alinhamento="EIXO" onInverterLado={() => {}} />,
);
